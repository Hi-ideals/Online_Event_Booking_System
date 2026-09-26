import { z } from 'zod';
import { clearable, idParam, pagination, uuid } from '../../utils/schemas.js';
import { layoutDefinitionSchema } from './seatLayout.js';

export { idParam };
export const venueIdParam = z.object({ venueId: uuid });

const venueFields = {
  name: z.string().trim().min(2).max(160),
  addressLine: z.string().trim().min(3).max(300),
  city: z.string().trim().min(2).max(100),
  state: clearable(z.string().trim().max(100)),
  pincode: clearable(z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode')),
  country: z.string().trim().min(2).max(60).optional(),
  capacity: clearable(z.number().int().positive()),
  mapUrl: clearable(z.url('Enter a valid URL')),
};

export const createVenueSchema = z.object(venueFields);

export const updateVenueSchema = z
  .object(Object.fromEntries(Object.entries(venueFields).map(([k, v]) => [k, v.optional()])))
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const listVenuesQuery = z.object({
  search: z.string().trim().max(100).optional(),
  ...pagination,
});

export const createLayoutSchema = z.object({
  name: z.string().trim().min(2).max(120),
  definition: layoutDefinitionSchema,
});

export const updateLayoutSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    definition: layoutDefinitionSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
