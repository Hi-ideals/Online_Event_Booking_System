import env from '../../config/env.js';
import { query, withTransaction } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { orderNumber } from '../../utils/codes.js';
import { percentOf, toPaise, toRupees } from '../../utils/money.js';
import { queueEmail } from '../notifications/notifications.service.js';
import { createRefund, scheduleRefundProcessing } from '../payments/refunds.service.js';
import { ORDER_FINANCIALS } from '../finance/orderFinancials.js';
import { findOrder, pagedOrders } from './bookings.repository.js';
import { fulfillOrder } from './fulfillment.js';
import { cancelConfirmedOrder, holdInventory, lockOrder, releaseOrder } from './inventory.js';

function isOnSale(tier, now = new Date()) {
  return tier.is_active
    && (!tier.sale_start_at || new Date(tier.sale_start_at) <= now)
    && (!tier.sale_end_at || new Date(tier.sale_end_at) > now);
}

async function loadBookableEvent(db, eventId) {
  const { rows } = await db.query(
    `SELECT id, title, status, is_blocked, start_at, seating_type, max_tickets_per_order
       FROM events WHERE id = $1 FOR SHARE`,
    [eventId]
  );
  const event = rows[0];
  if (!event || event.is_blocked) throw ApiError.notFound('Event not found');
  if (event.status !== 'published') throw ApiError.conflict('Tickets for this event are not on sale');
  if (new Date(event.start_at) <= new Date()) throw ApiError.conflict('This event has already started');
  return event;
}

/** Builds order lines from the request and validates tiers, sale windows and per-order limits. */
async function buildOrderLines(db, event, input) {
  const { rows: tierRows } = await db.query(
    'SELECT id, name, price, max_per_order, is_active, sale_start_at, sale_end_at FROM ticket_tiers WHERE event_id = $1',
    [event.id]
  );
  const tiers = new Map(tierRows.map((t) => [t.id, t]));
  const lines = [];

  if (event.seating_type === 'general') {
    if (!input.items) throw ApiError.badRequest('This event has general admission; send "items" with tier quantities');
    for (const item of input.items) {
      lines.push({ tier: tiers.get(item.tierId), tierId: item.tierId, quantity: item.quantity, seatId: null });
    }
  } else {
    if (!input.seatIds) throw ApiError.badRequest('This event has reserved seating; send "seatIds"');
    const { rows: seats } = await db.query(
      'SELECT id, tier_id FROM event_seats WHERE event_id = $1 AND id = ANY($2::uuid[])',
      [event.id, input.seatIds]
    );
    if (seats.length !== input.seatIds.length) throw ApiError.badRequest('Some selected seats do not belong to this event');
    for (const seat of seats) {
      lines.push({ tier: tiers.get(seat.tier_id), tierId: seat.tier_id, quantity: 1, seatId: seat.id });
    }
  }

  const perTier = new Map();
  for (const line of lines) {
    if (!line.tier) throw ApiError.badRequest('Selected ticket tier does not belong to this event');
    if (!isOnSale(line.tier)) throw ApiError.conflict(`"${line.tier.name}" tickets are not on sale right now`);
    perTier.set(line.tierId, (perTier.get(line.tierId) ?? 0) + line.quantity);
  }
  for (const [tierId, quantity] of perTier) {
    const tier = tiers.get(tierId);
    if (tier.max_per_order && quantity > tier.max_per_order) {
      throw ApiError.badRequest(`You can book at most ${tier.max_per_order} "${tier.name}" ticket(s) per order`);
    }
  }
  const ticketCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  if (ticketCount > event.max_tickets_per_order) {
    throw ApiError.badRequest(`You can book at most ${event.max_tickets_per_order} ticket(s) per order`);
  }

  return {
    lines,
    ticketCount,
    perTier: [...perTier].map(([tierId, quantity]) => ({ tierId, quantity })),
  };
}

