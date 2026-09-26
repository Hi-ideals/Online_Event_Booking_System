import { query } from '../../config/db.js';

const PUBLIC_USER_COLUMNS = `
  u.id, u.name, u.email, u.phone, u.role, u.status, u.last_login_at, u.created_at,
  CASE WHEN op.user_id IS NULL THEN NULL ELSE json_build_object(
    'organizationName', op.organization_name,
    'contactPhone', op.contact_phone,
    'website', op.website,
    'address', op.address,
    'city', op.city,
    'gstNumber', op.gst_number,
    'description', op.description,
    'payoutDetails', op.payout_details,
    'commissionPercent', op.commission_percent::float8,
    'reviewedAt', op.reviewed_at,
    'rejectionReason', op.rejection_reason
  ) END AS organizer_profile`;

export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    organizerProfile: row.organizer_profile ?? null,
  };
}

export async function findPublicUserById(id, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_USER_COLUMNS}
       FROM users u LEFT JOIN organizer_profiles op ON op.user_id = u.id
      WHERE u.id = $1`,
    [id]
  );
  return toPublicUser(rows[0]);
}

export async function listUsers({ role, status, search, page, limit }) {
  const where = [];
  const params = [];
  if (role) {
    params.push(role);
    where.push(`u.role = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`u.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR op.organization_name ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM users u LEFT JOIN organizer_profiles op ON op.user_id = u.id';

  const countResult = await query(`SELECT COUNT(*)::int AS total ${from} ${whereSql}`, params);
  const { rows } = await query(
    `SELECT ${PUBLIC_USER_COLUMNS} ${from} ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows.map(toPublicUser), total: countResult.rows[0].total };
}
