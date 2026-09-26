import { query } from '../../config/db.js';

const ORDER_SELECT = `
  SELECT o.id, o.order_number AS "orderNumber", o.status, o.ticket_count AS "ticketCount",
         o.subtotal, o.fee_amount AS "feeAmount", o.total_amount AS "totalAmount", o.currency,
         o.contact_name AS "contactName", o.contact_email AS "contactEmail", o.contact_phone AS "contactPhone",
         o.expires_at AS "expiresAt", o.confirmed_at AS "confirmedAt", o.cancelled_at AS "cancelledAt",
         o.cancellation_reason AS "cancellationReason", o.refund_amount AS "refundAmount",
         o.created_at AS "createdAt", o.updated_at AS "updatedAt",
         json_build_object('id', u.id, 'name', u.name, 'email', u.email) AS customer,
         json_build_object('id', e.id, 'title', e.title, 'slug', e.slug, 'bannerUrl', e.banner_url,
                           'startAt', e.start_at, 'endAt', e.end_at, 'status', e.status, 'seatingType', e.seating_type,
                           'venue', json_build_object('name', v.name, 'city', v.city, 'addressLine', v.address_line),
                           'category', json_build_object('name', c.name, 'slug', c.slug)) AS event
    FROM orders o
    JOIN users u ON u.id = o.user_id
    JOIN events e ON e.id = o.event_id
    JOIN venues v ON v.id = e.venue_id
    JOIN categories c ON c.id = e.category_id`;

export async function findOrderItems(orderId, db = { query }) {
  const { rows } = await db.query(
    `SELECT oi.id, oi.tier_id AS "tierId", t.name AS "tierName", oi.quantity, oi.unit_price AS "unitPrice",
            oi.line_total AS "lineTotal", oi.event_seat_id AS "seatId", s.seat_label AS "seatLabel"
       FROM order_items oi
       JOIN ticket_tiers t ON t.id = oi.tier_id
       LEFT JOIN event_seats s ON s.id = oi.event_seat_id
      WHERE oi.order_id = $1
      ORDER BY t.sort_order, t.name, s.section_key, s.row_label, s.seat_number`,
    [orderId]
  );
  return rows;
}

/** Full booking: items, invoice number, latest payment and refunds. */
export async function findOrder(orderId, db = { query }) {
  const { rows } = await db.query(
    `${ORDER_SELECT.replace('FROM orders o', `,
         inv.invoice_number AS "invoiceNumber", inv.issued_at AS "invoiceIssuedAt",
         (SELECT COUNT(*)::int FROM tickets t WHERE t.order_id = o.id AND t.status = 'valid') AS "validTickets",
         (SELECT json_build_object('id', p.id, 'provider', p.provider, 'providerPaymentId', p.provider_payment_id,
                                   'status', p.status, 'method', p.method, 'amount', p.amount, 'capturedAt', p.captured_at,
                                   'failureReason', p.failure_reason)
            FROM payments p WHERE p.order_id = o.id
           ORDER BY (p.status = 'captured') DESC, p.created_at DESC LIMIT 1) AS payment,
         COALESCE((SELECT json_agg(json_build_object('id', r.id, 'type', r.type, 'amount', r.amount, 'status', r.status,
                                                     'reason', r.reason, 'processedAt', r.processed_at, 'createdAt', r.created_at)
                                   ORDER BY r.created_at)
                     FROM refunds r WHERE r.order_id = o.id), '[]') AS refunds
    FROM orders o`)}
    LEFT JOIN invoices inv ON inv.order_id = o.id
    WHERE o.id = $1`,
    [orderId]
  );
  if (!rows[0]) return null;
  const order = rows[0];
  order.items = await findOrderItems(orderId, db);
  return order;
}

/** Paged order list. `where` conditions reference aliases o, u, e, v. */
export async function pagedOrders({ where, params, orderBy = 'o.created_at DESC', page, limit }) {
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(
    `SELECT COUNT(*)::int AS total FROM orders o JOIN users u ON u.id = o.user_id JOIN events e ON e.id = o.event_id ${whereSql}`,
    params
  );
  const { rows } = await query(
    `${ORDER_SELECT} ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows, total: count.rows[0].total };
}