// ---------- attendee ----------
export async function createBooking(user, input, ip) {
  return withTransaction(async (db) => {
    const event = await loadBookableEvent(db, input.eventId);

    // Starting a new checkout for the same event replaces the attendee's previous unpaid one.
    const { rows: previous } = await db.query(
      `SELECT id FROM orders WHERE user_id = $1 AND event_id = $2 AND status = 'pending_payment' ORDER BY id`,
      [user.id, event.id]
    );
    for (const { id } of previous) {
      await releaseOrder(db, id, 'cancelled', { reason: 'Replaced by a new booking', actorId: user.id });
    }

    const { lines, ticketCount, perTier } = await buildOrderLines(db, event, input);
    const subtotal = lines.reduce((sum, l) => sum + toPaise(l.tier.price) * l.quantity, 0);
    const fee = Math.round((subtotal * env.booking.convenienceFeePercent) / 100);
    const contact = input.contact ?? { name: user.name, email: user.email, phone: user.phone };

    const { rows } = await db.query(
      `INSERT INTO orders (order_number, user_id, event_id, ticket_count, subtotal, fee_amount, total_amount,
                           contact_name, contact_email, contact_phone, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + make_interval(mins => $11))
       RETURNING id, total_amount`,
      [orderNumber(), user.id, event.id, ticketCount, toRupees(subtotal), toRupees(fee), toRupees(subtotal + fee),
        contact.name, contact.email, contact.phone ?? null, env.booking.holdMinutes]
    );
    const order = rows[0];

    await db.query(
      `INSERT INTO order_items (order_id, tier_id, event_seat_id, quantity, unit_price, line_total)
       SELECT $1, * FROM UNNEST($2::uuid[], $3::uuid[], $4::int[], $5::numeric[], $6::numeric[])`,
      [order.id, lines.map((l) => l.tierId), lines.map((l) => l.seatId), lines.map((l) => l.quantity),
        lines.map((l) => l.tier.price), lines.map((l) => toRupees(toPaise(l.tier.price) * l.quantity))]
    );

    await holdInventory(db, { orderId: order.id, eventId: event.id, perTier, seatIds: input.seatIds });

    // Free tickets need no payment.
    if (order.total_amount === 0) await fulfillOrder(db, order.id);

    await audit({ actorId: user.id, action: 'booking.created', entityType: 'order', entityId: order.id,
      metadata: { eventId: event.id, ticketCount, total: order.total_amount }, ip }, db);
    return findOrder(order.id, db);
  });
}

async function getOwnOrder(userId, orderId) {
  const order = await findOrder(orderId);
  if (!order || order.customer.id !== userId) throw ApiError.notFound('Booking not found');
  return order;
}

export async function getMyBooking(userId, orderId) {
  const order = await getOwnOrder(userId, orderId);
  order.cancellation = await cancellationQuote(orderId);
  return order;
}

export async function listMyBookings(userId, { status, when, page, limit }) {
  const params = [userId];
  const where = ['o.user_id = $1'];
  if (status) {
    params.push(status);
    where.push(`o.status = $${params.length}`);
  }
  if (when === 'upcoming') where.push('e.end_at > NOW()');
  if (when === 'past') where.push('e.end_at <= NOW()');
  const orderBy = when === 'upcoming' ? 'e.start_at ASC' : 'o.created_at DESC';
  return pagedOrders({ where, params, orderBy, page, limit });
}

/** Works out whether a booking can be cancelled now and how much would be refunded. */
export async function cancellationQuote(orderId, db = { query }) {
  const { rows } = await db.query(
    `SELECT o.status, o.subtotal, e.status AS event_status, e.start_at, e.refund_allowed, e.refund_cutoff_hours, e.refund_percent,
            EXISTS (SELECT 1 FROM tickets t WHERE t.order_id = o.id AND t.checked_in_at IS NOT NULL) AS checked_in
       FROM orders o JOIN events e ON e.id = o.event_id WHERE o.id = $1`,
    [orderId]
  );
  const o = rows[0];
  const deadline = new Date(new Date(o.start_at).getTime() - o.refund_cutoff_hours * 3600 * 1000);
  const quote = (eligible, reason, refundAmount = 0) => ({ eligible, reason, refundAmount, refundPercent: o.refund_percent, deadline });

  if (o.status === 'pending_payment') return quote(true, 'Unpaid booking can be released');
  if (o.status !== 'confirmed') return quote(false, `Booking is ${o.status}`);
  if (o.event_status === 'cancelled') return quote(false, 'The event was cancelled; your refund is processed automatically');
  if (o.checked_in) return quote(false, 'Tickets from this booking have already been used for entry');
  if (new Date(o.start_at) <= new Date()) return quote(false, 'The event has already started');
  if (!o.refund_allowed) return quote(false, 'This event does not allow cancellations');
  if (new Date() > deadline) return quote(false, `Cancellations closed ${o.refund_cutoff_hours} hour(s) before the event`);

  const refund = percentOf(o.subtotal, o.refund_percent);
  return quote(true, o.refund_percent === 100 ? 'Full refund of the ticket price' : `${o.refund_percent}% refund of the ticket price`, refund);
}

