/*
 * Payment gateway abstraction. Both providers expose the same interface:
 *
 *   name
 *   publicKey                                   -> key the browser checkout needs
 *   createOrder({ amountPaise, currency, receipt, notes }) -> { providerOrderId }
 *   verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }) -> boolean
 *   verifyWebhookSignature(rawBody, signature)  -> boolean
 *   refund({ providerPaymentId, amountPaise, notes }) -> { providerRefundId, status: 'processed' | 'pending' }
 *
 * Webhook payloads follow Razorpay's format for both providers.
 */
import env from '../../../config/env.js';
import { createMockProvider } from './mock.js';
import { createRazorpayProvider } from './razorpay.js';

let provider;

export function getPaymentProvider() {
  if (!provider) {
    provider = env.payments.provider === 'razorpay'
      ? createRazorpayProvider(env.payments.razorpay)
      : createMockProvider(env.payments.mockSecret);
  }
  return provider;
}
