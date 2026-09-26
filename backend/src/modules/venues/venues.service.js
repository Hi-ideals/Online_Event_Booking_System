import { query } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { buildSet } from '../../utils/sql.js';
import { countSeats } from './seatLayout.js';

const VENUE_COLUMNS = {
  name: 'name', addressLine: 'address_line', city: 'city', state: 'state', pincode: 'pincode',
  country: 'country', capacity: 'capacity', mapUrl: 'map_url',
};

const VENUE_SELECT = `
  SELECT v.id, v.name, v.address_line AS "addressLine", v.city, v.state, v.pincode, v.country, v.capacity,
         v.map_url AS "mapUrl", v.created_at AS "createdAt", v.updated_at AS "updatedAt",
         (SELECT COUNT(*)::int FROM seat_layouts sl WHERE sl.venue_id = v.id) AS "layoutCount",
         (SELECT COUNT(*)::int FROM events e WHERE e.venue_id = v.id) AS "eventCount"
    FROM venues v`;

const LAYOUT_SELECT = `
  SELECT sl.id, sl.venue_id AS "venueId", sl.name, sl.definition, sl.total_seats AS "totalSeats",
         sl.created_at AS "createdAt", sl.updated_at AS "updatedAt",
         EXISTS (SELECT 1 FROM events e WHERE e.seat_layout_id = sl.id AND e.status <> 'draft') AS "inUse"
    FROM seat_layouts sl`;

// ---------- venues ----------
export async function listVenues(organizerId, { search, page, limit }) {
  const params = [organizerId];
  let where = 'WHERE v.organizer_id = $1';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (v.name ILIKE $2 OR v.city ILIKE $2)`;
  }
  const count = await query(`SELECT COUNT(*)::int AS total FROM venues v ${where}`, params);
  const { rows } = await query(
    `${VENUE_SELECT} ${where} ORDER BY v.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows, total: count.rows[0].total };
}

export async function getVenue(organizerId, venueId) {
  const { rows } = await query(`${VENUE_SELECT} WHERE v.id = $1 AND v.organizer_id = $2`, [venueId, organizerId]);
  if (!rows[0]) throw ApiError.notFound('Venue not found');
  return rows[0];
}

export async function createVenue(organizerId, input) {
  const { rows } = await query(
    `INSERT INTO venues (organizer_id, name, address_line, city, state, pincode, country, capacity, map_url)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'India'), $8, $9) RETURNING id`,
    [organizerId, input.name, input.addressLine, input.city, input.state ?? null, input.pincode ?? null,
      input.country ?? null, input.capacity ?? null, input.mapUrl ?? null]
  );
  return getVenue(organizerId, rows[0].id);
}

export async function updateVenue(organizerId, venueId, input) {
  await getVenue(organizerId, venueId);
  const { sets, params } = buildSet(input, VENUE_COLUMNS);
  params.push(venueId);
  await query(`UPDATE venues SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return getVenue(organizerId, venueId);
}

export async function deleteVenue(organizerId, venueId) {
  const venue = await getVenue(organizerId, venueId);
  if (venue.eventCount > 0) throw ApiError.conflict('This venue is used by events and cannot be deleted');
  await query('DELETE FROM venues WHERE id = $1', [venueId]);
}

// ---------- seat layouts ----------
export async function listLayouts(organizerId, venueId) {
  await getVenue(organizerId, venueId);
  const { rows } = await query(`${LAYOUT_SELECT} WHERE sl.venue_id = $1 ORDER BY sl.created_at DESC`, [venueId]);
  return rows;
}

/** Loads a layout and checks it belongs to one of the organizer's venues. */
export async function getLayout(organizerId, layoutId) {
  const { rows } = await query(
    `${LAYOUT_SELECT} JOIN venues v ON v.id = sl.venue_id WHERE sl.id = $1 AND v.organizer_id = $2`,
    [layoutId, organizerId]
  );
  if (!rows[0]) throw ApiError.notFound('Seat layout not found');
  return rows[0];
}

export async function createLayout(organizerId, venueId, { name, definition }) {
  await getVenue(organizerId, venueId);
  const { rows } = await query(
    `INSERT INTO seat_layouts (venue_id, name, definition, total_seats) VALUES ($1, $2, $3, $4) RETURNING id`,
    [venueId, name, definition, countSeats(definition)]
  );
  return getLayout(organizerId, rows[0].id);
}

export async function updateLayout(organizerId, layoutId, { name, definition }) {
  const layout = await getLayout(organizerId, layoutId);
  if (definition && layout.inUse) {
    throw ApiError.conflict('This layout is used by a published event; create a new layout instead');
  }
  const { sets, params } = buildSet(
    { name, definition, totalSeats: definition ? countSeats(definition) : undefined },
    { name: 'name', definition: 'definition', totalSeats: 'total_seats' }
  );
  params.push(layoutId);
  await query(`UPDATE seat_layouts SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return getLayout(organizerId, layoutId);
}

export async function deleteLayout(organizerId, layoutId) {
  await getLayout(organizerId, layoutId);
  const used = await query('SELECT 1 FROM events WHERE seat_layout_id = $1 LIMIT 1', [layoutId]);
  if (used.rowCount) throw ApiError.conflict('This layout is used by events and cannot be deleted');
  await query('DELETE FROM seat_layouts WHERE id = $1', [layoutId]);
}
