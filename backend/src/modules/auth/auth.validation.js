import { z } from 'zod';

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number');

const email = z.email('Enter a valid email').trim().toLowerCase();

const organizerProfile = z.object({
  organizationName: z.string().trim().min(2).max(160),
  contactPhone: phone.optional(),
  website: z.url('Enter a valid URL').optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  gstNumber: z.string().trim().max(20).optional(),
  description: z.string().trim().max(2000).optional(),
});

export const registerSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('attendee'),
    name: z.string().trim().min(2).max(120),
    email,
    password,
    phone: phone.optional(),
  }),
  z.object({
    role: z.literal('organizer'),
    name: z.string().trim().min(2).max(120),
    email,
    password,
    phone: phone.optional(),
    organizer: organizerProfile,
  }),
]);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});
