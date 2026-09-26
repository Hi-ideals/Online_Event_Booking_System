import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router';
import { adminApi, adminKeys } from '../../api/admin';
import { FilterSelect, ListCard } from '../../components/admin/AdminList';
import { RefundStatusBadge } from '../../components/bookings/bookingUi';
import { Tabs } from '../../components/organizer/orgUi';
import Button from '../../components/ui/Button';
import { Alert, Badge, PageHeader } from '../../components/ui/Feedback';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDateTime, titleCase } from '../../lib/format';
import { BookingDetailModal } from './AdminBookingsPage';

const money = (v) => formatCurrency(v, { free: false });
const PAYMENT_TONE = { captured: 'green', created: 'amber', failed: 'red' };
const REFUND_TYPES = [
  { value: 'attendee_cancellation', label: 'Attendee cancelled' },
  { value: 'event_cancellation', label: 'Event cancelled' },
  { value: 'late_payment', label: 'Late payment' },
  { value: 'admin', label: 'Approved by support' },
];

export default function PaymentsPage() {
  useDocumentTitle('Payments & refunds');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [openBooking, setOpenBooking] = useState(null);
  const tab = params.get('tab') === 'refunds' ? 'refunds' : 'payments';
  const status = params.get('status') ?? '';

  const paymentsQuery = { status, page, limit: 20 };
  const refundsQuery = { status, type, page, limit: 20 };
  const payments = useQuery({ queryKey: adminKeys.payments(paymentsQuery), queryFn: () => adminApi.payments(paymentsQuery), placeholderData: keepPreviousData, enabled: tab === 'payments' });
  const refunds = useQuery({ queryKey: adminKeys.refunds(refundsQuery), queryFn: () => adminApi.refunds(refundsQuery), placeholderData: keepPreviousData, enabled: tab === 'refunds' });

  const retry = useMutation({
    mutationFn: (refund) => adminApi.retryRefund(refund.id),
    onSuccess: () => {
      toast.success('Refund queued for another attempt');
      queryClient.invalidateQueries({ queryKey: ['admin', 'refunds'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
    setPage(1);
  };

  const paymentColumns = [
    { key: 'booking', label: 'Booking', render: (p) => <button type="button" onClick={() => setOpenBooking(p.booking.id)} className="font-mono text-xs text-brand-600 hover:underline">{p.booking.orderNumber}</button> },
    { key: 'contact', label: 'Attendee', render: (p) => <span className="block min-w-32 text-slate-900">{p.booking.contactName}</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (p) => money(p.amount) },
    { key: 'method', label: 'Method', render: (p) => (p.method ? p.method.toUpperCase() : '-') },
    { key: 'status', label: 'Status', render: (p) => <span className="block"><Badge tone={PAYMENT_TONE[p.status]}>{titleCase(p.status)}</Badge>{p.failureReason && <span className="mt-0.5 block max-w-44 text-xs text-rose-600">{p.failureReason}</span>}</span> },
    { key: 'ref', label: 'Gateway reference', render: (p) => <span className="block max-w-44 truncate font-mono text-xs text-slate-500">{p.providerPaymentId ?? p.providerOrderId}</span> },
    { key: 'date', label: 'When', render: (p) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(p.capturedAt ?? p.createdAt)}</span> },
  ];

  const refundColumns = [
    { key: 'booking', label: 'Booking', render: (r) => <button type="button" onClick={() => setOpenBooking(r.booking.id)} className="font-mono text-xs text-brand-600 hover:underline">{r.booking.orderNumber}</button> },
    { key: 'event', label: 'Event', render: (r) => <span className="block min-w-36 truncate text-slate-900">{r.event.title}</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
    { key: 'type', label: 'Reason', render: (r) => <span className="block"><span className="text-slate-700">{REFUND_TYPES.find((t) => t.value === r.type)?.label ?? titleCase(r.type)}</span>{r.reason && <span className="mt-0.5 block max-w-44 truncate text-xs text-slate-500">{r.reason}</span>}</span> },
    { key: 'status', label: 'Status', render: (r) => <span className="block"><RefundStatusBadge status={r.status} />{r.failureReason && <span className="mt-0.5 block max-w-44 text-xs text-rose-600">{r.failureReason} ({r.attempts} attempts)</span>}</span> },
    { key: 'date', label: 'When', render: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.processedAt ?? r.createdAt)}</span> },
    {
      key: 'actions',
      label: '',
      render: (r) =>
        r.status === 'failed' && !r.providerRefundId ? (
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" icon={RefreshCw} loading={retry.isPending && retry.variables?.id === r.id} onClick={() => retry.mutate(r)}>
              Retry
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Payments & refunds" description="Money in and out, straight from the payment gateway" />

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => {
          setParams(v === 'refunds' ? { tab: 'refunds' } : {});
          setPage(1);
        }}
        tabs={[
          { value: 'payments', label: 'Payments' },
          { value: 'refunds', label: 'Refunds' },
        ]}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => setParam('status', v)}
          allLabel="All statuses"
          options={
            tab === 'payments'
              ? [{ value: 'captured', label: 'Captured' }, { value: 'created', label: 'Awaiting payment' }, { value: 'failed', label: 'Failed' }]
              : [{ value: 'processed', label: 'Refunded' }, { value: 'pending', label: 'Processing' }, { value: 'failed', label: 'Failed' }]
          }
        />
        {tab === 'refunds' && <FilterSelect label="Reason" value={type} onChange={(v) => { setType(v); setPage(1); }} allLabel="All reasons" options={REFUND_TYPES} />}
      </div>

      {tab === 'refunds' && status === 'failed' && (
        <Alert tone="warning" className="mb-4">
          Failed refunds are retried automatically up to 5 times. Use Retry for ones that never reached the gateway.
        </Alert>
      )}

      {tab === 'payments' ? (
        <ListCard query={{ ...payments, onPageChange: setPage }} columns={paymentColumns} empty="No payments found." />
      ) : (
        <ListCard query={{ ...refunds, onPageChange: setPage }} columns={refundColumns} empty="No refunds found." />
      )}

      <BookingDetailModal bookingId={openBooking} onClose={() => setOpenBooking(null)} />
    </div>
  );
}
