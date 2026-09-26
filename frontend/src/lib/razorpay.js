const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let loading;

function loadScript() {
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = Object.assign(document.createElement('script'), { src: SCRIPT_URL, async: true });
      script.onload = resolve;
      script.onerror = () => {
        loading = null;
        reject(new Error('Could not load the payment gateway. Check your connection.'));
      };
      document.body.appendChild(script);
    });
  }
  return loading;
}

/**
 * Opens Razorpay Checkout. Resolves with { providerOrderId, providerPaymentId, signature } on success,
 * rejects with an Error on failure or when the attendee closes the popup.
 */
export async function openRazorpay(checkout, { name, description }) {
  await loadScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: checkout.key,
      order_id: checkout.providerOrderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name,
      description,
      prefill: checkout.prefill,
      theme: { color: '#4f46e5' },
      handler: (res) => resolve({
        providerOrderId: res.razorpay_order_id,
        providerPaymentId: res.razorpay_payment_id,
        signature: res.razorpay_signature,
      }),
      modal: { ondismiss: () => reject(Object.assign(new Error('Payment cancelled'), { dismissed: true })) },
    });
    rzp.on('payment.failed', (res) => reject(new Error(res.error?.description || 'Payment failed')));
    rzp.open();
  });
}
