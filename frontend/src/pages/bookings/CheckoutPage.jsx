import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, Lock, MapPin, ShieldCheck, TimerOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { bookingKeys, bookingsApi, paymentsApi } from '../../api/bookings';
import MockGateway from '../../components/bookings/MockGateway';
import { EventBanner } from '../../components/events/EventCard';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { PageLoader } from '../../components/ui/Spinner';
import useCountdown from '../../hooks/useCountdown';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import cn from '../../lib/cn';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate, formatTime } from '../../lib/format';
import { openRazorpay } from '../../lib/razorpay';

function Countdown({ expiresAt, onExpire }) {
  const { seconds, label, expired } = useCountdown(expiresAt);
  useEffect(() => {
    if (expired) onExpire();
  }, [expired, onExpire]);
  const urgent = seconds <= 120;
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-4 py-3 ring-1', urgent ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-amber-50 text-amber-900 ring-amber-200')} role="timer" aria-live={urgent ? 'polite' : 'off'}>
      <Clock className="h-5 w-5 shrink-0" />
      <p className="text-sm">
        Your tickets are held for <span className="font-mono text-base font-bold tabular-nums">{label}</span>. Complete payment before the timer runs out.
      </p>
    </div>
  );
}

export default function CheckoutPage() {
  useDocumentTitle('Checkout');
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [timedOut, setTimedOut] = useState(false);
  const [checkout, setCheckout] = useState(null);
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  const { data: booking, isLoading, isError, error, refetch } = useQuery({ queryKey: bookingKeys.detail(id), queryFn: () => bookingsApi.get(id) });
  const handleExpire = useCallback(() => setTimedOut(true), []);

  if (isLoading) return <PageLoader />;
  if (isError) {
    return (
      <div className="container-page py-16">
        <Alert tone="error" title="Could not load your booking">
          {getErrorMessage(error)}
        </Alert>
      </div>
    );
  }
  if (booking.status === 'confirmed') return <Navigate to={`/bookings/${id}?new=1`} replace />;

  const expired = timedOut || booking.status !== 'pending_payment';
  if (expired) {
    return (
      <div className="container-page flex min-h-[60vh] items-center justify-center py-10">
        <EmptyState
          icon={TimerOff}
          title={booking.status === 'cancelled' ? 'This booking was cancelled' : 'Your reservation expired'}
          description="The tickets were released so others can book them. You can start a new booking if seats are still available."
          action={<Button to={`/events/${booking.event.slug}`}>Book again</Button>}
          className="rounded-2xl bg-white ring-1 ring-slate-200"
        />
      </div>
    );
  }

  const finishSuccess = (confirmed) => {
    queryClient.setQueryData(bookingKeys.detail(id), confirmed);
    queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    toast.success('Payment successful! Your tickets are ready.');
    navigate(`/bookings/${id}?new=1`, { replace: true });
  };

  const startPayment = async () => {
    setPaymentError(null);
    setPaying(true);
    try {
      const session = await paymentsApi.checkout(id);
      setCheckout(session);
      if (session.provider === 'mock') {
        setGatewayOpen(true);
        return;
      }
      const result = await openRazorpay(session, { name: 'EventBooking', description: booking.event.title });
      finishSuccess(await paymentsApi.verify({ orderId: id, ...result }));
    } catch (err) {
      if (!err.dismissed) setPaymentError(getErrorMessage(err));
      refetch();
    } finally {
      setPaying(false);
    }
  };

  const completeMock = async (outcome) => {
    setPaying(true);
    try {
      const result = await paymentsApi.completeMock(checkout.paymentId, outcome);
      if (outcome === 'failure') {
        setGatewayOpen(false);
        setPaymentError(result.booking.payment?.failureReason ?? 'Payment was declined. Please try again.');
        refetch();
        return;
      }
      // Same verification step the real Razorpay flow uses.
      const confirmed = await paymentsApi.verify({
        orderId: id,
        providerOrderId: result.providerOrderId,
        providerPaymentId: result.providerPaymentId,
        signature: result.signature,
      });
      setGatewayOpen(false);
      finishSuccess(confirmed);
    } catch (err) {
      setGatewayOpen(false);
      setPaymentError(getErrorMessage(err));
      refetch();
    } finally {
      setPaying(false);
    }
  };

  const release = async () => {
    setReleasing(true);
    try {
      await bookingsApi.cancel(id, 'Released at checkout');
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Tickets released');
      navigate(`/events/${booking.event.slug}`, { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setReleasing(false);
    }
  };

  const { event } = booking;

  return (
    <div className="container-page max-w-5xl py-8 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Checkout</h1>
      <p className="mt-1 text-sm text-slate-500">Booking {booking.orderNumber}</p>

      <div className="mt-6">
        <Countdown expiresAt={booking.expiresAt} onExpire={handleExpire} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <div className="flex gap-4 p-4 sm:p-5">
              <EventBanner event={event} className="h-20 w-28 shrink-0 rounded-xl sm:h-24 sm:w-36" iconClassName="h-8 w-8" />
              <div className="min-w-0">
                <Link to={`/events/${event.slug}`} className="line-clamp-2 font-semibold text-slate-900 hover:text-brand-700">
                  {event.title}
                </Link>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {formatDate(event.startAt, { weekday: 'short', day: 'numeric', month: 'short' })}, {formatTime(event.startAt)}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {event.venue.name}, {event.venue.city}
                  </span>
                </p>
              </div>
            </div>
            <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
              <h2 className="text-sm font-semibold text-slate-900">Your tickets</h2>
              <ul className="mt-3 space-y-2">
                {booking.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 text-slate-600">
                      <span className="font-medium text-slate-800">{item.tierName}</span>
                      {item.seatLabel ? ` · ${item.seatLabel.split(' - ').pop()}` : ` × ${item.quantity}`}
                    </span>
                    <span className="shrink-0 font-medium text-slate-900">{formatCurrency(item.lineTotal, { free: false })}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900">Tickets will be sent to</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Name</dt>
                <dd className="font-medium text-slate-900">{booking.contactName}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">Email</dt>
                <dd className="truncate font-medium text-slate-900">{booking.contactEmail}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd className="font-medium text-slate-900">{booking.contactPhone ?? '-'}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <aside>
          <Card className="p-5 lg:sticky lg:top-24">
            <h2 className="font-semibold text-slate-900">Payment summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Tickets ({booking.ticketCount})</dt>
                <dd className="text-slate-900">{formatCurrency(booking.subtotal, { free: false })}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Convenience fee</dt>
                <dd className="text-slate-900">{formatCurrency(booking.feeAmount, { free: false })}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-3 text-base">
                <dt className="font-semibold text-slate-900">Total</dt>
                <dd className="font-bold text-slate-900">{formatCurrency(booking.totalAmount, { free: false })}</dd>
              </div>
            </dl>

            {paymentError && (
              <Alert tone="error" title="Payment failed" className="mt-4">
                {paymentError}
              </Alert>
            )}

            <Button size="lg" className="mt-5 w-full" icon={Lock} loading={paying && !gatewayOpen} onClick={startPayment}>
              {paymentError ? 'Try again' : `Pay ${formatCurrency(booking.totalAmount, { free: false })}`}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Secure payment
            </p>
            <button onClick={release} disabled={releasing || paying} className="mt-4 w-full text-center text-sm font-medium text-slate-500 hover:text-rose-600 disabled:opacity-50">
              {releasing ? 'Releasing...' : 'Cancel and release tickets'}
            </button>
          </Card>
        </aside>
      </div>

      <MockGateway open={gatewayOpen} checkout={checkout} onClose={() => setGatewayOpen(false)} onResult={completeMock} busy={paying} />
    </div>
  );
}
