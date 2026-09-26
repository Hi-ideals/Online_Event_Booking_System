// Organizer-side event management: events, ticket tiers, publishing and status changes.
import { query, withTransaction } from '../../config/db.js';
import { removeUploadedFile } from '../../middleware/upload.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { uniqueSlug } from '../../utils/slug.js';
import { buildSet } from '../../utils/sql.js';
import { cancelConfirmedOrder, releasePendingOrdersForEvent } from '../bookings/inventory.js';
import { queueEmail } from '../notifications/notifications.service.js';
import { createRefund, scheduleRefundProcessing } from '../payments/refunds.service.js';
import { countSeats, expandSeats, sectionKeys } from '../venues/seatLayout.js';
import { findEventWithTiers, pagedEvents } from './events.repository.js';

const EVENT_COLUMNS = {
  title: 'title', summary: 'summary', description: 'description', categoryId: 'category_id', venueId: 'venue_id',
  seatingType: 'seating_type', seatLayoutId: 'seat_layout_id', startAt: 'start_at', endAt: 'end_at', tags: 'tags',
  maxTicketsPerOrder: 'max_tickets_per_order', refundAllowed: 'refund_allowed',
  refundCutoffHours: 'refund_cutoff_hours', refundPercent: 'refund_percent',
};

const TIER_COLUMNS = {
  name: 'name', description: 'description', price: 'price', quantity: 'quantity', sectionKeys: 'section_keys',
  maxPerOrder: 'max_per_order', saleStartAt: 'sale_start_at', saleEndAt: 'sale_end_at',
  sortOrder: 'sort_order', isActive: 'is_active',
};

// Fields that define inventory and cannot change once tickets can be sold.
const LOCKED_AFTER_PUBLISH = ['venueId', 'seatingType', 'seatLayoutId'];
const CLOSED_STATUSES = ['completed', 'cancelled'];

// ---------- helpers ----------
async function lockOwnedEvent(db, organizerId, eventId) {
  const { rows } = await db.query('SELECT * FROM events WHERE id = $1 AND organizer_id = $2 FOR UPDATE', [eventId, organizerId]);
  if (!rows[0]) throw ApiError.notFound('Event not found');
  return rows[0];
}

function assertEditable(event) {
  if (CLOSED_STATUSES.includes(event.status)) throw ApiError.conflict(`A ${event.status} event cannot be changed`);
}

async function assertActiveCategory(db, categoryId) {
  const { rows } = await db.query('SELECT is_active FROM categories WHERE id = $1', [categoryId]);
  if (!rows[0]) throw ApiError.badRequest('Category does not exist');
  if (!rows[0].is_active) throw ApiError.badRequest('Category is not active');
}

async function assertOwnedVenue(db, organizerId, venueId) {
  const { rowCount } = await db.query('SELECT 1 FROM venues WHERE id = $1 AND organizer_id = $2', [venueId, organizerId]);
  if (!rowCount) throw ApiError.badRequest('Venue not found in your venues');
}

async function loadLayoutForVenue(db, layoutId, venueId) {
  const { rows } = await db.query('SELECT id, definition FROM seat_layouts WHERE id = $1 AND venue_id = $2', [layoutId, venueId]);
  if (!rows[0]) throw ApiError.badRequest('Seat layout does not belong to the selected venue');
  return rows[0];
}

function assertFuture(date, field) {
  if (new Date(date) <= new Date()) throw ApiError.badRequest(`${field} must be in the future`);
}

async function getOwnedEvent(organizerId, eventId, db) {
  const event = await findEventWithTiers(eventId, {}, db);
  if (!event || event.organizer.id !== organizerId) throw ApiError.notFound('Event not found');
  return event;
}

