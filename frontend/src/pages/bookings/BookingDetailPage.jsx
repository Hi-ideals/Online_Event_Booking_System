import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CalendarPlus, Download, FileText, MapPin, PartyPopper, Receipt, Ticket } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { bookingKeys, bookingsApi } from '../../api/bookings';
import { CancelBooking, RefundRequests } from '../../components/bookings/BookingActions';
import { addToCalendar, BookingStatusBadge, RefundStatusBadge } from '../../components/bookings/bookingUi';
import TicketCards from '../../components/bookings/TicketCards';
import { EventBanner } from '../../components/events/EventCard';
import Button from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { PageLoader } from '../../components/ui/Spinner';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate, formatDateTime, formatTime, titleCase } from '../../lib/format';

const REFUND_TYPE = {
  attendee_cancellation: 'Cancellation refund',
  event_cancellation: 'Event cancelled',
  late_payment: 'Late payment returned',
  admin: 'Refund approved by support',
};

const PAYMENT_METHOD = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', emi: 'EMI' };

function useDownload() {
  const [busy, setBusy] = useState(null);
  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Download failed'));
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export default function BookingDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { busy, run } = useDownload();

  const bookingQuery = useQuery({ queryKey: bookingKeys.detail(id), queryFn: () => bookingsApi.get(id) });
  const booking = bookingQuery.data;
  const hasTickets = booking && ['confirmed', 'cancelled'].includes(booking.status) && booking.confirmedAt;
  const ticketsQuery = useQuery({ queryKey: bookingKeys.tickets(id), queryFn: () => bookingsApi.tickets(id), enabled: Boolean(hasTickets) });
  useDocumentTitle(booking ? booking.event.title : 'Booking');

  if (bookingQuery.isLoading) return <PageLoader />;
  if (bookingQuery.isError) {
    return (
      <div className="container-page py-16">
        {bookingQuery.error.response?.status === 404 ? (
          <EmptyState icon={Ticket} title="Booking not found" action={<Button to="/bookings">My bookings</Button>} />
        ) : (
          <Alert tone="error" title="Could not load this booking">
            {getErrorMessage(bookingQuery.error)}
          </Alert>
        )}
      </div>
    );
  }
  if (booking.status === 'pending_payment') return <Navigate to={`/checkout/${id}`} replace />;

  const { event } = booking;
  const justBooked = params.get('new') === '1' && booking.status === 'confirmed';
  const eventOver = new Date(event.endAt) < new Date();

  return (
    <div className="container-page max-w-5xl py-6 sm:py-10">
      <Link to="/bookings" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> My bookings
      </Link>

      {justBooked && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-emerald-600 p-4 text-white sm:items-center sm:p-5">
          <PartyPopper className="h-7 w-7 shrink-0" />
          <div>
            <p className="text-lg font-bold">You're going!</p>
            <p className="text-sm text-emerald-50">Your tickets are below and have been emailed to {booking.contactEmail}.</p>
          </div>
        </div>
      )}

      {/* Event header */}
      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          <EventBanner event={event} className="aspect-[16/9] w-full sm:aspect-auto sm:w-64" iconClassName="h-12 w-12" />
          <div className="flex min-w-0 flex-1 flex-col p-5">
            <div className="flex flex-wrap items-center gap-2">
              <BookingStatusBadge status={booking.status} />
              {event.status === 'cancelled' && <span className="text-xs font-medium text-rose-600">Event cancelled</span>}
            </div>
            <h1 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">
              <Link to={`/events/${event.slug}`} className="hover:text-brand-700">
                {event.title}
              </Link>
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
              <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
              {formatDate(event.startAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {formatTime(event.startAt)}
            </p>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              {event.venue.name}, {event.venue.addressLine}, {event.venue.city}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Booking <span className="font-mono font-medium text-slate-700">{booking.orderNumber}</span> &middot; Booked {formatDate(booking.createdAt)}
            </p>

            {booking.status === 'confirmed' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" icon={Download} loading={busy === 'tickets'} onClick={() => run('tickets', () => bookingsApi.downloadTickets(booking))}>
                  Tickets PDF
                </Button>
                {booking.invoiceNumber && (
                  <Button size="sm" variant="secondary" icon={FileText} loading={busy === 'invoice'} onClick={() => run('invoice', () => bookingsApi.downloadInvoice(booking))}>
                    Invoice
                  </Button>
                )}
                {!eventOver && (
                  <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => addToCalendar(booking)}>
                    Add to calendar
                  </Button>
                )}
              </div>
            )}
            {booking.status === 'cancelled' && booking.invoiceNumber && (
              <div className="mt-4">
                <Button size="sm" variant="secondary" icon={FileText} loading={busy === 'invoice'} onClick={() => run('invoice', () => bookingsApi.downloadInvoice(booking))}>
                  Invoice
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {booking.status === 'cancelled' && (
        <Alert tone="error" title="This booking was cancelled" className="mt-4">
          {booking.cancellationReason ?? 'The tickets are no longer valid.'}
          {booking.cancelledAt && ` (${formatDateTime(booking.cancelledAt)})`}
        </Alert>
      )}
      {booking.status === 'expired' && (
        <Alert tone="warning" title="Reservation expired" className="mt-4" action={<Button size="sm" to={`/events/${event.slug}`}>Book again</Button>}>
          Payment was not completed in time, so the tickets were released.
        </Alert>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {hasTickets && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Ticket className="h-5 w-5 text-brand-600" /> Your tickets
              </h2>
              {ticketsQuery.isLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: Math.min(booking.ticketCount, 2) }, (_, i) => (
                    <div key={i} className="h-40 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />
                  ))}
                </div>
              ) : ticketsQuery.isError ? (
                <Alert tone="error">{getErrorMessage(ticketsQuery.error)}</Alert>
              ) : (
                <TicketCards tickets={ticketsQuery.data.tickets} eventTitle={event.title} />
              )}
            </section>
          )}

          <CancelBooking booking={booking} />
          <RefundRequests booking={booking} />
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-brand-600" />Order summary</span>} />
            <CardBody className="space-y-4 text-sm">
              <ul className="space-y-2">
                {booking.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span className="min-w-0 text-slate-600">
                      {item.tierName}
                      {item.seatLabel ? ` · ${item.seatLabel.split(' - ').pop()}` : ` × ${item.quantity}`}
                    </span>
                    <span className="shrink-0 text-slate-900">{formatCurrency(item.lineTotal, { free: false })}</span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd>{formatCurrency(booking.subtotal, { free: false })}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Convenience fee</dt>
                  <dd>{formatCurrency(booking.feeAmount, { free: false })}</dd>
                </div>
                <div className="flex justify-between font-semibold text-slate-900">
                  <dt>Total paid</dt>
                  <dd>{formatCurrency(booking.totalAmount, { free: false })}</dd>
                </div>
              </dl>

              {booking.payment && (
                <dl className="space-y-1.5 border-t border-slate-100 pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Payment</dt>
                    <dd className="text-right text-slate-700">{PAYMENT_METHOD[booking.payment.method] ?? titleCase(booking.payment.method ?? 'online')}</dd>
                  </div>
                  {booking.payment.providerPaymentId && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Reference</dt>
                      <dd className="truncate font-mono text-slate-700">{booking.payment.providerPaymentId}</dd>
                    </div>
                  )}
                  {booking.payment.capturedAt && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Paid on</dt>
                      <dd className="text-slate-700">{formatDateTime(booking.payment.capturedAt)}</dd>
                    </div>
                  )}
                  {booking.invoiceNumber && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Invoice</dt>
                      <dd className="font-mono text-slate-700">{booking.invoiceNumber}</dd>
                    </div>
                  )}
                </dl>
              )}
            </CardBody>
          </Card>

          {booking.refunds.length > 0 && (
            <Card>
              <CardHeader title="Refunds" />
              <CardBody>
                <ol className="relative space-y-4 border-l-2 border-slate-100 pl-4">
                  {booking.refunds.map((refund) => (
                    <li key={refund.id} className="relative text-sm">
                      <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full bg-brand-600 ring-4 ring-white" />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{formatCurrency(refund.amount, { free: false })}</span>
                        <RefundStatusBadge status={refund.status} />
                      </div>
                      <p className="text-slate-600">{REFUND_TYPE[refund.type] ?? titleCase(refund.type)}</p>
                      <p className="text-xs text-slate-400">
                        {refund.processedAt ? `Refunded ${formatDateTime(refund.processedAt)}` : `Requested ${formatDateTime(refund.createdAt)}`}
                      </p>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-xs text-slate-500">Refunds reach your account in 5-7 working days.</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody className="text-sm">
              <p className="font-semibold text-slate-900">Contact details</p>
              <p className="mt-2 text-slate-600">{booking.contactName}</p>
              <p className="truncate text-slate-600">{booking.contactEmail}</p>
              {booking.contactPhone && <p className="text-slate-600">{booking.contactPhone}</p>}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
