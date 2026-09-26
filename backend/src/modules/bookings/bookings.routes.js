import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import { created, ok, paginate } from '../../utils/response.js';
import { uuid } from '../../utils/schemas.js';
import * as documents from './documents.js';
import * as service from './bookings.service.js';
import {
  adminBookingsQuery,
  attendeesQuery,
  cancelBookingSchema,
  createBookingSchema,
  eventBookingsQuery,
  idParam,
  myBookingsQuery,
} from './bookings.validation.js';

// Byte-order mark so Excel opens the CSV as UTF-8.
const UTF8_BOM = String.fromCharCode(0xfeff);

function sendPdf(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

const list = (res, q, { items, total, ...rest }) => ok(res, { items, pagination: paginate(q.page, q.limit, total), ...rest });

// ================= Attendee: /bookings =================
export const attendeeRouter = Router();
attendeeRouter.use(authenticate, authorize('attendee'));

attendeeRouter.post('/', validate({ body: createBookingSchema }), async (req, res) => {
  const booking = await service.createBooking(req.user, req.body, req.ip);
  const message = booking.status === 'confirmed'
    ? 'Booking confirmed'
    : `Tickets reserved. Complete payment before ${new Date(booking.expiresAt).toLocaleTimeString('en-IN')}`;
  return created(res, { booking }, message);
});

attendeeRouter.get('/', validate({ query: myBookingsQuery }), async (req, res) => {
  return list(res, req.validatedQuery, await service.listMyBookings(req.user.id, req.validatedQuery));
});

attendeeRouter.get('/:id', validate({ params: idParam }), async (req, res) => {
  return ok(res, { booking: await service.getMyBooking(req.user.id, req.params.id) });
});

attendeeRouter.get('/:id/cancellation-quote', validate({ params: idParam }), async (req, res) => {
  await service.getMyBooking(req.user.id, req.params.id);
  return ok(res, { quote: await service.cancellationQuote(req.params.id) });
});

attendeeRouter.get('/:id/tickets', validate({ params: idParam }), async (req, res) => {
  const booking = await service.getMyBooking(req.user.id, req.params.id);
  return ok(res, { orderNumber: booking.orderNumber, status: booking.status, tickets: await documents.listTickets(booking.id) });
});

attendeeRouter.get('/:id/tickets.pdf', validate({ params: idParam }), async (req, res) => {
  const booking = await service.getMyBooking(req.user.id, req.params.id);
  sendPdf(res, await documents.ticketsPdf(booking.id), `tickets-${booking.orderNumber}.pdf`);
});

attendeeRouter.get('/:id/invoice.pdf', validate({ params: idParam }), async (req, res) => {
  const booking = await service.getMyBooking(req.user.id, req.params.id);
  sendPdf(res, await documents.invoicePdf(booking.id), `invoice-${booking.orderNumber}.pdf`);
});

attendeeRouter.post('/:id/cancel', validate({ params: idParam, body: cancelBookingSchema }), async (req, res) => {
  const booking = await service.cancelMyBooking(req.user.id, req.params.id, req.body.reason, req.ip);
  return ok(res, { booking }, 'Booking cancelled');
});

// ================= Organizer: /organizer/events/:eventId/... =================
// Auth is applied per route: this router shares the /organizer/events prefix with the events router.
export const organizerRouter = Router({ mergeParams: true });
const organizerOnly = [authenticate, authorize('organizer')];
const eventParam = z.object({ eventId: uuid });

organizerRouter.get('/bookings', organizerOnly, validate({ params: eventParam, query: eventBookingsQuery }), async (req, res) => {
  return list(res, req.validatedQuery, await service.listEventBookings(req.user.id, req.params.eventId, req.validatedQuery));
});

organizerRouter.get('/attendees', organizerOnly, validate({ params: eventParam, query: attendeesQuery }), async (req, res) => {
  const q = req.validatedQuery;
  const result = await service.listAttendees(req.user.id, req.params.eventId, q);
  if (q.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendees-${req.params.eventId}.csv"`);
    return res.send(UTF8_BOM + result.csv);
  }
  return list(res, q, result);
});

organizerRouter.get('/sales-summary', organizerOnly, validate({ params: eventParam }), async (req, res) => {
  return ok(res, { summary: await service.salesSummary(req.user.id, req.params.eventId) });
});

// ================= Admin: /admin/bookings =================
export const adminRouter = Router();
adminRouter.use(authenticate, authorize('admin'));

adminRouter.get('/', validate({ query: adminBookingsQuery }), async (req, res) => {
  return list(res, req.validatedQuery, await service.adminListBookings(req.validatedQuery));
});

adminRouter.get('/:id', validate({ params: idParam }), async (req, res) => {
  return ok(res, { booking: await service.adminGetBooking(req.params.id) });
});

adminRouter.get('/:id/invoice.pdf', validate({ params: idParam }), async (req, res) => {
  const booking = await service.adminGetBooking(req.params.id);
  sendPdf(res, await documents.invoicePdf(booking.id), `invoice-${booking.orderNumber}.pdf`);
});