// ---------- events ----------
export async function listEvents(organizerId, { status, search, page, limit }) {
  const params = [organizerId];
  const where = ['e.organizer_id = $1'];
  if (status) {
    params.push(status);
    where.push(`e.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`e.title ILIKE $${params.length}`);
  }
  return pagedEvents({ where, params, orderBy: '"startAt" DESC', page, limit });
}

export async function getEvent(organizerId, eventId) {
  const event = await getOwnedEvent(organizerId, eventId);
  if (event.seatLayoutId) {
    const { rows } = await query('SELECT id, name, definition, total_seats AS "totalSeats" FROM seat_layouts WHERE id = $1', [event.seatLayoutId]);
    event.seatLayout = rows[0] ?? null;
  }
  return event;
}

export async function createEvent(organizerId, input, ip) {
  assertFuture(input.startAt, 'Start time');
  return withTransaction(async (db) => {
    await assertActiveCategory(db, input.categoryId);
    await assertOwnedVenue(db, organizerId, input.venueId);
    const seatLayoutId = input.seatingType === 'seated' ? input.seatLayoutId ?? null : null;
    if (seatLayoutId) await loadLayoutForVenue(db, seatLayoutId, input.venueId);

    const { rows } = await db.query(
      `INSERT INTO events (organizer_id, category_id, venue_id, seat_layout_id, title, slug, summary, description, tags,
                           start_at, end_at, seating_type, max_tickets_per_order, refund_allowed, refund_cutoff_hours, refund_percent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [organizerId, input.categoryId, input.venueId, seatLayoutId, input.title, uniqueSlug(input.title),
        input.summary ?? null, input.description ?? null, input.tags, input.startAt, input.endAt, input.seatingType,
        input.maxTicketsPerOrder, input.refundAllowed, input.refundCutoffHours, input.refundPercent]
    );
    await audit({ actorId: organizerId, action: 'event.created', entityType: 'event', entityId: rows[0].id, ip }, db);
    return getOwnedEvent(organizerId, rows[0].id, db);
  });
}

