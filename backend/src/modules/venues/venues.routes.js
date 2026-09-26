import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import { created, ok, paginate } from '../../utils/response.js';
import * as service from './venues.service.js';
import {
  createLayoutSchema,
  createVenueSchema,
  idParam,
  listVenuesQuery,
  updateLayoutSchema,
  updateVenueSchema,
  venueIdParam,
} from './venues.validation.js';

// Mounted at /organizer
const router = Router();
router.use(authenticate, authorize('organizer'));

// ----- venues -----
router.get('/venues', validate({ query: listVenuesQuery }), async (req, res) => {
  const q = req.validatedQuery;
  const { items, total } = await service.listVenues(req.user.id, q);
  return ok(res, { items, pagination: paginate(q.page, q.limit, total) });
});

router.post('/venues', validate({ body: createVenueSchema }), async (req, res) => {
  return created(res, { venue: await service.createVenue(req.user.id, req.body) }, 'Venue created');
});

router.get('/venues/:id', validate({ params: idParam }), async (req, res) => {
  return ok(res, { venue: await service.getVenue(req.user.id, req.params.id) });
});

router.patch('/venues/:id', validate({ params: idParam, body: updateVenueSchema }), async (req, res) => {
  return ok(res, { venue: await service.updateVenue(req.user.id, req.params.id, req.body) }, 'Venue updated');
});

router.delete('/venues/:id', validate({ params: idParam }), async (req, res) => {
  await service.deleteVenue(req.user.id, req.params.id);
  return ok(res, undefined, 'Venue deleted');
});

// ----- seat layouts -----
router.get('/venues/:venueId/layouts', validate({ params: venueIdParam }), async (req, res) => {
  return ok(res, { items: await service.listLayouts(req.user.id, req.params.venueId) });
});

router.post('/venues/:venueId/layouts', validate({ params: venueIdParam, body: createLayoutSchema }), async (req, res) => {
  const layout = await service.createLayout(req.user.id, req.params.venueId, req.body);
  return created(res, { layout }, 'Seat layout created');
});

router.get('/layouts/:id', validate({ params: idParam }), async (req, res) => {
  return ok(res, { layout: await service.getLayout(req.user.id, req.params.id) });
});

router.patch('/layouts/:id', validate({ params: idParam, body: updateLayoutSchema }), async (req, res) => {
  return ok(res, { layout: await service.updateLayout(req.user.id, req.params.id, req.body) }, 'Seat layout updated');
});

router.delete('/layouts/:id', validate({ params: idParam }), async (req, res) => {
  await service.deleteLayout(req.user.id, req.params.id);
  return ok(res, undefined, 'Seat layout deleted');
});

export default router;
