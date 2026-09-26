// What happens when a booking becomes confirmed (payment captured, or a free booking).
import { ticketCode } from '../../utils/codes.js';
import { financialYear } from '../../utils/dates.js';
import { queueEmail } from '../notifications/notifications.service.js';
import { confirmOrder, lockOrder } from './inventory.js';

async function issueTickets(db, order) {
  const { rows: items } = await db.query(
    `SELECT oi.id, oi.tier_id, oi.event_seat_id, oi.quantity FROM order_items oi WHERE oi.order_id = $1 ORDER BY oi.id`,
    [order.id]
  );
  const tickets = items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => ({ item, code: ticketCode() }))
  );
  await db.query(
    `INSERT INTO tickets (ticket_code, order_id, order_item_id, event_id, tier_id, event_seat_id, attendee_name)
     SELECT code, $1, item_id, $2, tier_id, seat_id, $3
       FROM UNNEST($4::text[], $5::uuid[], $6::uuid[], $7::uuid[]) AS t(code, item_id, tier_id, seat_id)`,
    [order.id, order.event_id, order.contact_name,
      tickets.map((t) => t.code), tickets.map((t) => t.item.id), tickets.map((t) => t.item.tier_id),
      tickets.map((t) => t.item.event_seat_id)]
  );
}

async function assignInvoiceNumber(db, orderId) {
  const fy = financialYear();
  const { rows } = await db.query(
    `INSERT INTO invoice_sequences (financial_year, last_number) VALUES ($1, 1)
     ON CONFLICT (financial_year) DO UPDATE SET last_number = invoice_sequences.last_number + 1
     RETURNING last_number`,
    [fy]
  );
  const invoiceNumber = `INV/${fy}/${String(rows[0].last_number).padStart(6, '0')}`;
  await db.query('INSERT INTO invoices (invoice_number, order_id) VALUES ($1, $2)', [invoiceNumber, orderId]);
}

async function lockInCommission(db, order) {
  await db.query(
    `UPDATE orders o
        SET commission_percent = COALESCE(
              (SELECT op.commission_percent FROM events e JOIN organizer_profiles op ON op.user_id = e.organizer_id WHERE e.id = o.event_id),
              (SELECT (value #>> '{}')::numeric FROM platform_settings WHERE key = 'commission_percent'),
              0)
      WHERE o.id = $1`,
    [order.id]
  );
}

/** Confirms a pending order and issues its tickets, invoice number and commission rate. Idempotent. */
export async function fulfillOrder(db, orderId) {
  // Lock first so two concurrent confirmations cannot both issue tickets.
  const locked = await lockOrder(db, orderId);
  if (locked.status === 'confirmed') return locked;
  const order = await confirmOrder(db, orderId);

  await issueTickets(db, order);
  await assignInvoiceNumber(db, orderId);
  await lockInCommission(db, order);
  await queueEmail(db, { template: 'booking_confirmed', to: order.contact_email, payload: { orderId }, dedupeKey: `confirmed:${orderId}` });
  return order;
}