export async function cancelMyBooking(userId, orderId, reason, ip) {
  const booking = await withTransaction(async (db) => {
    const order = await lockOrder(db, orderId);
    if (order.user_id !== userId) throw ApiError.notFound('Booking not found');
    await db.query('SELECT 1 FROM events WHERE id = $1 FOR SHARE', [order.event_id]);

    const quote = await cancellationQuote(orderId, db);
    if (!quote.eligible) throw ApiError.conflict(quote.reason);

    if (order.status === 'pending_payment') {
      await releaseOrder(db, orderId, 'cancelled', { reason: reason ?? 'Cancelled by attendee', actorId: userId });
    } else {
      await cancelConfirmedOrder(db, orderId, { refundAmount: quote.refundAmount, reason: reason ?? 'Cancelled by attendee', actorId: userId });
      await createRefund(db, { orderId, amount: quote.refundAmount, type: 'attendee_cancellation', reason, actorId: userId });
      await queueEmail(db, { template: 'booking_cancelled', to: order.contact_email, payload: { orderId } });
    }
    await audit({ actorId: userId, action: 'booking.cancelled', entityType: 'order', entityId: orderId,
      metadata: { previousStatus: order.status, refundAmount: quote.refundAmount }, ip }, db);
    return findOrder(orderId, db);
  });
  scheduleRefundProcessing();
  return booking;
}

// ---------- organizer ----------
async function assertOwnEvent(organizerId, eventId) {
  const { rowCount } = await query('SELECT 1 FROM events WHERE id = $1 AND organizer_id = $2', [eventId, organizerId]);
  if (!rowCount) throw ApiError.notFound('Event not found');
}

function searchCondition(params, search) {
  params.push(`%${search}%`);
  const n = params.length;
  return `(o.order_number ILIKE $${n} OR o.contact_name ILIKE $${n} OR o.contact_email ILIKE $${n})`;
}

export async function listEventBookings(organizerId, eventId, { status, search, page, limit }) {
  await assertOwnEvent(organizerId, eventId);
  const params = [eventId];
  const where = ['o.event_id = $1'];
  if (status) {
    params.push(status);
    where.push(`o.status = $${params.length}`);
  }
  if (search) where.push(searchCondition(params, search));
  return pagedOrders({ where, params, page, limit });
}

