import { z } from 'zod';

export const uuid = z.uuid('Invalid id');
export const idParam = z.object({ id: uuid });

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

/** ISO 8601 date-time with timezone offset, e.g. 2026-12-31T18:30:00+05:30 or ...Z */
export const isoDateTime = z.iso.datetime({ offset: true, message: 'Use an ISO date-time, e.g. 2026-12-31T18:30:00+05:30' });

/** Query-string boolean: accepts true/false/1/0. */
export const queryBoolean = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** Accepts null (to clear a value) or the given schema; undefined means "leave unchanged". */
export const clearable = (schema) => schema.nullable().optional();
