import { z } from 'zod';
import { idParam, pagination } from '../../utils/schemas.js';
import { password } from '../auth/auth.validation.js';

export { idParam };

export const listUsersQuery = z.object({
  role: z.enum(['attendee', 'organizer', 'admin']).optional(),
  status: z.enum(['active', 'pending_approval', 'rejected', 'suspended']).optional(),
  search: z.string().trim().max(100).optional(),
  ...pagination,
});

export const listOrganizersQuery = z.object({
  status: z.enum(['active', 'pending_approval', 'rejected', 'suspended']).optional(),
  search: z.string().trim().max(100).optional(),
  ...pagination,
});

export const rejectOrganizerSchema = z.object({
  reason: z.string().trim().min(5, 'Please give a reason').max(1000),
});

export const updateStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().max(1000).optional(),
});

export const createAdminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password,
});

export const auditLogQuery = z.object({
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(100).optional(),
  actorId: z.uuid().optional(),
  ...pagination,
});
