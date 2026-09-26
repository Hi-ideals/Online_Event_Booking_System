import { query } from '../config/db.js';

/**
 * Records a sensitive action. `db` may be a transaction client so the log commits with the change.
 * Audit failures are logged but never break the main request.
 */
export async function audit({ actorId, action, entityType, entityId, metadata = {}, ip }, db) {
  const sql = `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
               VALUES ($1, $2, $3, $4, $5, $6)`;
  const params = [actorId ?? null, action, entityType, entityId ? String(entityId) : null, metadata, ip ?? null];
  try {
    if (db) await db.query(sql, params);
    else await query(sql, params);
  } catch (err) {
    if (db) throw err;
    console.error('Audit log failed:', err.message);
  }
}
