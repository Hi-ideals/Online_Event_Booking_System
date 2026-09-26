import { z } from 'zod';
import { clearable } from '../../utils/schemas.js';
import { password, phone } from '../auth/auth.validation.js';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: clearable(phone),
    organizer: z
      .object({
        organizationName: z.string().trim().min(2).max(160).optional(),
        contactPhone: clearable(phone),
        website: clearable(z.url('Enter a valid URL')),
        address: clearable(z.string().trim().max(500)),
        city: clearable(z.string().trim().max(100)),
        gstNumber: clearable(z.string().trim().max(20)),
        description: clearable(z.string().trim().max(2000)),
        payoutDetails: z
          .object({
            accountHolderName: z.string().trim().max(120).optional(),
            bankName: z.string().trim().max(120).optional(),
            accountNumber: z.string().trim().regex(/^[0-9]{6,20}$/, 'Enter a valid account number').optional(),
            ifscCode: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code').optional(),
            upiId: z.string().trim().max(100).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });
