import { query, withTransaction } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { toPaise, toRupees } from '../../utils/money.js';
import { queueEmail } from '../notifications/notifications.service.js';
import { getPaymentProvider } from './providers/index.js';

const MAX_ATTEMPTS = 5;

/**
 * Records a refund for an order's captured payment, inside the caller's transaction.
 * Returns null when nothing needs refunding (free booking or zero amount).
 * The gateway call happens later in processPendingRefunds, after the transaction commits.
 */
export async function createRefund(db, { orderId, amount, type, reason, actorId }) {
  if (!(amount > 0)) return null;
  const { rows } = await db.query(
    `SELECT id, amount FROM payments WHERE order_id = $1 AND status = 'captured' ORDER BY captured_at LIMIT 1`,
    [orderId]
  );
  const payment = rows[0];
  if (!payment) return null;

  const { rows: [{ refunded }] } = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS refunded FROM refunds WHERE payment_id = $1 AND status <> 'failed'`,
    [payment.id]
  );
  const refundable = toRupees(Math.min(toPaise(amount), toPaise(payment.amount) - toPaise(refunded)));
  if (refundable <= 0) return null;

  const { rows: [refund] } = await db.query(
    `INSERT INTO refunds (order_id, payment_id, type, amount, reason, initiated_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [orderId, payment.id, type, refundable, reason ?? null, actorId ?? null]
  );
  return refund.id;
}

/** Sends pending refunds to the gateway one at a time. Safe to run concurrently. */
export async function processPendingRefunds(limit = 50) {
  const provider = getPaymentProvider();
  let processed = 0;

  for (let i = 0; i < limit; i += 1) {
    const handled = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `SELECT r.id, r.amount, r.order_id, r.attempts, p.provider_payment_id, p.provider
           FROM refunds r JOIN payments p ON p.id = r.payment_id
          WHERE r.status = 'pending' AND r.provider_refund_id IS NULL AND r.attempts < $1
          ORDER BY r.created_at
          LIMIT 1
          FOR UPDATE OF r SKIP LOCKED`,
        [MAX_ATTEMPTS]
      );
      const refund = rows[0];
      if (!refund) return false;

      try {
        if (refund.provider !== provider.name) throw new Error(`Payment was made with "${refund.provider}", current gateway is "${provider.name}"`);
        const result = await provider.refund({
          providerPaymentId: refund.provider_payment_id,
          amountPaise: toPaise(refund.amount),
          notes: { refund_id: refund.id, order_id: refund.order_id },
        });
        await db.query(
          `UPDATE refunds SET provider_refund_id = $2, status = $3, attempts = attempts + 1, failure_reason = NULL,
                  processed_at = CASE WHEN $3::refund_status = 'processed' THEN NOW() ELSE NULL END
            WHERE id = $1`,
          [refund.id, result.providerRefundId, result.status]
        );
        if (result.status === 'processed') await queueRefundEmail(db, refund.id);
      } catch (err) {
        const attempts = refund.attempts + 1;
        await db.query(
          `UPDATE refunds SET attempts = $2, failure_reason = $3, status = $4 WHERE id = $1`,
          [refund.id, attempts, err.message, attempts >= MAX_ATTEMPTS ? 'failed' : 'pending']
        );
        console.error(`[refunds] refund ${refund.id} attempt ${attempts} failed:`, err.message);
      }
      return true;
    });
    if (!handled) break;
    processed += 1;
  }
  return processed;
}

/** Runs refund processing in the background right after a request finishes. */
export function scheduleRefundProcessing() {
  setImmediate(() => processPendingRefunds().catch((err) => console.error('[refunds] processing failed:', err.message)));
}

/** Gateway webhook: refund finished (or failed) asynchronously. */
export async function updateRefundFromGateway(providerRefundId, status, reason) {
  const { rows } = await query(
    `UPDATE refunds SET status = $2::refund_status,
            processed_at = CASE WHEN $2::refund_status = 'processed' THEN NOW() ELSE processed_at END,
            failure_reason = COALESCE($3, failure_reason)
      WHERE provider_refund_id = $1 AND status = 'pending' RETURNING id`,
    [providerRefundId, status, reason ?? null]
  );
  if (rows[0] && status === 'processed') await queueRefundEmail(null, rows[0].id);
}

async function queueRefundEmail(db, refundId) {
  const { rows: [r] } = await (db ?? { query }).query(
    'SELECT o.contact_email FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.id = $1', [refundId]
  );
  await queueEmail(db, { template: 'refund_processed', to: r.contact_email, payload: { refundId }, dedupeKey: `refund:${refundId}` });
}

// ---------- admin ----------
export async function listRefunds({ status, type, page, limit }) {
  const where = [];
  const params = [];
  for (const [column, value] of [['r.status', status], ['r.type', type]]) {
    if (!value) continue;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(`SELECT COUNT(*)::int AS total FROM refunds r ${whereSql}`, params);
  const { rows } = await query(
    `SELECT r.id, r.type, r.amount, r.reason, r.status, r.provider_refund_id AS "providerRefundId", r.attempts,
            r.failure_reason AS "failureReason", r.processed_at AS "processedAt", r.created_at AS "createdAt",
            json_build_object('id', o.id, 'orderNumber', o.order_number, 'contactName', o.contact_name, 'contactEmail', o.contact_email) AS booking,
            json_build_object('id', e.id, 'title', e.title) AS event
       FROM refunds r JOIN orders o ON o.id = r.order_id JOIN events e ON e.id = o.event_id
       ${whereSql}
      ORDER BY r.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows, total: count.rows[0].total };
}

export async function retryRefund(adminId, refundId, ip) {
  const { rows } = await query(
    `UPDATE refunds SET status = 'pending', attempts = 0, failure_reason = NULL
      WHERE id = $1 AND status = 'failed' AND provider_refund_id IS NULL RETURNING id`,
    [refundId]
  );
  if (!rows[0]) throw ApiError.conflict('Only failed refunds that never reached the gateway can be retried');
  await audit({ actorId: adminId, action: 'refund.retried', entityType: 'refund', entityId: refundId, ip });
  scheduleRefundProcessing();
}
