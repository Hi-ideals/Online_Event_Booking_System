import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareWarning, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { bookingKeys, bookingsApi } from '../../api/bookings';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/format';
import Button from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Alert } from '../ui/Feedback';
import { Field, Textarea } from '../ui/Form';
import Modal from '../ui/Modal';
import { RequestStatusBadge } from './bookingUi';

function useRefreshBooking(bookingId) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) });
  };
}

/** Cancellation card: shows the policy outcome and lets the attendee cancel within it. */
export function CancelBooking({ booking }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const refresh = useRefreshBooking(booking.id);
  const quote = booking.cancellation;

  const mutation = useMutation({
    mutationFn: () => bookingsApi.cancel(booking.id, reason.trim() || undefined),
    onSuccess: (updated) => {
      setOpen(false);
      toast.success(updated.refundAmount > 0 ? `Booking cancelled. ${formatCurrency(updated.refundAmount)} will be refunded.` : 'Booking cancelled');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (booking.status !== 'confirmed' || !quote) return null;

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-brand-600" />Cancel booking</span>} />
      <CardBody className="space-y-3 text-sm">
        {quote.eligible ? (
          <>
            <p className="text-slate-600">
              {quote.reason}. Cancel before <strong>{formatDateTime(quote.deadline)}</strong>.
            </p>
            <p className="text-slate-900">
              Refund if you cancel now: <strong>{formatCurrency(quote.refundAmount, { free: false })}</strong>
            </p>
            <Button variant="secondary" className="text-rose-600" onClick={() => setOpen(true)}>
              Cancel booking
            </Button>
          </>
        ) : (
          <p className="text-slate-600">{quote.reason}.</p>
        )}
      </CardBody>

      <Modal
        open={open}
        onClose={() => !mutation.isPending && setOpen(false)}
        title="Cancel this booking?"
        description={booking.event.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Keep my tickets
            </Button>
            <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Yes, cancel
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning">
            All {booking.validTickets} ticket(s) will stop working immediately. You will receive a refund of{' '}
            <strong>{formatCurrency(quote.refundAmount, { free: false })}</strong> to your original payment method.
          </Alert>
          <Field label="Reason (optional)">
            {({ id }) => <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Let the organizer know why" />}
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

/** Refund requests for bookings outside the automatic cancellation policy. */
export function RefundRequests({ booking }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const refresh = useRefreshBooking(booking.id);
  const queryClient = useQueryClient();

  const paid = Boolean(booking.payment && booking.payment.status === 'captured');
  const refunded = booking.refunds.filter((r) => r.status !== 'failed').reduce((s, r) => s + r.amount, 0);
  const refundable = paid && refunded < booking.totalAmount;

  const requests = useQuery({
    queryKey: bookingKeys.refundRequests(booking.id),
    queryFn: () => bookingsApi.refundRequests(booking.id),
    enabled: paid,
  });

  const mutation = useMutation({
    mutationFn: () => bookingsApi.requestRefund(booking.id, reason.trim()),
    onSuccess: () => {
      setOpen(false);
      setReason('');
      toast.success('Refund request sent. We will email you once it is reviewed.');
      queryClient.invalidateQueries({ queryKey: bookingKeys.refundRequests(booking.id) });
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!paid) return null;
  const items = requests.data ?? [];
  const hasOpen = items.some((r) => r.status === 'open');
  // Offer a request only when self-cancellation is not possible.
  const canRequest = refundable && !hasOpen && !(booking.status === 'confirmed' && booking.cancellation?.eligible);
  if (!items.length && !canRequest) return null;

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><MessageSquareWarning className="h-4 w-4 text-brand-600" />Need help with a refund?</span>}
        description={canRequest ? 'Our support team can review special cases like illness or travel problems.' : undefined}
        action={canRequest && <Button variant="secondary" onClick={() => setOpen(true)}>Request a refund</Button>}
      />
      {items.length > 0 && (
        <CardBody>
          <ul className="space-y-3">
            {items.map((r) => (
              <li key={r.id} className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">Requested {formatDate(r.createdAt)}</span>
                  <RequestStatusBadge status={r.status} />
                </div>
                <p className="mt-2 text-slate-700">{r.reason}</p>
                {r.adminNote && (
                  <p className="mt-2 border-t border-slate-200 pt-2 text-slate-600">
                    <span className="font-medium text-slate-800">Support team: </span>
                    {r.adminNote}
                  </p>
                )}
                {r.refund && <p className="mt-1 text-emerald-700">Refund of {formatCurrency(r.refund.amount, { free: false })} approved.</p>}
              </li>
            ))}
          </ul>
        </CardBody>
      )}

      <Modal
        open={open}
        onClose={() => !mutation.isPending && setOpen(false)}
        title="Request a refund"
        description={`Booking ${booking.orderNumber}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Close
            </Button>
            <Button loading={mutation.isPending} disabled={reason.trim().length < 10} onClick={() => mutation.mutate()}>
              Submit request
            </Button>
          </>
        }
      >
        <Field label="What happened?" hint="At least 10 characters. Include any details that help us review your request.">
          {({ id }) => <Textarea id={id} rows={5} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </Modal>
    </Card>
  );
}
