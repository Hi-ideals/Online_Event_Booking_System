import { z } from 'zod';
import { idParam, pagination, uuid } from '../../utils/schemas.js';
import { phone } from '../auth/auth.validation.js';

export { idParam };

const unique = (values) => new Set(values).size === values.length;

export const createBookingSchema = z
  .object({
    eventId: uuid,
    items: z
      .array(z.object({ tierId: uuid, quantity: z.number().int().min(1).max(50) }))
      .min(1)
      .max(20)
      .refine((items) => unique(items.map((i) => i.tierId)), { message: 'Each tier can appear only once' })
      .optional(),
    seatIds: z
      .array(uuid)
      .min(1)
      .max(50)
      .refine(unique, { message: 'Each seat can be selected only once' })
      .optional(),
    contact: z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.email('Enter a valid email').trim().toLowerCase(),
        phone: phone.optional(),
      })
      .optional(),
  })
  .refine((v) => Boolean(v.items) !== Boolean(v.seatIds), {
    message: 'Send either "items" (general admission) or "seatIds" (reserved seating)',
    path: ['items'],
  });

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const status = z.enum(['pending_payment', 'confirmed', 'expired', 'failed', 'cancelled']);

export const myBookingsQuery = z.object({
  status: status.optional(),
  when: z.enum(['upcoming', 'past']).optional(),
  ...pagination,
});

export const eventBookingsQuery = z.object({
  status: status.optional(),
  search: z.string().trim().max(100).optional(),
  ...pagination,
});

export const attendeesQuery = z.object({
  search: z.string().trim().max(100).optional(),
  tierId: uuid.optional(),
  format: z.enum(['json', 'csv']).default('json'),
  page: pagination.page,
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const adminBookingsQuery = z.object({
  status: status.optional(),
  eventId: uuid.optional(),
  userId: uuid.optional(),
  search: z.string().trim().max(100).optional(),
  ...pagination,
});
