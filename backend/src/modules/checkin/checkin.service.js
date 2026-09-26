import env from '../../config/env.js';
import { query } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { formatDateTime } from '../../utils/dates.js';
import { verifyTicketToken } from '../../utils/ticketToken.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3600 * 1000;

const MESSAGES = {
  checked_in: 'Entry allowed',
  already_checked_in: 'Already checked in',
  cancelled: 'Ticket cancelled',
  wrong_event: 'Ticket is for a different event',
  invalid: 'Invalid ticket',
  not_open: 'Check-in is not open for this event',
};

const TICKET_DETAILS = `
  SELECT t.id, t.event_id, t.ticket_code AS "ticketCode", t.status, t.attendee_name AS "attendeeName",
         t.checked_in_at AS "checkedInAt", t.check_in_gate AS "checkedInGate",
         tt.name AS "tierName", s.seat_label AS "seatLabel", o.order_number AS "orderNumber"
    FROM tickets t
    JOIN ticket_tiers tt ON tt.id = t.tier_id
    JOIN orders o ON o.id = t.order_id
    LEFT JOIN event_seats s ON s.id = t.event_seat_id`;

/** Accepts "TKT-7KQ2-M9XD", "tkt7kq2m9xd" or "7KQ2M9XD" and returns the canonical code. */
export function normalizeTicketCode(input) {
  const compact = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^TKT/, '');
  return compact.length === 8 ? `TKT-${compact.slice(0, 4)}-${compact.slice(4)}` : null;
}

export async function loadOwnEvent(organizerId, eventId) {
  const { rows } = await query(
    'SELECT id, organizer_id, title, status, start_at, end_at FROM events WHERE id = $1 AND organizer_id = $2',
    [eventId, organizerId]
  );
  if (!rows[0]) throw ApiError.notFound('Event not found');
  return rows[0];
}

export function checkInWindow(event) {
  return {
    opensAt: new Date(new Date(event.start_at).getTime() - env.checkIn.opensHoursBefore * HOUR),
    closesAt: new Date(new Date(event.end_at).getTime() + env.checkIn.closesHoursAfter * HOUR),
  };
}

function toTicket(row) {
  if (!row) return null;
  const { id, event_id: _eventId, ...rest } = row;
  return { id, ...rest };
}

/** Finds the ticket a scan refers to. Returns { ticket } or { result } when the input is unusable. */
async function resolveTicket({ qrToken, ticketCode }) {
  let where;
  let value;
  if (qrToken) {
    const decoded = verifyTicketToken(qrToken);
    if (!decoded || !UUID_RE.test(decoded.ticketId)) return { result: 'invalid' };
    [where, value] = ['t.id = $1', decoded.ticketId];
  } else {
    const code = normalizeTicketCode(ticketCode);
    if (!code) return { result: 'invalid' };
    [where, value] = ['t.ticket_code = $1', code];
  }
  const { rows } = await query(`${TICKET_DETAILS} WHERE ${where}`, [value]);
  return rows[0] ? { ticket: rows[0] } : { result: 'invalid' };
}

