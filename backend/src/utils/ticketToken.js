import crypto from 'node:crypto';
import env from '../config/env.js';

/*
 * QR payload printed on every ticket: EBT1.<ticketId>.<eventId>.<signature>
 * The signature is an HMAC of the ids with a server secret, so QR codes cannot be forged
 * or edited. Whether the ticket is still valid (not cancelled / not used) is checked
 * against the database at the gate.
 */
const PREFIX = 'EBT1';

function sign(ticketId, eventId) {
  return crypto.createHmac('sha256', env.tickets.qrSecret).update(`${PREFIX}.${ticketId}.${eventId}`).digest('base64url').slice(0, 32);
}

export function createTicketToken(ticketId, eventId) {
  return `${PREFIX}.${ticketId}.${eventId}.${sign(ticketId, eventId)}`;
}

/** Returns { ticketId, eventId } for a genuine token, or null if it is malformed or forged. */
export function verifyTicketToken(token) {
  const parts = String(token ?? '').trim().split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, ticketId, eventId, signature] = parts;
  const expected = Buffer.from(sign(ticketId, eventId));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  return { ticketId, eventId };
}
