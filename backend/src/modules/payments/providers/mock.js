// Local stand-in for Razorpay: same ids, signatures and webhook format, no network calls.
import crypto from 'node:crypto';
import { hmacHex, safeEqual } from './signature.js';

const randomId = (prefix) => `${prefix}_mock${crypto.randomBytes(8).toString('hex')}`;

export function createMockProvider(secret) {
  return {
    name: 'mock',
    publicKey: 'rzp_test_mock',

    async createOrder() {
      return { providerOrderId: randomId('order') };
    },

    verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }) {
      return safeEqual(hmacHex(secret, `${providerOrderId}|${providerPaymentId}`), signature);
    },

    verifyWebhookSignature(rawBody, signature) {
      return safeEqual(hmacHex(secret, rawBody), signature);
    },

    async refund() {
      return { providerRefundId: randomId('rfnd'), status: 'processed' };
    },

    // ----- simulation helpers (mock only) -----

    /** What the browser receives after a successful checkout. */
    simulateCheckout(providerOrderId) {
      const providerPaymentId = randomId('pay');
      return { providerPaymentId, signature: hmacHex(secret, `${providerOrderId}|${providerPaymentId}`) };
    },

    /** Builds a signed webhook exactly as the gateway would send it. */
    buildWebhook(event, entity) {
      const key = event.startsWith('refund.') ? 'refund' : 'payment';
      const body = JSON.stringify({
        entity: 'event',
        event,
        payload: { [key]: { entity } },
        created_at: Math.floor(Date.now() / 1000),
      });
      return { rawBody: Buffer.from(body), signature: hmacHex(secret, body), eventId: randomId('evt') };
    },
  };
}
