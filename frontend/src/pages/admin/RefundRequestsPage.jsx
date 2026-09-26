import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi, adminKeys } from '../../api/admin';
import { FilterSelect, ListCard } from '../../components/admin/AdminList';
import { RequestStatusBadge } from '../../components/bookings/bookingUi';
import Button from '../../components/ui/Button';
import { Alert, PageHeader } from '../../components/ui/Feedback';
import { Checkbox, Field, Input, Textarea } from '../../components/ui/Form';
import Modal from '../../components/ui/Modal';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDateTime } from '../../lib/format';

const money = (v) => formatCurrency(v, { free: false });

function ReviewModal({ requestId, onClose }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [cancelBooking, setCancelBooking] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);

  const { data: request, isLoading } = useQuery({ queryKey: adminKeys.refundRequest(requestId), queryFn: () => adminApi.refundRequest(requestId), enabled: Boolean(requestId) });

  useEffect(() => {
    if (request) {
      setAmount(String(request.refundableAmount ?? ''));
      setCancelBooking(request.booking.status === 'confirmed');
      setNote('');
      setError(null);
    }
  }, [request]);

  const decide = useMutation({
    mutationFn: (approve) =>
      approve
        ? adminApi.approveRefundRequest(requestId, { amount: Number(amount), cancelBooking, note: note.trim() || undefined })
        : adminApi.rejectRefundRequest(requestId, note.trim()),
    onSuccess: (updated) => {
      toast.success(updated.status === 'approved' ? 'Refund approved and sent to the gateway' : 'Request declined. The attendee has been emailed.');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const open = Boolean(requestId);
  const refundable = request?.refundableAmount ?? 0;
  const amountValid = Number(amount) > 0 && Number(amount) <= refundable;

  return (
    <Modal
      open={open}
      onClose={() => !decide.isPending && onClose()}
      title="Review refund request"
      description={request?.booking.orderNumber}
      size="lg"
      footer={
        request?.status === 'open' && (
          <>
            <Button variant="danger" icon={X} loading={decide.isPending && decide.variables === false} disabled={note.trim().length < 5} onClick={() => decide.mutate(false)}>
              Decline
            </Button>
            <Button variant="success" icon={Check} loading={decide.isPending && decide.variables === true} disabled={!amountValid} onClick={() => decide.mutate(true)}>
              Approve {amountValid ? money(Number(amount)) : 'refund'}
            </Button>
          </>
        )
      }
    >
      {isLoading || !request ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="space-y-5 text-sm">
          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={request.status} />
            <span className="text-xs text-slate-500">Raised {formatDateTime(request.createdAt)}</span>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Event</dt>
              <dd className="font-medium text-slate-900">{request.event.title}</dd>
              <dd className="text-xs text-slate-500">{formatDateTime(request.event.startAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Attendee</dt>
              <dd className="font-medium text-slate-900">{request.booking.contactName}</dd>
              <dd className="text-xs text-slate-500">{request.booking.contactEmail}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Paid</dt>
              <dd className="font-medium text-slate-900">{money(request.booking.totalAmount)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Already refunded</dt>
              <dd className="font-medium text-slate-900">{money(request.booking.refundAmount)}</dd>
            </div>
          </dl>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="font-semibold text-slate-900">Attendee's reason</p>
            <p className="mt-1 whitespace-pre-line text-slate-700">{request.reason}</p>
          </div>

          {request.status === 'open' ? (
            <div className="space-y-4">
              <Field label="Refund amount" required hint={`Up to ${money(refundable)} can still be refunded on this booking.`} error={amount && !amountValid ? `Enter an amount between 0.01 and ${refundable}` : undefined}>
                {({ id }) => <Input id={id} type="number" min="0.01" max={refundable} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />}
              </Field>
              <Checkbox
                label="Cancel the booking and void its tickets"
                description="Recommended for full refunds. The seats or tickets go back on sale."
                checked={cancelBooking}
                disabled={request.booking.status !== 'confirmed'}
                onChange={(e) => setCancelBooking(e.target.checked)}
              />
              <Field label="Note to the attendee" hint="Sent by email. Required when declining.">
                {({ id }) => <Textarea id={id} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain the decision" />}
              </Field>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">Decision</p>
              <p className="mt-1 text-slate-700">{request.adminNote ?? 'No note recorded.'}</p>
              {request.refund && <p className="mt-2 text-emerald-700">Refund of {money(request.refund.amount)} ({request.refund.status}).</p>}
              <p className="mt-1 text-xs text-slate-500">Resolved {formatDateTime(request.resolvedAt)}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function RefundRequestsPage() {
  useDocumentTitle('Refund requests');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const query = { status, page, limit: 20 };
  const list = useQuery({ queryKey: adminKeys.refundRequests(query), queryFn: () => adminApi.refundRequests(query), placeholderData: keepPreviousData });

  const columns = [
    { key: 'status', label: 'Status', render: (r) => <RequestStatusBadge status={r.status} /> },
    { key: 'event', label: 'Event', render: (r) => <span className="block min-w-36 truncate font-medium text-slate-900">{r.event.title}</span> },
    { key: 'attendee', label: 'Attendee', render: (r) => <span className="block min-w-32"><span className="text-slate-900">{r.booking.contactName}</span><span className="block text-xs text-slate-500">{r.booking.orderNumber}</span></span> },
    { key: 'reason', label: 'Reason', render: (r) => <span className="block max-w-64 truncate text-slate-600">{r.reason}</span> },
    { key: 'paid', label: 'Paid', align: 'right', render: (r) => money(r.booking.totalAmount) },
    { key: 'createdAt', label: 'Raised', render: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.createdAt)}</span> },
    { key: 'actions', label: '', render: (r) => <div className="flex justify-end"><Button size="sm" variant={r.status === 'open' ? 'primary' : 'secondary'} onClick={() => setOpenId(r.id)}>{r.status === 'open' ? 'Review' : 'View'}</Button></div> },
  ];

  return (
    <div>
      <PageHeader title="Refund requests" description="Cases outside the automatic cancellation policy" />
      <div className="mb-4">
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          allLabel="All requests"
          options={[{ value: 'open', label: 'Open' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Declined' }]}
        />
      </div>
      <ListCard query={{ ...list, onPageChange: setPage }} columns={columns} empty="No refund requests." />
      <ReviewModal requestId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
