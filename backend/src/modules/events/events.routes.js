import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.js';
import { imageUpload } from '../../middleware/upload.js';
import validate from '../../middleware/validate.js';
import { created, ok, paginate } from '../../utils/response.js';
import * as adminService from './events.admin.service.js';
import * as publicService from './events.public.service.js';
import * as service from './events.service.js';
import {
  adminEventsQuery,
  blockEventSchema,
  cancelEventSchema,
  createEventSchema,
  createTierSchema,
  featureEventSchema,
  idOrSlugParam,
  idParam,
  organizerEventsQuery,
  searchEventsQuery,
  tierParams,
  updateEventSchema,
  updateTierSchema,
} from './events.validation.js';

const list = (res, q, { items, total }) => ok(res, { items, pagination: paginate(q.page, q.limit, total) });

// ================= Public: /events =================
export const publicRouter = Router();

publicRouter.get('/', validate({ query: searchEventsQuery }), async (req, res) => {
  return list(res, req.validatedQuery, await publicService.searchEvents(req.validatedQuery));
});

publicRouter.get('/cities', async (_req, res) => ok(res, { items: await publicService.listCities() }));

publicRouter.get('/:idOrSlug', validate({ params: idOrSlugParam }), async (req, res) => {
  return ok(res, { event: await publicService.getPublicEvent(req.params.idOrSlug) });
});

publicRouter.get('/:idOrSlug/seats', validate({ params: idOrSlugParam }), async (req, res) => {
  return ok(res, { seatMap: await publicService.getSeatMap(req.params.idOrSlug) });
});

// ================= Organizer: /organizer/events =================
export const organizerRouter = Router();
organizerRouter.use(authenticate, authorize('organizer'));

organizerRouter.get('/', validate({ query: organizerEventsQuery }), async (req, res) => {
  return list(res, req.validatedQuery, await service.listEvents(req.user.id, req.validatedQuery));
});

organizerRouter.post('/', validate({ body: createEventSchema }), async (req, res) => {
  return created(res, { event: await service.createEvent(req.user.id, req.body, req.ip) }, 'Event created as draft');
});

organizerRouter.get('/:id', validate({ params: idParam }), async (req, res) => {
  return ok(res, { event: await service.getEvent(req.user.id, req.params.id) });
});

organizerRouter.patch('/:id', validate({ params: idParam, body: updateEventSchema }), async (req, res) => {
  return ok(res, { event: await service.updateEvent(req.user.id, req.params.id, req.body, req.ip) }, 'Event updated');
});

organizerRouter.delete('/:id', validate({ params: idParam }), async (req, res) => {
  await service.deleteEvent(req.user.id, req.params.id, req.ip);
  return ok(res, undefined, 'Event deleted');
});

organizerRouter.post('/:id/banner', validate({ params: idParam }), imageUpload('events', 'banner'), async (req, res) => {
  return ok(res, { event: await service.setBanner(req.user.id, req.params.id, req.file.publicUrl) }, 'Banner uploaded');
});

organizerRouter.post('/:id/publish', validate({ params: idParam }), async (req, res) => {
  return ok(res, { event: await service.publishEvent(req.user.id, req.params.id, req.ip) }, 'Event published');
});

organizerRouter.post('/:id/close-sales', validate({ params: idParam }), async (req, res) => {
  return ok(res, { event: await service.closeSales(req.user.id, req.params.id, req.ip) }, 'Ticket sales closed');
});

organizerRouter.post('/:id/reopen-sales', validate({ params: idParam }), async (req, res) => {
  return ok(res, { event: await service.reopenSales(req.user.id, req.params.id, req.ip) }, 'Ticket sales reopened');
});

organizerRouter.post('/:id/cancel', validate({ params: idParam, body: cancelEventSchema }), async (req, res) => {
  return ok(res, { event: await service.cancelEvent(req.user.id, req.params.id, req.body.reason, req.ip) }, 'Event cancelled');
});

organizerRouter.post('/:id/tiers', validate({ params: idParam, body: createTierSchema }), async (req, res) => {
  return created(res, { event: await service.createTier(req.user.id, req.params.id, req.body, req.ip) }, 'Ticket tier added');
});

organizerRouter.patch('/:id/tiers/:tierId', validate({ params: tierParams, body: updateTierSchema }), async (req, res) => {
  const event = await service.updateTier(req.user.id, req.params.id, req.params.tierId, req.body, req.ip);
  return ok(res, { event }, 'Ticket tier updated');
});

organizerRouter.delete('/:id/tiers/:tierId', validate({ params: tierParams }), async (req, res) => {
  const event = await service.deleteTier(req.user.id, req.params.id, req.params.tierId, req.ip);
  return ok(res, { event }, 'Ticket tier deleted');
});

// ================= Admin: /admin/events =================
export const adminRouter = Router();
adminRouter.use(authenticate, authorize('admin'));

adminRouter.get('/', validate({ query: adminEventsQuery }), async (req, res) => {
  return list(res, req.validatedQuery, await adminService.listEvents(req.validatedQuery));
});

adminRouter.get('/:id', validate({ params: idParam }), async (req, res) => {
  return ok(res, { event: await adminService.getEvent(req.params.id) });
});

adminRouter.patch('/:id/feature', validate({ params: idParam, body: featureEventSchema }), async (req, res) => {
  const event = await adminService.setFeatured(req.user.id, req.params.id, req.body.isFeatured, req.ip);
  return ok(res, { event }, req.body.isFeatured ? 'Event featured' : 'Event unfeatured');
});

adminRouter.patch('/:id/block', validate({ params: idParam, body: blockEventSchema }), async (req, res) => {
  return ok(res, { event: await adminService.blockEvent(req.user.id, req.params.id, req.body.reason, req.ip) }, 'Event blocked');
});

adminRouter.patch('/:id/unblock', validate({ params: idParam }), async (req, res) => {
  return ok(res, { event: await adminService.unblockEvent(req.user.id, req.params.id, req.ip) }, 'Event unblocked');
});
