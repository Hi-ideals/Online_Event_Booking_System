// Razorpay REST integration (https://razorpay.com/docs/api/). Requires payments to be auto-captured
// in the Razorpay dashboard and a webhook for payment.captured, payment.failed and refund.processed.
import ApiError from '../../../utils/ApiError.js';
import { hmacHex, safeEqual } from './signature.js';

const API = 'https://api.razorpay.com/v1';

export function createRazorpayProvider({ keyId, keySecret, webhookSecret }) {
  if (!keyId || !keySecret || !webhookSecret) {
    throw new Error('RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required when PAYMENT_PROVIDER=razorpay');
  }
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  async function request(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error?.description || `Razorpay request failed (${res.status})`;
      throw new ApiError(502, message);
    }
    return data;
  }

  return {
    name: 'razorpay',
    publicKey: keyId,

    async createOrder({ amountPaise, currency, receipt, notes }) {
      const order = await request('/orders', { amount: amountPaise, currency, receipt, notes });
      return { providerOrderId: order.id };
    },

    verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }) {
      return safeEqual(hmacHex(keySecret, `${providerOrderId}|${providerPaymentId}`), signature);
    },

    verifyWebhookSignature(rawBody, signature) {
      return safeEqual(hmacHex(webhookSecret, rawBody), signature);
    },

    async refund({ providerPaymentId, amountPaise, notes }) {
      const refund = await request(`/payments/${providerPaymentId}/refund`, { amount: amountPaise, speed: 'normal', notes });
      return { providerRefundId: refund.id, status: refund.status === 'processed' ? 'processed' : 'pending' };
    },
  };
}
