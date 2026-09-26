import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import { ok, paginate } from '../../utils/response.js';
import { isoDateTime, pagination, uuid } from '../../utils/schemas.js';
import * as service from './checkin.service.js';

// ----- validation -----
const eventParam = z.object({ eventId: uuid });
const ticketParams = z.object({ eventId: uuid, ticketId: uuid });
const gate = z.string().trim().min(1).max(60).optional();

const scanInput = {
  qrToken: z.string().trim().min(1).max(300).optional(),
  ticketCode: z.string().trim().min(1).max(30).optional(),
};
const oneOf = (v) => Boolean(v.qrToken) !== Boolean(v.ticketCode);
const oneOfMessage = { message: 'Send either "qrToken" or "ticketCode"', path: ['qrToken'] };

const scanSchema = z.object({ ...scanInput, gate }).refine(oneOf, oneOfMessage);

const syncSchema = z.object({
  gate,
  scans: z
    .array(z.object({ ...scanInput, gate, scannedAt: isoDateTime }).refine(oneOf, oneOfMessage))
    .min(1)
    .max(1000),
});

const undoSchema = z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(300) });

const logsQuery = z.object({
  result: z.enum(['checked_in', 'already_checked_in', 'cancelled', 'wrong_event', 'invalid', 'not_open', 'undone']).optional(),
  gate: z.string().trim().max(60).optional(),
  ...pagination,
});

// ================= Organizer: /organizer/events/:eventId/check-in =================
// Auth is applied per route: this router shares the /organizer/events prefix with the events router.
export const organizerRouter = Router({ mergeParams: true });
const organizerOnly = [authenticate, authorize('organizer')];

organizerRouter.post('/', organizerOnly, validate({ params: eventParam, body: scanSchema }), async (req, res) => {
  return ok(res, await service.scan(req.user, req.params.eventId, req.body));
});

organizerRouter.post('/sync', organizerOnly, validate({ params: eventParam, body: syncSchema }), async (req, res) => {
  return ok(res, await service.syncOfflineScans(req.user, req.params.eventId, req.body));
});

organizerRouter.get('/manifest', organizerOnly, validate({ params: eventParam }), async (req, res) => {
  return ok(res, await service.manifest(req.user, req.params.eventId));
});

organizerRouter.get('/stats', organizerOnly, validate({ params: eventParam }), async (req, res) => {
  await service.loadOwnEvent(req.user.id, req.params.eventId);
  return ok(res, { stats: await service.stats(req.params.eventId) });
});

organizerRouter.get('/logs', organizerOnly, validate({ params: eventParam, query: logsQuery }), async (req, res) => {
  await service.loadOwnEvent(req.user.id, req.params.eventId);
  const q = req.validatedQuery;
  const { items, total } = await service.listLogs(req.params.eventId, q);
  return ok(res, { items, pagination: paginate(q.page, q.limit, total) });
});

organizerRouter.post('/:ticketId/undo', organizerOnly, validate({ params: ticketParams, body: undoSchema }), async (req, res) => {
  const ticket = await service.undoCheckIn(req.user, req.params.eventId, req.params.ticketId, req.body.reason, req.ip);
  return ok(res, { ticket }, 'Check-in undone');
});

// ================= Admin: /admin/events/:eventId/check-in =================
export const adminRouter = Router({ mergeParams: true });
const adminOnly = [authenticate, authorize('admin')];

adminRouter.get('/stats', adminOnly, validate({ params: eventParam }), async (req, res) => {
  return ok(res, { stats: await service.stats(req.params.eventId) });
});

adminRouter.get('/logs', adminOnly, validate({ params: eventParam, query: logsQuery }), async (req, res) => {
  const q = req.validatedQuery;
  const { items, total } = await service.listLogs(req.params.eventId, q);
  return ok(res, { items, pagination: paginate(q.page, q.limit, total) });
});
