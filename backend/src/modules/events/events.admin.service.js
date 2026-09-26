// Platform-wide event oversight for admins.
import { withTransaction } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { findEventWithTiers, pagedEvents } from './events.repository.js';

export async function listEvents({ status, organizerId, categoryId, blocked, featured, search, page, limit }) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('$?', `$${params.length}`));
  };
  if (status) add('e.status = $?', status);
  if (organizerId) add('e.organizer_id = $?', organizerId);
  if (categoryId) add('e.category_id = $?', categoryId);
  if (blocked !== undefined) add('e.is_blocked = $?', blocked);
  if (featured !== undefined) add('e.is_featured = $?', featured);
  if (search) add(`(e.title ILIKE '%' || $? || '%')`, search);
  return pagedEvents({ where, params, orderBy: '"createdAt" DESC', page, limit });
}

export async function getEvent(eventId) {
  const event = await findEventWithTiers(eventId);
  if (!event) throw ApiError.notFound('Event not found');
  return event;
}

async function lockEvent(db, eventId) {
  const { rows } = await db.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [eventId]);
  if (!rows[0]) throw ApiError.notFound('Event not found');
  return rows[0];
}

export async function setFeatured(adminId, eventId, isFeatured, ip) {
  return withTransaction(async (db) => {
    const event = await lockEvent(db, eventId);
    if (isFeatured && (event.status !== 'published' || event.is_blocked)) {
      throw ApiError.conflict('Only published, unblocked events can be featured');
    }
    await db.query('UPDATE events SET is_featured = $1 WHERE id = $2', [isFeatured, eventId]);
    await audit({ actorId: adminId, action: isFeatured ? 'event.featured' : 'event.unfeatured', entityType: 'event',
      entityId: eventId, ip }, db);
    return findEventWithTiers(eventId, {}, db);
  });
}

export async function blockEvent(adminId, eventId, reason, ip) {
  return withTransaction(async (db) => {
    const event = await lockEvent(db, eventId);
    if (event.is_blocked) throw ApiError.conflict('Event is already blocked');
    await db.query(
      `UPDATE events SET is_blocked = TRUE, is_featured = FALSE, blocked_reason = $1, blocked_by = $2, blocked_at = NOW() WHERE id = $3`,
      [reason, adminId, eventId]
    );
    await audit({ actorId: adminId, action: 'event.blocked', entityType: 'event', entityId: eventId, metadata: { reason }, ip }, db);
    return findEventWithTiers(eventId, {}, db);
  });
}

export async function unblockEvent(adminId, eventId, ip) {
  return withTransaction(async (db) => {
    const event = await lockEvent(db, eventId);
    if (!event.is_blocked) throw ApiError.conflict('Event is not blocked');
    await db.query(
      `UPDATE events SET is_blocked = FALSE, blocked_reason = NULL, blocked_by = NULL, blocked_at = NULL WHERE id = $1`,
      [eventId]
    );
    await audit({ actorId: adminId, action: 'event.unblocked', entityType: 'event', entityId: eventId, ip }, db);
    return findEventWithTiers(eventId, {}, db);
  });
}
