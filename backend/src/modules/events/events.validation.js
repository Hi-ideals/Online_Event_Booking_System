import { z } from 'zod';
import { clearable, idParam, isoDateTime, pagination, queryBoolean, uuid } from '../../utils/schemas.js';

export { idParam };
export const tierParams = z.object({ id: uuid, tierId: uuid });
export const idOrSlugParam = z.object({ idOrSlug: z.string().trim().min(1).max(240) });

const endAfterStart = (v, ctx) => {
  if (v.startAt && v.endAt && new Date(v.endAt) <= new Date(v.startAt)) {
    ctx.addIssue({ code: 'custom', message: 'End time must be after start time', path: ['endAt'] });
  }
};

const eventFields = {
  title: z.string().trim().min(3).max(200),
  summary: clearable(z.string().trim().max(300)),
  description: clearable(z.string().trim().max(20000)),
  categoryId: z.number().int().positive(),
  venueId: uuid,
  seatingType: z.enum(['general', 'seated']),
  seatLayoutId: clearable(uuid),
  startAt: isoDateTime,
  endAt: isoDateTime,
  tags: z.array(z.string().trim().min(1).max(30)).max(10),
  maxTicketsPerOrder: z.number().int().min(1).max(50),
  refundAllowed: z.boolean(),
  refundCutoffHours: z.number().int().min(0).max(720),
  refundPercent: z.number().int().min(0).max(100),
};

export const createEventSchema = z
  .object({
    ...eventFields,
    seatingType: eventFields.seatingType.default('general'),
    tags: eventFields.tags.default([]),
    maxTicketsPerOrder: eventFields.maxTicketsPerOrder.default(10),
    refundAllowed: eventFields.refundAllowed.default(true),
    refundCutoffHours: eventFields.refundCutoffHours.default(24),
    refundPercent: eventFields.refundPercent.default(100),
  })
  .superRefine(endAfterStart);

export const updateEventSchema = z
  .object(Object.fromEntries(Object.entries(eventFields).map(([k, v]) => [k, v.optional()])))
  .superRefine(endAfterStart)
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const cancelEventSchema = z.object({
  reason: z.string().trim().min(5, 'Please give a reason').max(1000),
});

export const organizerEventsQuery = z.object({
  status: z.enum(['draft', 'published', 'sales_closed', 'completed', 'cancelled']).optional(),
  search: z.string().trim().max(100).optional(),
  ...pagination,
});

// ----- ticket tiers -----
const saleWindowValid = (v, ctx) => {
  if (v.saleStartAt && v.saleEndAt && new Date(v.saleEndAt) <= new Date(v.saleStartAt)) {
    ctx.addIssue({ code: 'custom', message: 'Sale end must be after sale start', path: ['saleEndAt'] });
  }
};

const tierFields = {
  name: z.string().trim().min(1).max(80),
  description: clearable(z.string().trim().max(500)),
  price: z.number().min(0).max(1000000).multipleOf(0.01, 'Price can have at most 2 decimals'),
  quantity: z.number().int().min(1).max(100000),
  sectionKeys: z.array(z.string().trim().min(1).max(40)).min(1).max(50),
  maxPerOrder: clearable(z.number().int().min(1).max(50)),
  saleStartAt: clearable(isoDateTime),
  saleEndAt: clearable(isoDateTime),
  sortOrder: z.number().int().min(0).max(1000),
  isActive: z.boolean(),
};

export const createTierSchema = z
  .object({
    ...tierFields,
    quantity: tierFields.quantity.optional(),
    sectionKeys: tierFields.sectionKeys.optional(),
    sortOrder: tierFields.sortOrder.default(0),
    isActive: tierFields.isActive.default(true),
  })
  .superRefine(saleWindowValid);

export const updateTierSchema = z
  .object(Object.fromEntries(Object.entries(tierFields).map(([k, v]) => [k, v.optional()])))
  .superRefine(saleWindowValid)
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

// ----- public search -----
export const searchEventsQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: z.string().trim().max(80).optional(),
    city: z.string().trim().max(100).optional(),
    dateFrom: z.iso.date('Use YYYY-MM-DD').optional(),
    dateTo: z.iso.date('Use YYYY-MM-DD').optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    featured: queryBoolean.optional(),
    sort: z.enum(['relevance', 'date', 'price_asc', 'price_desc', 'popular', 'newest']).default('date'),
    page: pagination.page,
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateTo >= v.dateFrom, { message: 'dateTo must not be before dateFrom', path: ['dateTo'] })
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.maxPrice >= v.minPrice, {
    message: 'maxPrice must not be below minPrice',
    path: ['maxPrice'],
  });

// ----- admin -----
export const adminEventsQuery = z.object({
  status: z.enum(['draft', 'published', 'sales_closed', 'completed', 'cancelled']).optional(),
  organizerId: uuid.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  blocked: queryBoolean.optional(),
  featured: queryBoolean.optional(),
  search: z.string().trim().max(100).optional(),
  ...pagination,
});

export const featureEventSchema = z.object({ isFeatured: z.boolean() });
export const blockEventSchema = z.object({ reason: z.string().trim().min(5, 'Please give a reason').max(1000) });
