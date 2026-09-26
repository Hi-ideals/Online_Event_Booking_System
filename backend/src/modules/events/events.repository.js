import { query } from '../../config/db.js';

export const PUBLIC_STATUSES = ['published', 'sales_closed', 'completed', 'cancelled'];

/** Base event query with category, venue, organizer and ticket price/availability aggregates. */
export const EVENT_SELECT = `
  SELECT e.id, e.title, e.slug, e.summary, e.description, e.banner_url AS "bannerUrl", e.tags,
         e.start_at AS "startAt", e.end_at AS "endAt", e.status, e.seating_type AS "seatingType",
         e.seat_layout_id AS "seatLayoutId", e.max_tickets_per_order AS "maxTicketsPerOrder",
         e.refund_allowed AS "refundAllowed", e.refund_cutoff_hours AS "refundCutoffHours", e.refund_percent AS "refundPercent",
         e.is_featured AS "isFeatured", e.is_blocked AS "isBlocked", e.blocked_reason AS "blockedReason", e.blocked_at AS "blockedAt",
         e.published_at AS "publishedAt", e.cancelled_at AS "cancelledAt", e.cancellation_reason AS "cancellationReason",
         e.created_at AS "createdAt", e.updated_at AS "updatedAt",
         json_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) AS category,
         json_build_object('id', v.id, 'name', v.name, 'addressLine', v.address_line, 'city', v.city,
                           'state', v.state, 'pincode', v.pincode, 'country', v.country, 'mapUrl', v.map_url) AS venue,
         json_build_object('id', u.id, 'name', COALESCE(op.organization_name, u.name)) AS organizer,
         p.min_price AS "minPrice", p.max_price AS "maxPrice",
         p.total_tickets AS "totalTickets", p.tickets_sold AS "ticketsSold",
         p.tickets_held AS "ticketsHeld", (p.total_tickets - p.tickets_sold - p.tickets_held) AS "ticketsAvailable"
    FROM events e
    JOIN categories c ON c.id = e.category_id
    JOIN venues v ON v.id = e.venue_id
    JOIN users u ON u.id = e.organizer_id
    LEFT JOIN organizer_profiles op ON op.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT MIN(t.price) AS min_price, MAX(t.price) AS max_price,
             COALESCE(SUM(t.quantity), 0)::int AS total_tickets, COALESCE(SUM(t.sold_count), 0)::int AS tickets_sold,
             COALESCE(SUM(t.held_count), 0)::int AS tickets_held
        FROM ticket_tiers t WHERE t.event_id = e.id AND t.is_active
    ) p ON TRUE`;

const TIER_SELECT = `
  SELECT t.id, t.name, t.description, t.price, t.quantity, t.sold_count AS "soldCount", t.held_count AS "heldCount",
         (t.quantity - t.sold_count - t.held_count) AS available, t.max_per_order AS "maxPerOrder", t.section_keys AS "sectionKeys",
         t.sale_start_at AS "saleStartAt", t.sale_end_at AS "saleEndAt", t.sort_order AS "sortOrder", t.is_active AS "isActive",
         (t.is_active AND (t.sale_start_at IS NULL OR t.sale_start_at <= NOW())
                      AND (t.sale_end_at IS NULL OR t.sale_end_at > NOW())) AS "onSale"
    FROM ticket_tiers t`;

const ADMIN_ONLY_FIELDS = ['isBlocked', 'blockedReason', 'blockedAt'];

/** Removes moderation fields before sending an event to the public. */
export function toPublicEvent(event) {
  const copy = { ...event };
  for (const key of ADMIN_ONLY_FIELDS) delete copy[key];
  return copy;
}

export async function findEventById(id, db = { query }) {
  const { rows } = await db.query(`${EVENT_SELECT} WHERE e.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findTiers(eventId, { activeOnly = false } = {}, db = { query }) {
  const { rows } = await db.query(
    `${TIER_SELECT} WHERE t.event_id = $1 ${activeOnly ? 'AND t.is_active' : ''} ORDER BY t.sort_order, t.price`,
    [eventId]
  );
  return rows;
}

export async function findEventWithTiers(id, options, db) {
  const event = await findEventById(id, db);
  if (!event) return null;
  event.tiers = await findTiers(id, options, db);
  return event;
}

/**
 * Runs a paged list query over EVENT_SELECT.
 * `where` is an array of SQL conditions using `params` placeholders.
 */
export async function pagedEvents({ where, params, orderBy, page, limit, extraSelect = '' }) {
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const base = `SELECT * FROM (${EVENT_SELECT.replace('SELECT e.id,', `SELECT ${extraSelect} e.id,`)} ${whereSql}) ev`;
  const count = await query(`SELECT COUNT(*)::int AS total FROM (${base}) counted`, params);
  const { rows } = await query(
    `${base} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows, total: count.rows[0].total };
}
