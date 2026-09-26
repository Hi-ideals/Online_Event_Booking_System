// Public event discovery: search, event details, seat map.
import { query } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { EVENT_SELECT, findTiers, pagedEvents, PUBLIC_STATUSES, toPublicEvent } from './events.repository.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Upcoming, bookable-or-sold-out events visible in listings.
const LISTED = `e.status IN ('published', 'sales_closed') AND e.is_blocked = FALSE AND e.end_at > NOW()`;

const SORTS = {
  date: '"startAt" ASC',
  price_asc: '"minPrice" ASC NULLS LAST, "startAt" ASC',
  price_desc: '"maxPrice" DESC NULLS LAST, "startAt" ASC',
  popular: '"ticketsSold" DESC, "startAt" ASC',
  newest: '"publishedAt" DESC',
  relevance: 'rank DESC, "startAt" ASC',
};

export async function searchEvents(filters) {
  const where = [LISTED];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('$?', `$${params.length}`));
  };

  let extraSelect = '0 AS rank,';
  if (filters.q) {
    params.push(filters.q);
    const n = params.length;
    // Full-text match on title/summary/description, plus partial matches on title, venue, city and category.
    where.push(`(e.search_vector @@ websearch_to_tsquery('english', $${n})
                 OR e.title ILIKE '%' || $${n} || '%'
                 OR v.name ILIKE '%' || $${n} || '%'
                 OR v.city ILIKE '%' || $${n} || '%'
                 OR c.name ILIKE '%' || $${n} || '%'
                 OR $${n} ILIKE ANY (e.tags))`);
    extraSelect = `ts_rank(e.search_vector, websearch_to_tsquery('english', $${n})) AS rank,`;
  }
  if (filters.category) add('c.slug = $?', filters.category);
  if (filters.city) add('LOWER(v.city) = LOWER($?)', filters.city);
  if (filters.dateFrom) add('e.end_at >= $?::date', filters.dateFrom);
  if (filters.dateTo) add(`e.start_at < ($?::date + INTERVAL '1 day')`, filters.dateTo);
  if (filters.minPrice !== undefined) add('p.max_price >= $?', filters.minPrice);
  if (filters.maxPrice !== undefined) add('p.min_price <= $?', filters.maxPrice);
  if (filters.featured !== undefined) add('e.is_featured = $?', filters.featured);

  const sort = filters.sort === 'relevance' && !filters.q ? 'date' : filters.sort;
  const result = await pagedEvents({
    where, params, orderBy: SORTS[sort], page: filters.page, limit: filters.limit, extraSelect,
  });
  result.items = result.items.map(({ rank: _rank, description: _description, ticketsHeld: _held, ...event }) => toPublicEvent(event));
  return result;
}

export async function listCities() {
  const { rows } = await query(
    `SELECT MIN(v.city) AS city, COUNT(*)::int AS "eventCount"
       FROM events e JOIN venues v ON v.id = e.venue_id
      WHERE ${LISTED}
      GROUP BY LOWER(v.city)
      ORDER BY "eventCount" DESC, city`
  );
  return rows;
}

async function findPublicEventRow(idOrSlug) {
  const column = UUID_RE.test(idOrSlug) ? 'e.id' : 'e.slug';
  const { rows } = await query(
    `${EVENT_SELECT} WHERE ${column} = $1 AND e.status = ANY($2::event_status[]) AND e.is_blocked = FALSE`,
    [idOrSlug, PUBLIC_STATUSES]
  );
  if (!rows[0]) throw ApiError.notFound('Event not found');
  return rows[0];
}

export async function getPublicEvent(idOrSlug) {
  const event = await findPublicEventRow(idOrSlug);
  const tiers = await findTiers(event.id, { activeOnly: true });
  // Organizer-only numbers are not needed publicly.
  event.tiers = tiers.map(({ soldCount: _soldCount, heldCount: _heldCount, quantity: _quantity, sectionKeys: _keys, ...tier }) => tier);
  event.bookable = event.status === 'published' && new Date(event.startAt) > new Date() && tiers.some((t) => t.onSale && t.available > 0);
  return toPublicEvent(event);
}

/**
 * Seat map for a seated event, in layout order. Seats removed in the layout (aisles etc.)
 * are returned with status "gap" so the frontend can draw the grid faithfully.
 */
export async function getSeatMap(idOrSlug) {
  const event = await findPublicEventRow(idOrSlug);
  if (event.seatingType !== 'seated') throw ApiError.badRequest('This event does not have reserved seating');
  if (event.status === 'draft' || !event.seatLayoutId) throw ApiError.notFound('Seat map not available');

  const [{ rows: layoutRows }, { rows: seats }, tiers] = await Promise.all([
    query('SELECT definition FROM seat_layouts WHERE id = $1', [event.seatLayoutId]),
    query(
      `SELECT id, tier_id, section_key, row_label, seat_number, seat_label, status
         FROM event_seats WHERE event_id = $1`,
      [event.id]
    ),
    findTiers(event.id),
  ]);

  const byPosition = new Map(seats.map((s) => [`${s.section_key}|${s.row_label}|${s.seat_number}`, s]));
  const tierBySection = new Map();
  for (const tier of tiers) for (const key of tier.sectionKeys) tierBySection.set(key, tier);

  const sections = layoutRows[0].definition.sections.map((section) => {
    const tier = tierBySection.get(section.key);
    return {
      key: section.key,
      name: section.name,
      tierId: tier?.id ?? null,
      rows: section.rows.map((row) => ({
        label: row.label,
        seats: Array.from({ length: row.seats }, (_, i) => {
          const seat = byPosition.get(`${section.key}|${row.label}|${i + 1}`);
          if (!seat) return { number: i + 1, status: 'gap' };
          // Admin/organizer-blocked seats look the same as sold seats to buyers.
          const status = seat.status === 'available' && tier?.onSale ? 'available' : 'unavailable';
          return { id: seat.id, number: seat.seat_number, label: seat.seat_label, status };
        }),
      })),
    };
  });

  return {
    eventId: event.id,
    tiers: tiers
      .filter((t) => t.isActive)
      .map((t) => ({ id: t.id, name: t.name, price: t.price, available: t.available, onSale: t.onSale })),
    sections,
  };
}
