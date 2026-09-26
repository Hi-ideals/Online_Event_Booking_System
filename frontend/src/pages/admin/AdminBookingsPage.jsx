import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi, adminKeys } from '../../api/admin';
import { FilterSelect, ListCard, SearchBox } from '../../components/admin/AdminList';
import { BookingStatusBadge, RefundStatusBadge } from '../../components/bookings/bookingUi';
import Button from '../../components/ui/Button';
import { Alert, Badge, PageHeader } from '../../components/ui/Feedback';
import Modal from '../../components/ui/Modal';
import useDebounced from '../../hooks/useDebounced';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDateTime, titleCase } from '../../lib/format';

const money = (v) => formatCurrency(v, { free: false });

export function BookingDetailModal({ bookingId, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const { data: booking, isLoading, isError, error } = useQuery({ queryKey: adminKeys.booking(bookingId), queryFn: () => adminApi.booking(bookingId), enabled: Boolean(bookingId) });

  const download = async () => {
    setDownloading(true);
    try {
      await adminApi.downloadInvoice(booking);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Download failed'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={Boolean(bookingId)}
      onClose={onClose}
      title="Booking details"
      description={booking?.orderNumber}
      size="lg"
      footer={
        booking?.invoiceNumber && (
          <Button variant="secondary" icon={FileText} loading={downloading} onClick={download}>
            Invoice PDF
          </Button>
        )
      }
    >
      {isError ? (
        <Alert tone="error">{getErrorMessage(error)}</Alert>
      ) : isLoading || !booking ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={booking.status} />
            {booking.invoiceNumber && <span className="font-mono text-xs text-slate-500">{booking.invoiceNumber}</span>}
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Event</dt>
              <dd className="font-medium text-slate-900">{booking.event.title}</dd>
              <dd className="text-xs text-slate-500">
                {formatDateTime(booking.event.startAt)} &middot; {booking.event.venue.name}, {booking.event.venue.city}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Attendee</dt>
              <dd className="font-medium text-slate-900">{booking.contactName}</dd>
              <dd className="text-xs text-slate-500">
                {booking.contactEmail}
                {booking.contactPhone ? ` · ${booking.contactPhone}` : ''}
              </dd>
            </div>
          </dl>

          <div>
            <p className="mb-2 font-semibold text-slate-900">Tickets</p>
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {booking.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 px-4 py-2.5">
                  <span className="text-slate-700">
                    {item.tierName}
                    {item.seatLabel ? ` · ${item.seatLabel}` : ` × ${item.quantity}`}
                  </span>
                  <span className="tabular-nums text-slate-900">{money(item.lineTotal)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 bg-slate-50 px-4 py-2.5 font-semibold">
                <span>Total paid</span>
                <span className="tabular-nums">{money(booking.totalAmount)}</span>
              </li>
            </ul>
          </div>

          {booking.payment && (
            <dl className="grid gap-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Payment</dt>
                <dd className="text-slate-900">
                  {titleCase(booking.payment.status)} &middot; {booking.payment.method?.toUpperCase() ?? 'online'}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">Gateway reference</dt>
                <dd className="truncate font-mono text-xs text-slate-900">{booking.payment.providerPaymentId ?? '-'}</dd>
              </div>
              {booking.payment.failureReason && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">Failure</dt>
                  <dd className="text-rose-700">{booking.payment.failureReason}</dd>
                </div>
              )}
            </dl>
          )}

          {booking.refunds.length > 0 && (
            <div>
              <p className="mb-2 font-semibold text-slate-900">Refunds</p>
              <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                {booking.refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span>
                      <span className="font-medium text-slate-900">{money(r.amount)}</span>
                      <span className="block text-xs text-slate-500">
                        {titleCase(r.type)} &middot; {formatDateTime(r.createdAt)}
                      </span>
                    </span>
                    <RefundStatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {booking.cancellationReason && (
            <p className="rounded-xl bg-rose-50 p-3 text-rose-800 ring-1 ring-rose-200">
              Cancelled: {booking.cancellationReason}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function AdminBookingsPage() {
  useDocumentTitle('All bookings');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const q = useDebounced(search);

  const query = { search: q.trim(), status, page, limit: 20 };
  const list = useQuery({ queryKey: adminKeys.bookings(query), queryFn: () => adminApi.bookings(query), placeholderData: keepPreviousData });

  const columns = [
    { key: 'orderNumber', label: 'Booking', render: (b) => <span className="font-mono text-xs">{b.orderNumber}</span> },
    { key: 'event', label: 'Event', render: (b) => <span className="block min-w-40 truncate font-medium text-slate-900">{b.event.title}</span> },
    { key: 'customer', label: 'Attendee', render: (b) => <span className="block min-w-36"><span className="text-slate-900">{b.contactName}</span><span className="block text-xs text-slate-500">{b.contactEmail}</span></span> },
    { key: 'tickets', label: 'Tickets', align: 'right', render: (b) => b.ticketCount },
    { key: 'total', label: 'Amount', align: 'right', render: (b) => <span>{money(b.totalAmount)}{b.refundAmount > 0 && <span className="block text-xs text-rose-600">-{money(b.refundAmount)}</span>}</span> },
    { key: 'status', label: 'Status', render: (b) => <BookingStatusBadge status={b.status} /> },
    { key: 'createdAt', label: 'Booked', render: (b) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(b.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="All bookings" description="Every booking on the platform" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search booking number, name or email" />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          allLabel="All statuses"
          options={[
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'pending_payment', label: 'Payment pending' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'expired', label: 'Expired' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
      </div>

      <ListCard query={{ ...list, onPageChange: setPage }} columns={columns} empty="No bookings found." onRowClick={(b) => setOpenId(b.id)} />
      <p className="mt-2 text-xs text-slate-500">Tip: click a row to see tickets, payment and refunds.</p>

      <BookingDetailModal bookingId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
