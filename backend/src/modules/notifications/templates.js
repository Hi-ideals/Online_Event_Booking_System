// Email templates. Each returns { subject, heading, lines, cta?, attachments? } (or { skip: reason }) and is wrapped in a shared layout.
import env from '../../config/env.js';
import { query } from '../../config/db.js';
import { formatDateTime } from '../../utils/dates.js';
import { formatInr } from '../../utils/money.js';
import { findOrder } from '../bookings/bookings.repository.js';
import { ticketsPdf } from '../bookings/documents.js';

const link = (path) => `${env.clientUrl}${path}`;

async function booking(orderId) {
  const order = await findOrder(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);
  return order;
}

const eventLine = (order) => `${order.event.title} - ${formatDateTime(order.event.startAt)} at ${order.event.venue.name}, ${order.event.venue.city}`;

const TEMPLATES = {
  welcome: async ({ name }) => ({
    subject: `Welcome to ${env.platform.name}`,
    heading: `Welcome, ${name}!`,
    lines: ['Your account is ready. Discover concerts, comedy, workshops and more near you.'],
    cta: { label: 'Browse events', url: link('/events') },
  }),

  organizer_pending: async ({ name }) => ({
    subject: 'Your organizer account is under review',
    heading: `Thanks for registering, ${name}`,
    lines: ['Our team is reviewing your organizer account. We will email you as soon as it is approved.'],
  }),

  organizer_approved: async ({ name }) => ({
    subject: 'Your organizer account is approved',
    heading: `You're approved, ${name}!`,
    lines: ['You can now create venues, publish events and start selling tickets.'],
    cta: { label: 'Open organizer dashboard', url: link('/organizer') },
  }),

  organizer_rejected: async ({ name, reason }) => ({
    subject: 'Update on your organizer application',
    heading: `Hello ${name}`,
    lines: ['We could not approve your organizer account at this time.', `Reason: ${reason}`],
  }),

  booking_confirmed: async ({ orderId }) => {
    const order = await booking(orderId);
    if (order.status !== 'confirmed') return { skip: `booking is now ${order.status}` };
    return {
      subject: `Your tickets for ${order.event.title} (${order.orderNumber})`,
      heading: 'Booking confirmed',
      lines: [
        eventLine(order),
        `Tickets: ${order.ticketCount}  |  Total paid: ${formatInr(order.totalAmount)}`,
        'Your e-tickets are attached. Show the QR code at the entry gate.',
      ],
      cta: { label: 'View booking', url: link(`/bookings/${order.id}`) },
      attachments: [{ filename: `tickets-${order.orderNumber}.pdf`, content: await ticketsPdf(order.id), contentType: 'application/pdf' }],
    };
  },

  booking_cancelled: async ({ orderId, byEvent }) => {
    const order = await booking(orderId);
    const refund = order.refundAmount > 0 ? `A refund of ${formatInr(order.refundAmount)} is on its way to your original payment method.` : 'No refund applies to this booking.';
    return {
      subject: byEvent ? `Event cancelled: ${order.event.title}` : `Booking cancelled (${order.orderNumber})`,
      heading: byEvent ? 'The organizer cancelled this event' : 'Your booking was cancelled',
      lines: [eventLine(order), ...(order.cancellationReason ? [`Reason: ${order.cancellationReason}`] : []), refund],
      cta: { label: 'View booking', url: link(`/bookings/${order.id}`) },
    };
  },

  refund_processed: async ({ refundId }) => {
    const { rows: [refund] } = await query('SELECT order_id, amount FROM refunds WHERE id = $1', [refundId]);
    const order = await booking(refund.order_id);
    return {
      subject: `Refund processed for ${order.orderNumber}`,
      heading: 'Your refund has been processed',
      lines: [`${formatInr(refund.amount)} has been refunded for ${order.event.title}.`, 'It can take 5-7 working days to appear in your account.'],
    };
  },

  refund_request_resolved: async ({ requestId }) => {
    const { rows: [request] } = await query('SELECT order_id, status, admin_note FROM refund_requests WHERE id = $1', [requestId]);
    const order = await booking(request.order_id);
    const approved = request.status === 'approved';
    return {
      subject: `Your refund request was ${approved ? 'approved' : 'declined'} (${order.orderNumber})`,
      heading: approved ? 'Refund request approved' : 'Refund request declined',
      lines: [order.event.title, ...(request.admin_note ? [`Note from our team: ${request.admin_note}`] : [])],
      cta: { label: 'View booking', url: link(`/bookings/${order.id}`) },
    };
  },

  event_reminder: async ({ orderId }) => {
    const order = await booking(orderId);
    return {
      subject: `Reminder: ${order.event.title} is coming up`,
      heading: 'See you soon!',
      lines: [eventLine(order), `You have ${order.validTickets} ticket(s). Keep your QR codes ready at the gate.`],
      cta: { label: 'View tickets', url: link(`/bookings/${order.id}`) },
    };
  },

  payout_paid: async ({ payoutId }) => {
    const { rows: [p] } = await query(
      `SELECT p.amount, p.reference, e.title FROM payouts p JOIN events e ON e.id = p.event_id WHERE p.id = $1`,
      [payoutId]
    );
    return {
      subject: `Payout sent for ${p.title}`,
      heading: 'Payout sent',
      lines: [`${formatInr(p.amount)} has been paid out for ${p.title}.`, ...(p.reference ? [`Reference: ${p.reference}`] : [])],
      cta: { label: 'View payouts', url: link('/organizer/payouts') },
    };
  },
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout({ heading, lines, cta }) {
  const paragraphs = lines.map((l) => `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:22px">${escapeHtml(l)}</p>`).join('');
  const button = cta
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(cta.url)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden" cellpadding="0" cellspacing="0">
      <tr><td style="background:#4f46e5;padding:20px 24px;color:#fff;font-size:20px;font-weight:700">${escapeHtml(env.platform.name)}</td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 16px;font-size:22px;color:#111827">${escapeHtml(heading)}</h1>
        ${paragraphs}${button}
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px">Need help? Contact ${escapeHtml(env.platform.supportEmail)}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function renderEmail(template, payload) {
  const build = TEMPLATES[template];
  if (!build) throw new Error(`Unknown email template "${template}"`);
  const content = await build(payload);
  // A template can decide the email no longer makes sense (e.g. booking cancelled before it was sent).
  if (content.skip) return { skip: content.skip };
  const text = [content.heading, '', ...content.lines, ...(content.cta ? ['', `${content.cta.label}: ${content.cta.url}`] : [])].join('\n');
  return { subject: content.subject, html: layout(content), text, attachments: content.attachments };
}

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);
