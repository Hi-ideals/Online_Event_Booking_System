import crypto from 'node:crypto';

// No 0/O or 1/I, so codes are easy to read aloud and type.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length) {
  return Array.from(crypto.randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** e.g. EB260917HWT73E (date + random) */
export function orderNumber() {
  return `EB${new Date().toISOString().slice(2, 10).replaceAll('-', '')}${randomCode(6)}`;
}

/** e.g. TKT-7KQ2-M9XD */
export function ticketCode() {
  const code = randomCode(8);
  return `TKT-${code.slice(0, 4)}-${code.slice(4)}`;
}