async function log(entry) {
  await query(
    `INSERT INTO check_in_logs (event_id, ticket_id, scanned_by, gate, method, result, note, scanned_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entry.eventId, entry.ticketId ?? null, entry.userId, entry.gate ?? null, entry.method, entry.result,
      entry.note ?? null, entry.scannedAt ?? new Date()]
  );
}

/**
 * Verifies one scan and admits the ticket if it is valid. The conditional UPDATE makes
 * check-in single-use even when two gates scan the same ticket at the same moment.
 */
async function processScan(event, { qrToken, ticketCode, gate, method, scannedAt, userId }) {
  const at = scannedAt ?? new Date();
  const finish = async (result, ticket, extra = {}) => {
    await log({ eventId: event.id, ticketId: ticket?.id, userId, gate, method, result, scannedAt: at, note: extra.note });
    return { result, allowed: result === 'checked_in', message: extra.message ?? MESSAGES[result], ticket: toTicket(ticket) };
  };

  const { ticket, result } = await resolveTicket({ qrToken, ticketCode });
  if (!ticket) return finish(result);

  if (ticket.event_id !== event.id) {
    const { rows } = await query('SELECT title FROM events WHERE id = $1 AND organizer_id = $2', [ticket.event_id, event.organizer_id]);
    // Only reveal the other event's name if it belongs to the same organizer.
    return finish('wrong_event', rows[0] ? ticket : null, rows[0] && { message: `Ticket is for "${rows[0].title}"` });
  }
  if (ticket.status === 'cancelled') return finish('cancelled', ticket);

  const { opensAt, closesAt } = checkInWindow(event);
  if (at < opensAt || at > closesAt || event.status === 'cancelled') {
    const message = at < opensAt ? `Check-in opens at ${formatDateTime(opensAt)}` : 'Check-in for this event has closed';
    return finish('not_open', ticket, { message: event.status === 'cancelled' ? 'This event was cancelled' : message });
  }

  const { rows: admitted } = await query(
    `UPDATE tickets SET checked_in_at = $2, checked_in_by = $3, check_in_gate = $4
      WHERE id = $1 AND status = 'valid' AND checked_in_at IS NULL
      RETURNING checked_in_at AS "checkedInAt", check_in_gate AS "checkedInGate"`,
    [ticket.id, at, userId, gate ?? null]
  );
  if (admitted[0]) return finish('checked_in', { ...ticket, ...admitted[0] });

  // Lost the race or scanned before: report the original entry.
  const { rows: [current] } = await query(`${TICKET_DETAILS} WHERE t.id = $1`, [ticket.id]);
  if (current.status === 'cancelled') return finish('cancelled', current);
  const where = current.checkedInGate ? ` at ${current.checkedInGate}` : '';
  return finish('already_checked_in', current, { message: `Already checked in${where} on ${formatDateTime(current.checkedInAt)}` });
}

// ---------- public API ----------
export async function scan(user, eventId, { qrToken, ticketCode, gate }) {
  const event = await loadOwnEvent(user.id, eventId);
  return processScan(event, { qrToken, ticketCode, gate, method: qrToken ? 'qr' : 'code', userId: user.id });
}

/** Uploads scans made offline, in the order they happened. Earlier scans win conflicts. */
export async function syncOfflineScans(user, eventId, { gate, scans }) {
  const event = await loadOwnEvent(user.id, eventId);
  const now = Date.now();
  const ordered = scans
    .map((s, index) => ({ ...s, index, at: new Date(Math.min(new Date(s.scannedAt).getTime(), now)) }))
    .sort((a, b) => a.at - b.at);

  const results = [];
  for (const s of ordered) {
    const outcome = await processScan(event, {
      qrToken: s.qrToken, ticketCode: s.ticketCode, gate: s.gate ?? gate, method: 'offline_sync', scannedAt: s.at, userId: user.id,
    });
    results.push({ index: s.index, scannedAt: s.at, ...outcome });
  }
  results.sort((a, b) => a.index - b.index);
  const summary = results.reduce((acc, r) => ({ ...acc, [r.result]: (acc[r.result] ?? 0) + 1 }), {});
  return { processed: results.length, summary, results };
}

export async function undoCheckIn(user, eventId, ticketId, reason, ip) {
  await loadOwnEvent(user.id, eventId);
  const { rows } = await query(
    `UPDATE tickets SET checked_in_at = NULL, checked_in_by = NULL, check_in_gate = NULL
      WHERE id = $1 AND event_id = $2 AND checked_in_at IS NOT NULL
      RETURNING id`,
    [ticketId, eventId]
  );
  if (!rows[0]) throw ApiError.conflict('This ticket is not checked in');
  await log({ eventId, ticketId, userId: user.id, method: 'manual_undo', result: 'undone', note: reason });
  await audit({ actorId: user.id, action: 'checkin.undone', entityType: 'ticket', entityId: ticketId, metadata: { eventId, reason }, ip });
  const { rows: [ticket] } = await query(`${TICKET_DETAILS} WHERE t.id = $1`, [ticketId]);
  return toTicket(ticket);
}

/** Ticket list for scanners that must work without internet. */
export async function manifest(user, eventId) {
  const event = await loadOwnEvent(user.id, eventId);
  const { rows } = await query(
    `${TICKET_DETAILS} WHERE t.event_id = $1 ORDER BY t.ticket_code`,
    [eventId]
  );
  return {
    event: { id: event.id, title: event.title, startAt: event.start_at, endAt: event.end_at, ...checkInWindow(event) },
    generatedAt: new Date(),
    tickets: rows.map(toTicket),
  };
}

export async function stats(eventId) {
  const { rows: [event] } = await query('SELECT id, title, status, start_at, end_at FROM events WHERE id = $1', [eventId]);
  if (!event) throw ApiError.notFound('Event not found');

  const [totals, byTier, byGate, arrivals, scanResults, recent] = await Promise.all([
    query(
      `SELECT COUNT(*) FILTER (WHERE status = 'valid')::int AS "totalTickets",
              COUNT(*) FILTER (WHERE status = 'valid' AND checked_in_at IS NOT NULL)::int AS "checkedIn"
         FROM tickets WHERE event_id = $1`,
      [eventId]
    ),
    query(
      `SELECT tt.id AS "tierId", tt.name, COUNT(t.id)::int AS total, COUNT(t.checked_in_at)::int AS "checkedIn"
         FROM ticket_tiers tt LEFT JOIN tickets t ON t.tier_id = tt.id AND t.status = 'valid'
        WHERE tt.event_id = $1 GROUP BY tt.id ORDER BY tt.sort_order, tt.price`,
      [eventId]
    ),
    query(
      `SELECT COALESCE(check_in_gate, 'Unspecified') AS gate, COUNT(*)::int AS "checkedIn"
         FROM tickets WHERE event_id = $1 AND status = 'valid' AND checked_in_at IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC`,
      [eventId]
    ),
    query(
      `SELECT date_bin('15 minutes', checked_in_at, TIMESTAMPTZ '2000-01-01') AS "slot", COUNT(*)::int AS "checkedIn"
         FROM tickets WHERE event_id = $1 AND status = 'valid' AND checked_in_at IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
      [eventId]
    ),
    query(`SELECT result, COUNT(*)::int AS count FROM check_in_logs WHERE event_id = $1 GROUP BY result`, [eventId]),
    query(
      `SELECT l.id, l.result, l.method, l.gate, l.scanned_at AS "scannedAt", t.ticket_code AS "ticketCode",
              t.attendee_name AS "attendeeName", u.name AS "scannedBy"
         FROM check_in_logs l LEFT JOIN tickets t ON t.id = l.ticket_id LEFT JOIN users u ON u.id = l.scanned_by
        WHERE l.event_id = $1 ORDER BY l.scanned_at DESC, l.id DESC LIMIT 10`,
      [eventId]
    ),
  ]);

  const { totalTickets, checkedIn } = totals.rows[0];
  return {
    event: { id: event.id, title: event.title, status: event.status, startAt: event.start_at, ...checkInWindow(event) },
    totalTickets,
    checkedIn,
    remaining: totalTickets - checkedIn,
    attendanceRate: totalTickets ? Math.round((checkedIn / totalTickets) * 1000) / 10 : 0,
    byTier: byTier.rows,
    byGate: byGate.rows,
    arrivals: arrivals.rows,
    scanResults: Object.fromEntries(scanResults.rows.map((r) => [r.result, r.count])),
    recentScans: recent.rows,
  };
}

export async function listLogs(eventId, { result, gate, page, limit }) {
  const params = [eventId];
  const where = ['l.event_id = $1'];
  if (result) {
    params.push(result);
    where.push(`l.result = $${params.length}`);
  }
  if (gate) {
    params.push(gate);
    where.push(`l.gate = $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const count = await query(`SELECT COUNT(*)::int AS total FROM check_in_logs l WHERE ${whereSql}`, params);
  const { rows } = await query(
    `SELECT l.id, l.result, l.method, l.gate, l.note, l.scanned_at AS "scannedAt",
            t.id AS "ticketId", t.ticket_code AS "ticketCode", t.attendee_name AS "attendeeName", u.name AS "scannedBy"
       FROM check_in_logs l LEFT JOIN tickets t ON t.id = l.ticket_id LEFT JOIN users u ON u.id = l.scanned_by
      WHERE ${whereSql}
      ORDER BY l.scanned_at DESC, l.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows, total: count.rows[0].total };
}
