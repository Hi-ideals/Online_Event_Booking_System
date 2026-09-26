import { Badge } from '../ui/Feedback';

const STATUS = {
  pending_payment: ['amber', 'Payment pending'],
  confirmed: ['green', 'Confirmed'],
  expired: ['gray', 'Expired'],
  failed: ['red', 'Payment failed'],
  cancelled: ['red', 'Cancelled'],
};

export function BookingStatusBadge({ status }) {
  const [tone, label] = STATUS[status] ?? ['gray', status];
  return <Badge tone={tone}>{label}</Badge>;
}

const REFUND = { pending: ['amber', 'Processing'], processed: ['green', 'Refunded'], failed: ['red', 'Failed'] };

export function RefundStatusBadge({ status }) {
  const [tone, label] = REFUND[status] ?? ['gray', status];
  return <Badge tone={tone}>{label}</Badge>;
}

const REQUEST = { open: ['amber', 'Under review'], approved: ['green', 'Approved'], rejected: ['red', 'Declined'] };

export function RequestStatusBadge({ status }) {
  const [tone, label] = REQUEST[status] ?? ['gray', status];
  return <Badge tone={tone}>{label}</Badge>;
}

const pad = (n) => String(n).padStart(2, '0');
const icsDate = (date) => {
  const d = new Date(date);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
};
const icsText = (text = '') => text.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** Downloads an .ics file so the event can be added to Google/Apple/Outlook calendars. */
export function addToCalendar(booking) {
  const { event } = booking;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EventBooking//Tickets//EN',
    'BEGIN:VEVENT',
    `UID:${booking.id}@eventbooking`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.startAt)}`,
    `DTEND:${icsDate(event.endAt)}`,
    `SUMMARY:${icsText(event.title)}`,
    `LOCATION:${icsText(`${event.venue.name}, ${event.venue.addressLine}, ${event.venue.city}`)}`,
    `DESCRIPTION:${icsText(`Booking ${booking.orderNumber}. Show your QR tickets at the gate.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `${event.title}.ics` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
