import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { queueEmail } from '../notifications/notifications.service.js';
import { findPublicUserById, listUsers } from '../users/users.repository.js';

export { listUsers };

export function listOrganizers(filters) {
  return listUsers({ ...filters, role: 'organizer' });
}

async function lockOrganizer(db, id) {
  const { rows } = await db.query(`SELECT id, status FROM users WHERE id = $1 AND role = 'organizer' FOR UPDATE`, [id]);
  if (!rows[0]) throw ApiError.notFound('Organizer not found');
  return rows[0];
}

export async function approveOrganizer(adminId, organizerId, ip) {
  return withTransaction(async (db) => {
    const organizer = await lockOrganizer(db, organizerId);
    if (organizer.status === 'active') throw ApiError.conflict('Organizer is already approved');
    if (organizer.status === 'suspended') throw ApiError.conflict('Organizer is suspended; reactivate the account instead');

    await db.query(`UPDATE users SET status = 'active' WHERE id = $1`, [organizerId]);
    await db.query(
      `UPDATE organizer_profiles SET reviewed_by = $1, reviewed_at = NOW(), rejection_reason = NULL WHERE user_id = $2`,
      [adminId, organizerId]
    );
    await audit({ actorId: adminId, action: 'organizer.approved', entityType: 'user', entityId: organizerId, ip }, db);
    const user = await findPublicUserById(organizerId, db);
    await queueEmail(db, { template: 'organizer_approved', to: user.email, payload: { name: user.name } });
    return user;
  });
}

export async function rejectOrganizer(adminId, organizerId, reason, ip) {
  return withTransaction(async (db) => {
    const organizer = await lockOrganizer(db, organizerId);
    if (organizer.status !== 'pending_approval') {
      throw ApiError.conflict('Only organizers awaiting approval can be rejected');
    }
    await db.query(`UPDATE users SET status = 'rejected' WHERE id = $1`, [organizerId]);
    await db.query(
      `UPDATE organizer_profiles SET reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2 WHERE user_id = $3`,
      [adminId, reason, organizerId]
    );
    await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [organizerId]);
    await audit({ actorId: adminId, action: 'organizer.rejected', entityType: 'user', entityId: organizerId,
      metadata: { reason }, ip }, db);
    const user = await findPublicUserById(organizerId, db);
    await queueEmail(db, { template: 'organizer_rejected', to: user.email, payload: { name: user.name, reason } });
    return user;
  });
}

export async function updateUserStatus(adminId, userId, { status, reason }, ip) {
  if (adminId === userId) throw ApiError.badRequest('You cannot change your own account status');

  return withTransaction(async (db) => {
    const { rows } = await db.query('SELECT id, role, status FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = rows[0];
    if (!user) throw ApiError.notFound('User not found');
    if (user.status === status) throw ApiError.conflict(`User is already ${status}`);
    if (status === 'active' && user.status !== 'suspended') {
      throw ApiError.conflict('Use the organizer approval endpoint for pending or rejected organizers');
    }

    await db.query('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
    if (status === 'suspended') {
      await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    }
    await audit({ actorId: adminId, action: status === 'suspended' ? 'user.suspended' : 'user.reactivated',
      entityType: 'user', entityId: userId, metadata: { reason, previousStatus: user.status }, ip }, db);
    return findPublicUserById(userId, db);
  });
}

export async function createAdmin(actorId, { name, email, password }, ip) {
  const existing = await query('SELECT 1 FROM users WHERE LOWER(email) = $1', [email]);
  if (existing.rowCount) throw ApiError.conflict('An account with this email already exists');

  const hash = await bcrypt.hash(password, 12);
  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, role, status) VALUES ($1, $2, $3, 'admin', 'active') RETURNING id`,
      [name, email, hash]
    );
    await audit({ actorId, action: 'admin.created', entityType: 'user', entityId: rows[0].id, ip }, db);
    return findPublicUserById(rows[0].id, db);
  });
}

export async function listAuditLogs({ entityType, entityId, actorId, page, limit }) {
  const where = [];
  const params = [];
  for (const [column, value] of [['a.entity_type', entityType], ['a.entity_id', entityId], ['a.actor_id', actorId]]) {
    if (!value) continue;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const count = await query(`SELECT COUNT(*)::int AS total FROM audit_logs a ${whereSql}`, params);
  const { rows } = await query(
    `SELECT a.id, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId", a.metadata,
            a.ip_address AS "ipAddress", a.created_at AS "createdAt",
            CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.role) END AS actor
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows, total: count.rows[0].total };
}
