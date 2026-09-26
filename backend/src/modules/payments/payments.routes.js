import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import { ok, paginate } from '../../utils/response.js';
import { idParam, pagination, uuid } from '../../utils/schemas.js';
import * as payments from './payments.service.js';
import * as refunds from './refunds.service.js';

// ================= Webhook (mounted before the JSON body parser, needs the raw body) =================
export async function webhookHandler(req, res) {
  const result = await payments.handleWebhook(req.params.provider, req.body, {
    signature: req.get('x-razorpay-signature'),
    eventId: req.get('x-razorpay-event-id'),
  });
  res.json({ success: true, duplicate: result.duplicate });
}

// ================= Attendee: /payments =================
export const attendeeRouter = Router();
attendeeRouter.use(authenticate, authorize('attendee'));

attendeeRouter.post('/checkout', validate({ body: z.object({ orderId: uuid }) }), async (req, res) => {
  return ok(res, { checkout: await payments.startCheckout(req.user, req.body.orderId) });
});

const verifySchema = z.object({
  orderId: uuid,
  providerOrderId: z.string().trim().min(1).max(64),
  providerPaymentId: z.string().trim().min(1).max(64),
  signature: z.string().trim().min(1).max(128),
});

attendeeRouter.post('/verify', validate({ body: verifySchema }), async (req, res) => {
  const booking = await payments.verifyCheckout(req.user, req.body);
  return ok(res, { booking }, 'Payment successful. Your tickets are ready.');
});

const mockSchema = z.object({ outcome: z.enum(['success', 'failure']).default('success') });

attendeeRouter.post('/mock/:id/complete', validate({ params: idParam, body: mockSchema }), async (req, res) => {
  const result = await payments.completeMockPayment(req.user, req.params.id, req.body.outcome);
  return ok(res, result, result.outcome === 'success' ? 'Mock payment successful' : 'Mock payment failed');
});

// ================= Admin: /admin/payments, /admin/refunds =================
export const adminPaymentsRouter = Router();
adminPaymentsRouter.use(authenticate, authorize('admin'));

const paymentsQuery = z.object({ status: z.enum(['created', 'captured', 'failed']).optional(), ...pagination });

adminPaymentsRouter.get('/', validate({ query: paymentsQuery }), async (req, res) => {
  const q = req.validatedQuery;
  const { items, total } = await payments.listPayments(q);
  return ok(res, { items, pagination: paginate(q.page, q.limit, total) });
});

export const adminRefundsRouter = Router();
adminRefundsRouter.use(authenticate, authorize('admin'));

const refundsQuery = z.object({
  status: z.enum(['pending', 'processed', 'failed']).optional(),
  type: z.enum(['attendee_cancellation', 'event_cancellation', 'late_payment', 'admin']).optional(),
  ...pagination,
});

adminRefundsRouter.get('/', validate({ query: refundsQuery }), async (req, res) => {
  const q = req.validatedQuery;
  const { items, total } = await refunds.listRefunds(q);
  return ok(res, { items, pagination: paginate(q.page, q.limit, total) });
});

adminRefundsRouter.post('/:id/retry', validate({ params: idParam }), async (req, res) => {
  await refunds.retryRefund(req.user.id, req.params.id, req.ip);
  return ok(res, undefined, 'Refund queued for retry');
});
