import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import { created, ok, paginate } from '../../utils/response.js';
import { idParam, pagination, uuid } from '../../utils/schemas.js';
import { salesSummary } from '../bookings/bookings.service.js';
import * as notifications from '../notifications/notifications.service.js';
import * as analytics from './analytics.service.js';
import * as payouts from './payouts.service.js';
import * as refundRequests from './refundRequests.service.js';

// These routers share the /organizer and /admin prefixes with other routers, so auth is applied per route.
const organizerOnly = [authenticate, authorize('organizer')];
const adminOnly = [authenticate, authorize('admin')];

// ----- validation -----
const rangeQuery = z
  .object({ from: z.iso.date('Use YYYY-MM-DD').optional(), to: z.iso.date('Use YYYY-MM-DD').optional() })
  .refine((v) => !v.from || !v.to || v.to >= v.from, { message: 'to must not be before from', path: ['to'] })
  .refine((v) => !v.from || !v.to || (new Date(v.to) - new Date(v.from)) / 864e5 <= 366, { message: 'Range can be at most one year', path: ['to'] });
const percent = z.number().min(0).max(100).multipleOf(0.01);
const payoutsQuery = z.object({ status: z.enum(['pending', 'paid']).optional(), organizerId: uuid.optional(), ...pagination });

// ================= Organizer: /organizer =================
export const organizerRouter = Router();

organizerRouter.get('/earnings', organizerOnly, async (req, res) => {
  return ok(res, { earnings: await payouts.organizerEarnings(req.user.id) });
});

organizerRouter.get('/payouts', organizerOnly, validate({ query: payoutsQuery.omit({ organizerId: true }) }), async (req, res) => {
  const q = req.validatedQuery;
  const { items, total, totalAmount } = await payouts.listPayouts({ ...q, organizerId: req.user.id });
  return ok(res, { items, totalAmount, pagination: paginate(q.page, q.limit, total) });
});

organizerRouter.get('/analytics/overview', organizerOnly, validate({ query: rangeQuery }), async (req, res) => {
  return ok(res, { analytics: await analytics.organizerOverview(req.user.id, req.validatedQuery) });
});

// ================= Attendee: /bookings/:id/refund-requests =================
export const attendeeRouter = Router({ mergeParams: true });
const attendeeOnly = [authenticate, authorize('attendee')];

attendeeRouter.get('/', attendeeOnly, validate({ params: idParam }), async (req, res) => {
  return ok(res, { items: await refundRequests.listForBooking(req.user.id, req.params.id) });
});

attendeeRouter.post(
  '/',
  attendeeOnly,
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(10, 'Please describe the problem (at least 10 characters)').max(2000) }) }),
  async (req, res) => {
    const request = await refundRequests.createRequest(req.user, req.params.id, req.body.reason, req.ip);
    return created(res, { request }, 'Refund request submitted. Our team will review it.');
  }
);

// ================= Admin: /admin =================
export const adminRouter = Router();

adminRouter.get('/analytics/overview', adminOnly, validate({ query: rangeQuery }), async (req, res) => {
  return ok(res, { analytics: await analytics.adminOverview(req.validatedQuery) });
});

adminRouter.get('/settings', adminOnly, async (_req, res) => ok(res, { settings: await payouts.getSettings() }));

adminRouter.patch('/settings', adminOnly, validate({ body: z.object({ commissionPercent: percent }) }), async (req, res) => {
  return ok(res, { settings: await payouts.updateSettings(req.user.id, req.body, req.ip) }, 'Settings updated');
});

adminRouter.patch(
  '/organizers/:id/commission',
  adminOnly,
  validate({ params: idParam, body: z.object({ commissionPercent: percent.nullable() }) }),
  async (req, res) => {
    const result = await payouts.setOrganizerCommission(req.user.id, req.params.id, req.body.commissionPercent, req.ip);
    return ok(res, result, 'Organizer commission updated');
  }
);

adminRouter.get('/events/:id/sales-summary', adminOnly, validate({ params: idParam }), async (req, res) => {
  return ok(res, { summary: await salesSummary(null, req.params.id) });
});

// ----- payouts -----
adminRouter.get('/payouts', adminOnly, validate({ query: payoutsQuery }), async (req, res) => {
  const q = req.validatedQuery;
  const { items, total, totalAmount } = await payouts.listPayouts(q);
  return ok(res, { items, totalAmount, pagination: paginate(q.page, q.limit, total) });
});

adminRouter.post('/payouts/generate', adminOnly, async (req, res) => {
  const result = await payouts.generatePayouts(req.user.id, req.ip);
  return ok(res, result, `${result.created} payout(s) created`);
});

adminRouter.patch(
  '/payouts/:id/mark-paid',
  adminOnly,
  validate({ params: idParam, body: z.object({ reference: z.string().trim().min(3).max(100), notes: z.string().trim().max(1000).optional() }) }),
  async (req, res) => {
    return ok(res, { payout: await payouts.markPayoutPaid(req.user.id, req.params.id, req.body, req.ip) }, 'Payout marked as paid');
  }
);

// ----- refund requests (disputes) -----
adminRouter.get(
  '/refund-requests',
  adminOnly,
  validate({ query: z.object({ status: z.enum(['open', 'approved', 'rejected']).optional(), ...pagination }) }),
  async (req, res) => {
    const q = req.validatedQuery;
    const { items, total } = await refundRequests.listRequests(q);
    return ok(res, { items, pagination: paginate(q.page, q.limit, total) });
  }
);

adminRouter.get('/refund-requests/:id', adminOnly, validate({ params: idParam }), async (req, res) => {
  return ok(res, { request: await refundRequests.getRequest(req.params.id) });
});

adminRouter.post(
  '/refund-requests/:id/approve',
  adminOnly,
  validate({
    params: idParam,
    body: z.object({
      amount: z.number().positive().multipleOf(0.01).optional(),
      cancelBooking: z.boolean().default(false),
      note: z.string().trim().max(1000).optional(),
    }),
  }),
  async (req, res) => {
    const request = await refundRequests.approveRequest(req.user.id, req.params.id, req.body, req.ip);
    return ok(res, { request }, 'Refund request approved');
  }
);

adminRouter.post(
  '/refund-requests/:id/reject',
  adminOnly,
  validate({ params: idParam, body: z.object({ note: z.string().trim().min(5, 'Please explain the decision').max(1000) }) }),
  async (req, res) => {
    const request = await refundRequests.rejectRequest(req.user.id, req.params.id, req.body.note, req.ip);
    return ok(res, { request }, 'Refund request rejected');
  }
);

// ----- email log -----
adminRouter.get(
  '/emails',
  adminOnly,
  validate({
    query: z.object({
      status: z.enum(['queued', 'sent', 'failed']).optional(),
      template: z.string().trim().max(60).optional(),
      to: z.string().trim().max(255).optional(),
      ...pagination,
    }),
  }),
  async (req, res) => {
    const q = req.validatedQuery;
    const { items, total } = await notifications.listEmails(q);
    return ok(res, { items, pagination: paginate(q.page, q.limit, total) });
  }
);
