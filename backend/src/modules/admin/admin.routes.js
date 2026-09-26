import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import ApiError from '../../utils/ApiError.js';
import { created, ok, paginate } from '../../utils/response.js';
import { findPublicUserById } from '../users/users.repository.js';
import * as adminService from './admin.service.js';
import {
  auditLogQuery,
  createAdminSchema,
  idParam,
  listOrganizersQuery,
  listUsersQuery,
  rejectOrganizerSchema,
  updateStatusSchema,
} from './admin.validation.js';

const router = Router();
router.use(authenticate, authorize('admin'));

// ----- Organizer approvals -----
router.get('/organizers', validate({ query: listOrganizersQuery }), async (req, res) => {
  const q = req.validatedQuery;
  const { items, total } = await adminService.listOrganizers(q);
  return ok(res, { items, pagination: paginate(q.page, q.limit, total) });
});

router.patch('/organizers/:id/approve', validate({ params: idParam }), async (req, res) => {
  const organizer = await adminService.approveOrganizer(req.user.id, req.params.id, req.ip);
  return ok(res, { user: organizer }, 'Organizer approved');
});

router.patch('/organizers/:id/reject', validate({ params: idParam, body: rejectOrganizerSchema }), async (req, res) => {
  const organizer = await adminService.rejectOrganizer(req.user.id, req.params.id, req.body.reason, req.ip);
  return ok(res, { user: organizer }, 'Organizer rejected');
});

// ----- User management -----
router.get('/users', validate({ query: listUsersQuery }), async (req, res) => {
  const q = req.validatedQuery;
  const { items, total } = await adminService.listUsers(q);
  return ok(res, { items, pagination: paginate(q.page, q.limit, total) });
});

router.get('/users/:id', validate({ params: idParam }), async (req, res) => {
  const user = await findPublicUserById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  return ok(res, { user });
});

router.patch('/users/:id/status', validate({ params: idParam, body: updateStatusSchema }), async (req, res) => {
  const user = await adminService.updateUserStatus(req.user.id, req.params.id, req.body, req.ip);
  return ok(res, { user }, req.body.status === 'suspended' ? 'User suspended' : 'User reactivated');
});

router.post('/admins', validate({ body: createAdminSchema }), async (req, res) => {
  const user = await adminService.createAdmin(req.user.id, req.body, req.ip);
  return created(res, { user }, 'Admin account created');
});

// ----- Audit log -----
router.get('/audit-logs', validate({ query: auditLogQuery }), async (req, res) => {
  const q = req.validatedQuery;
  const { items, total } = await adminService.listAuditLogs(q);
  return ok(res, { items, pagination: paginate(q.page, q.limit, total) });
});

export default router;
