import { z } from 'zod';

// Client-side rules mirror the API so users see problems before submitting.
export const emailSchema = z.string().trim().min(1, 'Email is required').email('Enter a valid email');

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

/** Optional phone: empty string becomes undefined. */
export const optionalPhone = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .refine((v) => v === undefined || /^\+?[0-9]{10,15}$/.test(v), 'Enter a valid phone number')
  .optional();

/** Optional text: empty string becomes undefined (or null when `clearable`, to clear saved values). */
export const optionalText = (max, { clearable = false } = {}) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .transform((v) => v || (clearable ? null : undefined))
    .optional();
