/*
 * Inventory state changes for orders. Every function here must run inside a transaction (`db`).
 *
 *   pending_payment --confirmOrder--> confirmed --cancelConfirmedOrder--> cancelled
 *          |
 *          +--releaseOrder--> expired | failed | cancelled
 *
 * General tiers track `held_count` / `sold_count`; seated events also move each event_seat
 * between available -> held -> sold. The CHECK (sold_count + held_count <= quantity) and the
 * conditional UPDATEs below make overselling impossible even under concurrent requests.
 */
import ApiError from '../../utils/ApiError.js';

/** Quantity per tier for an order, sorted by tier id so locks are always taken in the same order. */
async function tierQuantities(db, orderId) {
  const { rows } = await db.query(
    `SELECT tier_id, SUM(quantity)::int AS quantity FROM order_items WHERE order_id = $1 GROUP BY tier_id ORDER BY tier_id`,
    [orderId]
  );
  return rows;
}

export async function lockOrder(db, orderId) {
  const { rows } = await db.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (!rows[0]) throw ApiError.notFound('Booking not found');
  return rows[0];
}

/**
 * Reserves tickets for a new order. `perTier` = [{ tierId, quantity }], `seatIds` for seated events.
 * Throws 409 if anything is no longer available.
 */
export async function holdInventory(db, { orderId, eventId, perTier, seatIds }) {
  const sorted = [...perTier].sort((a, b) => a.tierId.localeCompare(b.tierId));
  for (const { tierId, quantity } of sorted) {
    const { rowCount } = await db.query(
      `UPDATE ticket_tiers SET held_count = held_count + $2
        WHERE id = $1 AND quantity - sold_count - held_count >= $2`,
      [tierId, quantity]
    );
    if (!rowCount) {
      const { rows } = await db.query('SELECT name, quantity - sold_count - held_count AS left FROM ticket_tiers WHERE id = $1', [tierId]);
      const left = Math.max(0, rows[0]?.left ?? 0);
      throw ApiError.conflict(left ? `Only ${left} "${rows[0].name}" ticket(s) left` : `"${rows[0]?.name}" is sold out`);
    }
  }

  if (seatIds?.length) {
    const { rows } = await db.query(
      `UPDATE event_seats SET status = 'held', order_id = $1
        WHERE event_id = $2 AND id = ANY($3::uuid[]) AND status = 'available'
        RETURNING id`,
      [orderId, eventId, seatIds]
    );
    if (rows.length !== seatIds.length) {
      const taken = seatIds.length - rows.length;
      throw ApiError.conflict(`${taken} of the selected seat(s) were just taken. Please choose again.`);
    }
  }
}

/** Moves a pending order's held inventory to sold. */
export async function confirmOrder(db, orderId) {
  const order = await lockOrder(db, orderId);
  if (order.status === 'confirmed') return order;
  if (order.status !== 'pending_payment') throw ApiError.conflict(`Booking is ${order.status} and cannot be confirmed`);

  for (const { tier_id: tierId, quantity } of await tierQuantities(db, orderId)) {
    await db.query('UPDATE ticket_tiers SET held_count = held_count - $2, sold_count = sold_count + $2 WHERE id = $1', [tierId, quantity]);
  }
  await db.query(`UPDATE event_seats SET status = 'sold' WHERE order_id = $1 AND status = 'held'`, [orderId]);
  const { rows } = await db.query(
    `UPDATE orders SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1 RETURNING *`,
    [orderId]
  );
  return rows[0];
}

/** Returns a pending order's held inventory. `status` is expired, failed or cancelled. */
export async function releaseOrder(db, orderId, status, { reason, actorId } = {}) {
  const order = await lockOrder(db, orderId);
  if (order.status !== 'pending_payment') return order;

  for (const { tier_id: tierId, quantity } of await tierQuantities(db, orderId)) {
    await db.query('UPDATE ticket_tiers SET held_count = held_count - $2 WHERE id = $1', [tierId, quantity]);
  }
  await db.query(`UPDATE event_seats SET status = 'available', order_id = NULL WHERE order_id = $1 AND status = 'held'`, [orderId]);
  const { rows } = await db.query(
    `UPDATE orders SET status = $2::order_status,
            cancelled_at = CASE WHEN $2::order_status = 'cancelled' THEN NOW() ELSE cancelled_at END,
            cancellation_reason = COALESCE($3, cancellation_reason),
            cancelled_by = COALESCE($4, cancelled_by)
      WHERE id = $1 RETURNING *`,
    [orderId, status, reason ?? null, actorId ?? null]
  );
  return rows[0];
}

/** Cancels a confirmed order: sold tickets go back on sale and the refund amount is recorded. */
export async function cancelConfirmedOrder(db, orderId, { refundAmount, reason, actorId }) {
  const order = await lockOrder(db, orderId);
  if (order.status !== 'confirmed') throw ApiError.conflict(`Booking is ${order.status} and cannot be cancelled`);

  for (const { tier_id: tierId, quantity } of await tierQuantities(db, orderId)) {
    await db.query('UPDATE ticket_tiers SET sold_count = sold_count - $2 WHERE id = $1', [tierId, quantity]);
  }
  await db.query(`UPDATE event_seats SET status = 'available', order_id = NULL WHERE order_id = $1 AND status = 'sold'`, [orderId]);
  await db.query(`UPDATE tickets SET status = 'cancelled' WHERE order_id = $1`, [orderId]);
  const { rows } = await db.query(
    `UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2, cancelled_by = $3, refund_amount = $4
      WHERE id = $1 RETURNING *`,
    [orderId, reason ?? null, actorId ?? null, refundAmount]
  );
  return rows[0];
}

/** Releases every pending order of an event (used when the event is cancelled). */
export async function releasePendingOrdersForEvent(db, eventId, reason) {
  const { rows } = await db.query(
    `SELECT id FROM orders WHERE event_id = $1 AND status = 'pending_payment' ORDER BY id`,
    [eventId]
  );
  for (const { id } of rows) await releaseOrder(db, id, 'cancelled', { reason });
  return rows.length;
}