/** Confirmed ticket holders of an event, one row per seat or per tier line. */
export async function listAttendees(organizerId, eventId, { search, tierId, format, page, limit }) {
  await assertOwnEvent(organizerId, eventId);
  const params = [eventId];
  const where = [`o.event_id = $1`, `o.status = 'confirmed'`];
  if (tierId) {
    params.push(tierId);
    where.push(`oi.tier_id = $${params.length}`);
  }
  if (search) where.push(searchCondition(params, search));
  const from = `FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN ticket_tiers t ON t.id = oi.tier_id
                LEFT JOIN event_seats s ON s.id = oi.event_seat_id
               WHERE ${where.join(' AND ')}`;

  const { rows: [{ rowCount, ...summary }] } = await query(
    `SELECT COUNT(*)::int AS "rowCount", COUNT(DISTINCT o.id)::int AS "orders", COALESCE(SUM(oi.quantity), 0)::int AS "tickets" ${from}`,
    params
  );
  const select = `SELECT o.order_number AS "orderNumber", o.contact_name AS "name", o.contact_email AS "email",
                         o.contact_phone AS "phone", t.name AS "tier", s.seat_label AS "seat", oi.quantity,
                         oi.unit_price AS "unitPrice", o.confirmed_at AS "bookedAt"
                  ${from} ORDER BY o.confirmed_at, t.sort_order, s.section_key, s.row_label, s.seat_number`;

  if (format === 'csv') {
    const { rows } = await query(select, params);
    return { csv: toCsv(rows), summary };
  }
  const { rows } = await query(`${select} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, (page - 1) * limit]);
  return { items: rows, total: rowCount, summary };
}

function toCsv(rows) {
  const headers = ['Order Number', 'Name', 'Email', 'Phone', 'Tier', 'Seat', 'Quantity', 'Unit Price', 'Booked At'];
  const keys = ['orderNumber', 'name', 'email', 'phone', 'tier', 'seat', 'quantity', 'unitPrice', 'bookedAt'];
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = value instanceof Date ? value.toISOString() : String(value);
    // Prefix formula-like values so spreadsheets do not execute them.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return [headers.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\r\n');
}

/**
 * Money summary for one event (organizerId = null skips the ownership check, for admins). Ticket revenue kept after refunds is split into platform commission
 * (rate locked in per booking) and organizer earnings. Convenience fees belong to the platform.
 */
export async function salesSummary(organizerId, eventId) {
  if (organizerId) await assertOwnEvent(organizerId, eventId);
  const { rows: [totals] } = await query(
    `SELECT COUNT(*) FILTER (WHERE status = 'confirmed')::int AS "confirmedBookings",
            COUNT(*) FILTER (WHERE status = 'cancelled')::int AS "cancelledBookings",
            COALESCE(SUM(ticket_count) FILTER (WHERE status = 'confirmed'), 0)::int AS "ticketsSold",
            COALESCE(SUM(subtotal), 0) AS "grossTicketSales",
            COALESCE(SUM(refund_amount), 0) AS "refunded",
            COALESCE(SUM(ticket_net), 0) AS "netTicketSales",
            COALESCE(SUM(commission), 0) AS "platformCommission",
            COALESCE(SUM(organizer_earning), 0) AS "organizerEarnings",
            COALESCE(SUM(fee_net), 0) AS "convenienceFees"
       FROM (${ORDER_FINANCIALS}) f
      WHERE f.event_id = $1`,
    [eventId]
  );
  const { rows: byTier } = await query(
    `SELECT t.id AS "tierId", t.name, t.price, t.quantity, t.sold_count AS "sold", t.held_count AS "held",
            COALESCE(SUM(oi.line_total) FILTER (WHERE o.status = 'confirmed'), 0) AS "revenue"
       FROM ticket_tiers t
       LEFT JOIN order_items oi ON oi.tier_id = t.id
       LEFT JOIN orders o ON o.id = oi.order_id
      WHERE t.event_id = $1
      GROUP BY t.id
      ORDER BY t.sort_order, t.price`,
    [eventId]
  );
  return { ...totals, currency: 'INR', byTier };
}

// ---------- admin ----------
export async function adminListBookings({ status, eventId, userId, search, page, limit }) {
  const params = [];
  const where = [];
  for (const [column, value] of [['o.status', status], ['o.event_id', eventId], ['o.user_id', userId]]) {
    if (!value) continue;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  }
  if (search) where.push(searchCondition(params, search));
  return pagedOrders({ where, params, page, limit });
}

export async function adminGetBooking(orderId) {
  const order = await findOrder(orderId);
  if (!order) throw ApiError.notFound('Booking not found');
  order.cancellation = await cancellationQuote(orderId);
  return order;
}

// ---------- jobs ----------
/** Releases unpaid orders whose hold has expired. Returns how many were released. */
export async function expireStaleOrders(batchSize = 100) {
  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT id FROM orders WHERE status = 'pending_payment' AND expires_at < NOW()
        ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );
    for (const { id } of rows) await releaseOrder(db, id, 'expired');
    return rows.length;
  });
}