export async function updateEvent(organizerId, eventId, input, ip) {
  return withTransaction(async (db) => {
    const event = await lockOwnedEvent(db, organizerId, eventId);
    assertEditable(event);

    const changes = { ...input };
    if (event.status !== 'draft') {
      const locked = LOCKED_AFTER_PUBLISH.filter((k) => changes[k] !== undefined);
      if (locked.length) throw ApiError.conflict(`${locked.join(', ')} cannot be changed after publishing`);
    }

    const startAt = changes.startAt ?? event.start_at;
    const endAt = changes.endAt ?? event.end_at;
    if (new Date(endAt) <= new Date(startAt)) throw ApiError.badRequest('End time must be after start time');
    if (changes.startAt) assertFuture(changes.startAt, 'Start time');
    if (changes.categoryId) await assertActiveCategory(db, changes.categoryId);

    const venueId = changes.venueId ?? event.venue_id;
    const seatingType = changes.seatingType ?? event.seating_type;
    if (changes.venueId) await assertOwnedVenue(db, organizerId, changes.venueId);

    if (seatingType === 'general') {
      if (event.seat_layout_id) changes.seatLayoutId = null;
      if (event.seating_type === 'seated') await db.query(`UPDATE ticket_tiers SET section_keys = '{}' WHERE event_id = $1`, [eventId]);
    } else {
      // Keep the current layout only if it still matches the (possibly new) venue.
      const layoutId = changes.seatLayoutId !== undefined ? changes.seatLayoutId : event.seat_layout_id;
      if (layoutId) {
        const sameVenue = await db.query('SELECT 1 FROM seat_layouts WHERE id = $1 AND venue_id = $2', [layoutId, venueId]);
        if (!sameVenue.rowCount) {
          if (changes.seatLayoutId) throw ApiError.badRequest('Seat layout does not belong to the selected venue');
          changes.seatLayoutId = null;
        }
      }
      if (changes.seatLayoutId !== undefined && changes.seatLayoutId !== event.seat_layout_id) {
        // Section assignments refer to the old layout.
        await db.query(`UPDATE ticket_tiers SET section_keys = '{}' WHERE event_id = $1`, [eventId]);
      }
    }

    const { sets, params } = buildSet(changes, EVENT_COLUMNS);
    if (sets.length) {
      params.push(eventId);
      await db.query(`UPDATE events SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }
    await audit({ actorId: organizerId, action: 'event.updated', entityType: 'event', entityId: eventId,
      metadata: { fields: Object.keys(input) }, ip }, db);
    return getOwnedEvent(organizerId, eventId, db);
  });
}

export async function deleteEvent(organizerId, eventId, ip) {
  const bannerUrl = await withTransaction(async (db) => {
    const event = await lockOwnedEvent(db, organizerId, eventId);
    if (event.status !== 'draft') throw ApiError.conflict('Only draft events can be deleted; cancel published events instead');
    await db.query('DELETE FROM events WHERE id = $1', [eventId]);
    await audit({ actorId: organizerId, action: 'event.deleted', entityType: 'event', entityId: eventId,
      metadata: { title: event.title }, ip }, db);
    return event.banner_url;
  });
  removeUploadedFile(bannerUrl);
}

export async function setBanner(organizerId, eventId, bannerUrl) {
  let previous;
  try {
    previous = await withTransaction(async (db) => {
      const event = await lockOwnedEvent(db, organizerId, eventId);
      assertEditable(event);
      await db.query('UPDATE events SET banner_url = $1 WHERE id = $2', [bannerUrl, eventId]);
      return event.banner_url;
    });
  } catch (err) {
    removeUploadedFile(bannerUrl);
    throw err;
  }
  removeUploadedFile(previous);
  return getOwnedEvent(organizerId, eventId);
}

// ---------- status changes ----------
export async function publishEvent(organizerId, eventId, ip) {
  return withTransaction(async (db) => {
    const event = await lockOwnedEvent(db, organizerId, eventId);
    if (event.status !== 'draft') throw ApiError.conflict('Only draft events can be published');
    if (event.is_blocked) throw ApiError.forbidden(`This event was blocked by an admin: ${event.blocked_reason}`);
    assertFuture(event.start_at, 'Start time');
    await assertActiveCategory(db, event.category_id);

    const { rows: tiers } = await db.query('SELECT id, name, quantity, section_keys FROM ticket_tiers WHERE event_id = $1', [eventId]);
    if (!tiers.length) throw ApiError.badRequest('Add at least one ticket tier before publishing');

    if (event.seating_type === 'general') {
      const empty = tiers.filter((t) => t.quantity < 1);
      if (empty.length) throw ApiError.badRequest(`Set a quantity for: ${empty.map((t) => t.name).join(', ')}`);
    } else {
      if (!event.seat_layout_id) throw ApiError.badRequest('Select a seat layout before publishing a seated event');
      const layout = await loadLayoutForVenue(db, event.seat_layout_id, event.venue_id);
      const validKeys = new Set(sectionKeys(layout.definition));
      const assigned = new Set();
      for (const tier of tiers) {
        if (!tier.section_keys.length) throw ApiError.badRequest(`Assign seat sections to tier "${tier.name}"`);
        for (const key of tier.section_keys) {
          if (!validKeys.has(key)) throw ApiError.badRequest(`Tier "${tier.name}" uses unknown section "${key}"`);
          if (assigned.has(key)) throw ApiError.badRequest(`Section "${key}" is assigned to more than one tier`);
          assigned.add(key);
        }
      }

      // Generate this event's own seat inventory from the layout.
      await db.query('DELETE FROM event_seats WHERE event_id = $1', [eventId]);
      for (const tier of tiers) {
        const seats = expandSeats(layout.definition, tier.section_keys);
        await db.query(
          `INSERT INTO event_seats (event_id, tier_id, section_key, row_label, seat_number, seat_label)
           SELECT $1, $2, * FROM UNNEST($3::text[], $4::text[], $5::int[], $6::text[])`,
          [eventId, tier.id, seats.map((s) => s.sectionKey), seats.map((s) => s.rowLabel),
            seats.map((s) => s.seatNumber), seats.map((s) => s.seatLabel)]
        );
        await db.query('UPDATE ticket_tiers SET quantity = $1 WHERE id = $2', [seats.length, tier.id]);
      }
    }

    await db.query(`UPDATE events SET status = 'published', published_at = NOW() WHERE id = $1`, [eventId]);
    await audit({ actorId: organizerId, action: 'event.published', entityType: 'event', entityId: eventId, ip }, db);
    return getOwnedEvent(organizerId, eventId, db);
  });
}

async function transition(organizerId, eventId, { from, to, action, extraSql = '', extraParams = [], check, after }, ip) {
  return withTransaction(async (db) => {
    const event = await lockOwnedEvent(db, organizerId, eventId);
    if (!from.includes(event.status)) {
      throw ApiError.conflict(`Cannot change event from ${event.status} to ${to}`);
    }
    check?.(event);
    await db.query(`UPDATE events SET status = $1 ${extraSql} WHERE id = $2`, [to, eventId, ...extraParams]);
    await after?.(db, event);
    await audit({ actorId: organizerId, action, entityType: 'event', entityId: eventId,
      metadata: extraParams.length ? { reason: extraParams[0] } : {}, ip }, db);
    return getOwnedEvent(organizerId, eventId, db);
  });
}

export const closeSales = (organizerId, eventId, ip) =>
  transition(organizerId, eventId, { from: ['published'], to: 'sales_closed', action: 'event.sales_closed' }, ip);

export const reopenSales = (organizerId, eventId, ip) =>
  transition(organizerId, eventId, {
    from: ['sales_closed'],
    to: 'published',
    action: 'event.sales_reopened',
    check: (event) => {
      if (event.is_blocked) throw ApiError.forbidden('This event was blocked by an admin');
      if (new Date(event.end_at) <= new Date()) throw ApiError.conflict('The event has already ended');
    },
  }, ip);

/** Cancels every booking of a cancelled event: unpaid ones are released, paid ones get a full refund. */
async function cancelAllBookings(db, eventId, organizerId, reason) {
  const note = `Event cancelled by organizer: ${reason}`;
  await releasePendingOrdersForEvent(db, eventId, note);
  const { rows } = await db.query(
    `SELECT id, total_amount, contact_email FROM orders WHERE event_id = $1 AND status = 'confirmed' ORDER BY id`,
    [eventId]
  );
  for (const order of rows) {
    await cancelConfirmedOrder(db, order.id, { refundAmount: order.total_amount, reason: note, actorId: organizerId });
    await createRefund(db, { orderId: order.id, amount: order.total_amount, type: 'event_cancellation', reason: note, actorId: organizerId });
    await queueEmail(db, { template: 'booking_cancelled', to: order.contact_email, payload: { orderId: order.id, byEvent: true } });
  }
}

export async function cancelEvent(organizerId, eventId, reason, ip) {
  const event = await transition(organizerId, eventId, {
    from: ['published', 'sales_closed'],
    to: 'cancelled',
    action: 'event.cancelled',
    extraSql: ', cancelled_at = NOW(), cancellation_reason = $3',
    extraParams: [reason],
    after: (db) => cancelAllBookings(db, eventId, organizerId, reason),
  }, ip);
  scheduleRefundProcessing();
  return event;
}

// ---------- ticket tiers ----------
async function seatedTierQuantity(db, event, keys, excludeTierId) {
  if (!event.seat_layout_id) throw ApiError.badRequest('Select a seat layout for this event first');
  const layout = await loadLayoutForVenue(db, event.seat_layout_id, event.venue_id);
  const valid = new Set(sectionKeys(layout.definition));
  const unknown = keys.filter((k) => !valid.has(k));
  if (unknown.length) throw ApiError.badRequest(`Unknown seat sections: ${unknown.join(', ')}`);

  const { rows } = await db.query(
    `SELECT name, section_keys FROM ticket_tiers WHERE event_id = $1 AND section_keys && $2::text[] AND id <> COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000')`,
    [event.id, keys, excludeTierId ?? null]
  );
  if (rows.length) throw ApiError.conflict(`Sections already assigned to tier "${rows[0].name}"`);
  return countSeats(layout.definition, keys);
}

export async function createTier(organizerId, eventId, input, ip) {
  return withTransaction(async (db) => {
    const event = await lockOwnedEvent(db, organizerId, eventId);
    assertEditable(event);
    const fields = { ...input };

    if (event.seating_type === 'seated') {
      if (event.status !== 'draft') throw ApiError.conflict('Tiers of a published seated event cannot be added');
      if (!fields.sectionKeys?.length) throw ApiError.badRequest('sectionKeys is required for seated events');
      fields.quantity = await seatedTierQuantity(db, event, fields.sectionKeys);
    } else {
      if (!fields.quantity) throw ApiError.badRequest('quantity is required for general admission events');
      fields.sectionKeys = [];
    }

    const { rows } = await db.query(
      `INSERT INTO ticket_tiers (event_id, name, description, price, quantity, section_keys, max_per_order,
                                 sale_start_at, sale_end_at, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [eventId, fields.name, fields.description ?? null, fields.price, fields.quantity, fields.sectionKeys,
        fields.maxPerOrder ?? null, fields.saleStartAt ?? null, fields.saleEndAt ?? null, fields.sortOrder, fields.isActive]
    );
    await audit({ actorId: organizerId, action: 'tier.created', entityType: 'ticket_tier', entityId: rows[0].id,
      metadata: { eventId, name: fields.name, price: fields.price }, ip }, db);
    return getOwnedEvent(organizerId, eventId, db);
  });
}

async function lockTier(db, eventId, tierId) {
  const { rows } = await db.query('SELECT * FROM ticket_tiers WHERE id = $1 AND event_id = $2 FOR UPDATE', [tierId, eventId]);
  if (!rows[0]) throw ApiError.notFound('Ticket tier not found');
  return rows[0];
}

export async function updateTier(organizerId, eventId, tierId, input, ip) {
  return withTransaction(async (db) => {
    const event = await lockOwnedEvent(db, organizerId, eventId);
    assertEditable(event);
    const tier = await lockTier(db, eventId, tierId);
    const fields = { ...input };

    if (event.seating_type === 'seated') {
      if (fields.quantity !== undefined) throw ApiError.badRequest('Seated tier quantity comes from its seat sections');
      if (fields.sectionKeys) {
        if (event.status !== 'draft') throw ApiError.conflict('Seat sections cannot change after publishing');
        fields.quantity = await seatedTierQuantity(db, event, fields.sectionKeys, tierId);
      }
    } else {
      if (fields.sectionKeys) throw ApiError.badRequest('General admission tiers do not use seat sections');
      if (fields.quantity !== undefined && fields.quantity < tier.sold_count + tier.held_count) {
        throw ApiError.conflict(`Quantity cannot be lower than tickets sold or being booked (${tier.sold_count + tier.held_count})`);
      }
    }

    const saleStart = fields.saleStartAt !== undefined ? fields.saleStartAt : tier.sale_start_at;
    const saleEnd = fields.saleEndAt !== undefined ? fields.saleEndAt : tier.sale_end_at;
    if (saleStart && saleEnd && new Date(saleEnd) <= new Date(saleStart)) {
      throw ApiError.badRequest('Sale end must be after sale start');
    }

    const { sets, params } = buildSet(fields, TIER_COLUMNS);
    params.push(tierId);
    await db.query(`UPDATE ticket_tiers SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    await audit({ actorId: organizerId, action: 'tier.updated', entityType: 'ticket_tier', entityId: tierId,
      metadata: { eventId, ...input }, ip }, db);
    return getOwnedEvent(organizerId, eventId, db);
  });
}

export async function deleteTier(organizerId, eventId, tierId, ip) {
  return withTransaction(async (db) => {
    const event = await lockOwnedEvent(db, organizerId, eventId);
    assertEditable(event);
    const tier = await lockTier(db, eventId, tierId);
    if (tier.sold_count > 0 || tier.held_count > 0) throw ApiError.conflict('This tier has bookings; deactivate it instead');
    if (event.seating_type === 'seated' && event.status !== 'draft') {
      throw ApiError.conflict('Tiers of a published seated event cannot be deleted; deactivate it instead');
    }
    await db.query('DELETE FROM ticket_tiers WHERE id = $1', [tierId]);
    await audit({ actorId: organizerId, action: 'tier.deleted', entityType: 'ticket_tier', entityId: tierId,
      metadata: { eventId, name: tier.name }, ip }, db);
    return getOwnedEvent(organizerId, eventId, db);
  });
}
