// Refund requests (disputes): attendees ask for a refund outside the automatic policy and an admin decides.
import { query, withTransaction } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { toPaise, toRupees } from '../../utils/money.js';
import { cancelConfirmedOrder, lockOrder } from '../bookings/inventory.js';
import { queueEmail } from '../notifications/notifications.service.js';
import { createRefund, scheduleRefundProcessing } from '../payments/refunds.service.js';

const REQUEST_SELECT = `
  SELECT rr.id, rr.reason, rr.status, rr.admin_note AS "adminNote", rr.resolved_at AS "resolvedAt", rr.created_at AS "createdAt",
         json_build_object('id', o.id, 'orderNumber', o.order_number, 'status', o.status, 'totalAmount', o.total_amount,
                           'refundAmount', o.refund_amount, 'contactName', o.contact_name, 'contactEmail', o.contact_email) AS booking,
         json_build_object('id', e.id, 'title', e.title, 'startAt', e.start_at, 'status', e.status) AS event,
         CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id', r.id, 'amount', r.amount, 'status', r.status) END AS refund
    FROM refund_requests rr
    JOIN orders o ON o.id = rr.order_id
    JOIN events e ON e.id = o.event_id
    LEFT JOIN refunds r ON r.id = rr.refund_id`;

/** Amount still refundable on the booking's captured payment. */
async function refundableAmount(db, orderId) {
  const { rows: [row] } = await db.query(
    `SELECT p.amount AS paid,
            COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.payment_id = p.id AND r.status <> 'failed'), 0) AS refunded
       FROM payments p WHERE p.order_id = $1 AND p.status = 'captured' ORDER BY p.captured_at LIMIT 1`,
    [orderId]
  );
  return row ? toRupees(toPaise(row.paid) - toPaise(row.refunded)) : 0;
}

export async function createRequest(user, orderId, reason, ip) {
  return withTransaction(async (db) => {
    const order = await lockOrder(db, orderId);
    if (order.user_id !== user.id) throw ApiError.notFound('Booking not found');
    if (!['confirmed', 'cancelled'].includes(order.status) || !order.confirmed_at) {
      throw ApiError.conflict('Refund requests can be raised only for paid bookings');
    }
    if (await refundableAmount(db, orderId) <= 0) throw ApiError.conflict('This booking has already been fully refunded');
    const { rows: open } = await db.query(`SELECT 1 FROM refund_requests WHERE order_id = $1 AND status = 'open'`, [orderId]);
    if (open.length) throw ApiError.conflict('You already have an open refund request for this booking');

    const { rows } = await db.query(
      'INSERT INTO refund_requests (order_id, user_id, reason) VALUES ($1, $2, $3) RETURNING id',
      [orderId, user.id, reason]
    );
    await audit({ actorId: user.id, action: 'refund_request.created', entityType: 'refund_request', entityId: rows[0].id, ip }, db);
    const { rows: [request] } = await db.query(`${REQUEST_SELECT} WHERE rr.id = $1`, [rows[0].id]);
    return request;
  });
}

export async function listForBooking(userId, orderId) {
  const { rows } = await query(
    `${REQUEST_SELECT} WHERE rr.order_id = $1 AND rr.user_id = $2 ORDER BY rr.created_at DESC`,
    [orderId, userId]
  );
  return rows;
}

export async function listRequests({ status, page, limit }) {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'WHERE rr.status = $1';
  }
  const count = await query(`SELECT COUNT(*)::int AS total FROM refund_requests rr ${where}`, params);
  const { rows } = await query(
    `${REQUEST_SELECT} ${where} ORDER BY (rr.status = 'open') DESC, rr.created_at ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows, total: count.rows[0].total };
}

export async function getRequest(requestId) {
  const { rows } = await query(`${REQUEST_SELECT} WHERE rr.id = $1`, [requestId]);
  if (!rows[0]) throw ApiError.notFound('Refund request not found');
  rows[0].refundableAmount = await refundableAmount({ query }, rows[0].booking.id);
  return rows[0];
}

async function lockOpenRequest(db, requestId) {
  const { rows } = await db.query('SELECT * FROM refund_requests WHERE id = $1 FOR UPDATE', [requestId]);
  if (!rows[0]) throw ApiError.notFound('Refund request not found');
  if (rows[0].status !== 'open') throw ApiError.conflict(`Request is already ${rows[0].status}`);
  return rows[0];
}

/**
 * Approves a request: refunds `amount` (defaults to everything still refundable) and optionally
 * cancels the booking so its tickets stop working and go back on sale.
 */
export async function approveRequest(adminId, requestId, { amount, cancelBooking, note }, ip) {
  const result = await withTransaction(async (db) => {
    const request = await lockOpenRequest(db, requestId);
    const order = await lockOrder(db, request.order_id);
    const refundable = await refundableAmount(db, order.id);
    const refundAmount = amount ?? refundable;
    if (refundAmount <= 0 || toPaise(refundAmount) > toPaise(refundable)) {
      throw ApiError.badRequest(`Refund amount must be between 0.01 and ${refundable}`);
    }

    const newRefundTotal = toRupees(toPaise(order.refund_amount) + toPaise(refundAmount));
    if (cancelBooking && order.status === 'confirmed') {
      await cancelConfirmedOrder(db, order.id, { refundAmount: newRefundTotal, reason: `Refund request approved: ${note ?? request.reason}`, actorId: adminId });
    } else {
      await db.query('UPDATE orders SET refund_amount = $2 WHERE id = $1', [order.id, newRefundTotal]);
    }

    const refundId = await createRefund(db, { orderId: order.id, amount: refundAmount, type: 'admin', reason: note ?? request.reason, actorId: adminId });
    await db.query(
      `UPDATE refund_requests SET status = 'approved', admin_note = $2, refund_id = $3, resolved_by = $4, resolved_at = NOW() WHERE id = $1`,
      [requestId, note ?? null, refundId, adminId]
    );
    await audit({ actorId: adminId, action: 'refund_request.approved', entityType: 'refund_request', entityId: requestId,
      metadata: { amount: refundAmount, cancelBooking }, ip }, db);
    await queueEmail(db, { template: 'refund_request_resolved', to: order.contact_email, payload: { requestId } });
    const { rows: [updated] } = await db.query(`${REQUEST_SELECT} WHERE rr.id = $1`, [requestId]);
    return updated;
  });
  scheduleRefundProcessing();
  return result;
}

export async function rejectRequest(adminId, requestId, note, ip) {
  return withTransaction(async (db) => {
    const request = await lockOpenRequest(db, requestId);
    await db.query(
      `UPDATE refund_requests SET status = 'rejected', admin_note = $2, resolved_by = $3, resolved_at = NOW() WHERE id = $1`,
      [requestId, note, adminId]
    );
    await audit({ actorId: adminId, action: 'refund_request.rejected', entityType: 'refund_request', entityId: requestId, metadata: { note }, ip }, db);
    const { rows: [order] } = await db.query('SELECT contact_email FROM orders WHERE id = $1', [request.order_id]);
    await queueEmail(db, { template: 'refund_request_resolved', to: order.contact_email, payload: { requestId } });
    const { rows: [updated] } = await db.query(`${REQUEST_SELECT} WHERE rr.id = $1`, [requestId]);
    return updated;
  });
}
