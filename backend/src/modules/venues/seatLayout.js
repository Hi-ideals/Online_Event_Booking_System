import { z } from 'zod';

/*
 * Seat layout definition:
 * {
 *   sections: [
 *     { key: "VIP", name: "VIP Block", rows: [ { label: "A", seats: 12, blocked: [6, 7] } ] }
 *   ]
 * }
 * `blocked` lists seat numbers that do not exist or cannot be sold (aisles, pillars, camera spots).
 */

const MAX_SEATS = 10000;

const rowSchema = z
  .object({
    label: z.string().trim().regex(/^[A-Za-z0-9]{1,10}$/, 'Row label must be 1-10 letters/digits'),
    seats: z.number().int().min(1).max(200),
    blocked: z.array(z.number().int().min(1)).max(200).optional().default([]),
  })
  .refine((row) => row.blocked.every((n) => n <= row.seats), {
    message: 'Blocked seat numbers must be within the row',
    path: ['blocked'],
  });

const sectionSchema = z
  .object({
    key: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Section key must be 1-40 letters, digits, _ or -'),
    name: z.string().trim().min(1).max(60),
    rows: z.array(rowSchema).min(1).max(100),
  })
  .refine((s) => new Set(s.rows.map((r) => r.label.toUpperCase())).size === s.rows.length, {
    message: 'Row labels must be unique within a section',
    path: ['rows'],
  });

export const layoutDefinitionSchema = z
  .object({ sections: z.array(sectionSchema).min(1).max(50) })
  .refine((d) => new Set(d.sections.map((s) => s.key)).size === d.sections.length, {
    message: 'Section keys must be unique',
    path: ['sections'],
  })
  .refine((d) => countSeats(d) > 0 && countSeats(d) <= MAX_SEATS, {
    message: `A layout must have between 1 and ${MAX_SEATS} sellable seats`,
    path: ['sections'],
  });

function sellableInRow(row) {
  return row.seats - new Set(row.blocked ?? []).size;
}

export function countSeats(definition, sectionKeys) {
  const keys = sectionKeys ? new Set(sectionKeys) : null;
  return definition.sections
    .filter((s) => !keys || keys.has(s.key))
    .reduce((sum, s) => sum + s.rows.reduce((n, r) => n + sellableInRow(r), 0), 0);
}

export function sectionKeys(definition) {
  return definition.sections.map((s) => s.key);
}

/** Expands the sellable seats of the given sections into flat seat records. */
export function expandSeats(definition, keys) {
  const wanted = new Set(keys);
  const seats = [];
  for (const section of definition.sections) {
    if (!wanted.has(section.key)) continue;
    for (const row of section.rows) {
      const blocked = new Set(row.blocked ?? []);
      for (let n = 1; n <= row.seats; n += 1) {
        if (blocked.has(n)) continue;
        seats.push({
          sectionKey: section.key,
          rowLabel: row.label,
          seatNumber: n,
          seatLabel: `${section.name} - ${row.label}${n}`,
        });
      }
    }
  }
  return seats;
}
