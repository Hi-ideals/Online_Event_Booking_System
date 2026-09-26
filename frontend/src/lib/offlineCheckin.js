/*
 * Offline check-in: the ticket list (manifest) and scans made without internet are kept in localStorage
 * on the scanning device, then uploaded with /check-in/sync. The server re-checks everything on sync.
 */
const manifestKey = (eventId) => `checkin-manifest:${eventId}`;
const queueKey = (eventId) => `checkin-queue:${eventId}`;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadManifest = (eventId) => read(manifestKey(eventId), null);
export const saveManifest = (eventId, manifest) => write(manifestKey(eventId), manifest);
export const loadQueue = (eventId) => read(queueKey(eventId), []);
export const saveQueue = (eventId, queue) => write(queueKey(eventId), queue);

/** Same rules as the API: "TKT-7KQ2-M9XD", "tkt7kq2m9xd" or "7KQ2M9XD". */
export function normalizeTicketCode(input) {
  const compact = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^TKT/, '');
  return compact.length === 8 ? `TKT-${compact.slice(0, 4)}-${compact.slice(4)}` : null;
}

/** Reads the ticket id from a QR payload (EBT1.<ticketId>.<eventId>.<signature>). */
export function parseQr(token) {
  const parts = String(token).trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'EBT1') return null;
  return { ticketId: parts[1], eventId: parts[2] };
}

const MESSAGES = {
  checked_in: 'Entry allowed',
  already_checked_in: 'Already checked in',
  cancelled: 'Ticket cancelled',
  wrong_event: 'Ticket is for a different event',
  invalid: 'Invalid ticket',
};

/**
 * Decides entry using the downloaded manifest and records the scan in the upload queue.
 * The signature cannot be verified offline, but ticket ids are random UUIDs that only exist in the manifest.
 */
export function offlineScan(eventId, { qrToken, ticketCode, gate }) {
  const manifest = loadManifest(eventId);
  if (!manifest) return { result: 'invalid', allowed: false, message: 'Download the ticket list before scanning offline', ticket: null };

  let ticket = null;
  if (qrToken) {
    const parsed = parseQr(qrToken);
    if (parsed && parsed.eventId !== eventId) return { result: 'wrong_event', allowed: false, message: MESSAGES.wrong_event, ticket: null };
    ticket = parsed && manifest.tickets.find((t) => t.id === parsed.ticketId);
  } else {
    const code = normalizeTicketCode(ticketCode);
    ticket = code && manifest.tickets.find((t) => t.ticketCode === code);
  }

  const finish = (result, extra = {}) => ({ result, allowed: result === 'checked_in', message: extra.message ?? MESSAGES[result], ticket: ticket ?? null, offline: true });
  if (!ticket) return finish('invalid');
  if (ticket.status === 'cancelled') return finish('cancelled');
  if (ticket.checkedInAt) return finish('already_checked_in', { message: `Already checked in${ticket.checkedInGate ? ` at ${ticket.checkedInGate}` : ''}` });

  const scannedAt = new Date().toISOString();
  ticket.checkedInAt = scannedAt;
  ticket.checkedInGate = gate || null;
  saveManifest(eventId, manifest);
  saveQueue(eventId, [...loadQueue(eventId), { ...(qrToken ? { qrToken } : { ticketCode: ticket.ticketCode }), scannedAt, ...(gate && { gate }) }]);
  return finish('checked_in');
}
