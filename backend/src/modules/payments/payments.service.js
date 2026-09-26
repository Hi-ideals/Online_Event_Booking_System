import crypto from 'node:crypto';
import { query, withTransaction } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { toPaise } from '../../utils/money.js';
import { findOrder } from '../bookings/bookings.repository.js';
import { fulfillOrder } from '../bookings/fulfillment.js';
import { lockOrder } from '../bookings/inventory.js';
import { getPaymentProvider } from './providers/index.js';
import { createRefund, scheduleRefundProcessing, updateRefundFromGateway } from './refunds.service.js';

// ---------- checkout ----------
export async function startCheckout(user, orderId) {
  const provider = getPaymentProvider();

  const payment = await withTransaction(async (db) => {
    const order = await lockOrder(db, orderId);
    if (order.user_id !== user.id) throw ApiError.notFound('Booking not found');
    if (order.status !== 'pending_payment') throw ApiError.conflict(`Booking is ${order.status} and cannot be paid`);
    if (new Date(order.expires_at) <= new Date()) throw ApiError.conflict('Your reservation has expired. Please book again.');
    if (order.total_amount <= 0) throw ApiError.badRequest('This booking does not need payment');

    // Reuse an open gateway order so retries do not create duplicates.
    const { rows: open } = await db.query(
      `SELECT * FROM payments WHERE order_id = $1 AND status = 'created' AND provider = $2 ORDER BY created_at DESC LIMIT 1`,
      [orderId, provider.name]
    );
    if (open[0]) return { ...open[0], order };

    const { providerOrderId } = await provider.createOrder({
      amountPaise: toPaise(order.total_amount),
      currency: order.currency,
      receipt: order.order_number,
      notes: { order_id: order.id, order_number: order.order_number },
    });
    const { rows } = await db.query(
      `INSERT INTO payments (order_id, provider, provider_order_id, amount, currency) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orderId, provider.name, providerOrderId, order.total_amount, order.currency]
    );
    return { ...rows[0], order };
  });

  const { order } = payment;
  return {
    paymentId: payment.id,
    provider: provider.name,
    key: provider.publicKey,
    providerOrderId: payment.provider_order_id,
    amount: toPaise(payment.amount),
    currency: payment.currency,
    orderNumber: order.order_number,
    expiresAt: order.expires_at,
    prefill: { name: order.contact_name, email: order.contact_email, contact: order.contact_phone ?? undefined },
  };
}

/** Called by the browser after the gateway checkout succeeds. */
export async function verifyCheckout(user, { orderId, providerOrderId, providerPaymentId, signature }) {
  const provider = getPaymentProvider();
  const { rows } = await query(
    `SELECT p.id, p.amount, o.user_id FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.provider_order_id = $1 AND p.order_id = $2`,
    [providerOrderId, orderId]
  );
  if (!rows[0] || rows[0].user_id !== user.id) throw ApiError.notFound('Payment not found');
  if (!provider.verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature })) {
    throw ApiError.badRequest('Payment verification failed');
  }
  await capturePayment({ providerOrderId, providerPaymentId, amountPaise: toPaise(rows[0].amount) });
  return findOrder(orderId);
}

// ---------- state changes ----------
/**
 * Marks a gateway payment captured and confirms its booking. Idempotent: the browser callback
 * and the webhook can both arrive, in any order. A payment for a booking that already expired
 * is refunded automatically.
 */
export async function capturePayment({ providerOrderId, providerPaymentId, amountPaise, method }) {
  let refundCreated = false;
  const result = await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM payments WHERE provider_order_id = $1 FOR UPDATE', [providerOrderId]);
    const payment = rows[0];
    if (!payment) throw ApiError.notFound(`Unknown gateway order ${providerOrderId}`);
    if (payment.status === 'captured') return { orderId: payment.order_id, duplicate: true };
    if (toPaise(payment.amount) !== Number(amountPaise)) {
      throw ApiError.badRequest(`Captured amount ${amountPaise} does not match expected ${toPaise(payment.amount)}`);
    }

    await db.query(
      `UPDATE payments SET status = 'captured', provider_payment_id = $2, method = COALESCE($3, method),
              failure_reason = NULL, captured_at = NOW() WHERE id = $1`,
      [payment.id, providerPaymentId, method ?? null]
    );

    const order = await lockOrder(db, payment.order_id);
    if (order.status === 'pending_payment') {
      await fulfillOrder(db, order.id);
      await audit({ action: 'payment.captured', entityType: 'order', entityId: order.id,
        metadata: { providerPaymentId, amount: payment.amount } }, db);
    } else {
      const refundId = await createRefund(db, {
        orderId: order.id,
        amount: payment.amount,
        type: 'late_payment',
        reason: `Payment received after booking was ${order.status}`,
      });
      refundCreated = Boolean(refundId);
      await audit({ action: 'payment.captured_late', entityType: 'order', entityId: order.id,
        metadata: { providerPaymentId, orderStatus: order.status } }, db);
    }
    return { orderId: order.id, duplicate: false };
  });
  if (refundCreated) scheduleRefundProcessing();
  return result;
}

export async function failPayment({ providerOrderId, providerPaymentId, reason }) {
  // The booking stays pending, so the attendee can retry until the hold expires.
  await query(
    `UPDATE payments SET status = 'failed', provider_payment_id = COALESCE($2, provider_payment_id), failure_reason = $3
      WHERE provider_order_id = $1 AND status = 'created'`,
    [providerOrderId, providerPaymentId ?? null, reason ?? 'Payment failed']
  );
}

// ---------- webhooks ----------
export async function handleWebhook(providerName, rawBody, { signature, eventId }) {
  const provider = getPaymentProvider();
  if (providerName !== provider.name) throw ApiError.badRequest('Unknown payment provider');
  if (!Buffer.isBuffer(rawBody) || !provider.verifyWebhookSignature(rawBody, signature)) {
    throw ApiError.badRequest('Invalid webhook signature');
  }

  const body = JSON.parse(rawBody.toString('utf8'));
  const id = eventId || crypto.createHash('sha256').update(rawBody).digest('hex');
  const { rows } = await query(
    `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload) VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, event_id) DO UPDATE SET payload = EXCLUDED.payload
     RETURNING id, processed_at`,
    [provider.name, id, body.event, body]
  );
  if (rows[0].processed_at) return { duplicate: true };

  try {
    const payment = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;
    switch (body.event) {
      case 'payment.captured':
        await capturePayment({ providerOrderId: payment.order_id, providerPaymentId: payment.id, amountPaise: payment.amount, method: payment.method });
        break;
      case 'payment.failed':
        await failPayment({ providerOrderId: payment.order_id, providerPaymentId: payment.id, reason: payment.error_description });
        break;
      case 'refund.processed':
        await updateRefundFromGateway(refund.id, 'processed');
        break;
      case 'refund.failed':
        await updateRefundFromGateway(refund.id, 'failed', 'Refund failed at the gateway');
        break;
      default:
        break; // Other events are stored but not acted on.
    }
    await query('UPDATE payment_webhook_events SET processed_at = NOW(), error = NULL WHERE id = $1', [rows[0].id]);
    return { duplicate: false };
  } catch (err) {
    await query('UPDATE payment_webhook_events SET error = $2 WHERE id = $1', [rows[0].id, err.message]);
    throw err;
  }
}

// ---------- mock gateway ----------
/** Simulates the attendee completing (or failing) payment on the gateway page. Mock provider only. */
export async function completeMockPayment(user, paymentId, outcome) {
  const provider = getPaymentProvider();
  if (provider.name !== 'mock') throw ApiError.notFound('Mock payments are disabled');

  const { rows } = await query(
    `SELECT p.*, o.user_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1`,
    [paymentId]
  );
  const payment = rows[0];
  if (!payment || payment.user_id !== user.id) throw ApiError.notFound('Payment not found');
  if (payment.status !== 'created') throw ApiError.conflict(`Payment is already ${payment.status}`);

  const { providerPaymentId, signature } = provider.simulateCheckout(payment.provider_order_id);
  const entity = {
    id: providerPaymentId,
    order_id: payment.provider_order_id,
    amount: toPaise(payment.amount),
    currency: payment.currency,
    method: 'upi',
    status: outcome === 'success' ? 'captured' : 'failed',
    ...(outcome === 'failure' && { error_description: 'Payment declined by the bank (mock)' }),
  };
  // The gateway notifies the server by webhook, exactly like the real flow.
  const webhook = provider.buildWebhook(outcome === 'success' ? 'payment.captured' : 'payment.failed', entity);
  await handleWebhook('mock', webhook.rawBody, { signature: webhook.signature, eventId: webhook.eventId });

  return {
    outcome,
    providerOrderId: payment.provider_order_id,
    providerPaymentId,
    // Returned so the client can call /payments/verify the same way it would after Razorpay checkout.
    signature: outcome === 'success' ? signature : undefined,
    booking: await findOrder(payment.order_id),
  };
}

// ---------- admin ----------
export async function listPayments({ status, page, limit }) {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'WHERE p.status = $1';
  }
  const count = await query(`SELECT COUNT(*)::int AS total FROM payments p ${where}`, params);
  const { rows } = await query(
    `SELECT p.id, p.provider, p.provider_order_id AS "providerOrderId", p.provider_payment_id AS "providerPaymentId",
            p.amount, p.currency, p.status, p.method, p.failure_reason AS "failureReason",
            p.captured_at AS "capturedAt", p.created_at AS "createdAt",
            json_build_object('id', o.id, 'orderNumber', o.order_number, 'status', o.status, 'contactName', o.contact_name) AS booking
       FROM payments p JOIN orders o ON o.id = p.order_id
       ${where}
      ORDER BY p.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows, total: count.rows[0].total };
}
