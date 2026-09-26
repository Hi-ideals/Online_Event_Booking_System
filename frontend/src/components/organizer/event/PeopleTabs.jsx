import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { orgEventsApi, orgKeys } from '../../../api/organizer';
import cn from '../../../lib/cn';
import { getErrorMessage } from '../../../lib/errors';
import { formatCurrency, formatDateTime, formatNumber } from '../../../lib/format';
import { BookingStatusBadge } from '../../bookings/bookingUi';
import Button from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Alert } from '../../ui/Feedback';
import { Input, Select } from '../../ui/Form';
import Pagination from '../../ui/Pagination';
import { Table } from '../orgUi';

function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="relative block w-full sm:max-w-xs">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </label>
  );
}

export function BookingsTab({ event }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const params = { search: q.trim(), status, page, limit: 20 };
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: orgKeys.bookings(event.id, params),
    queryFn: () => orgEventsApi.bookings(event.id, params),
    placeholderData: keepPreviousData,
  });

  useEffect(() => setPage(1), [q, status]);

  const columns = [
    { key: 'orderNumber', label: 'Booking', render: (b) => <span className="font-mono text-xs">{b.orderNumber}</span> },
    { key: 'contact', label: 'Attendee', render: (b) => <span className="block min-w-40"><span className="font-medium text-slate-900">{b.contactName}</span><span className="block text-xs text-slate-500">{b.contactEmail}</span></span> },
    { key: 'tickets', label: 'Tickets', align: 'right', render: (b) => b.ticketCount },
    { key: 'total', label: 'Amount', align: 'right', render: (b) => formatCurrency(b.totalAmount) },
    { key: 'status', label: 'Status', render: (b) => <BookingStatusBadge status={b.status} /> },
    { key: 'createdAt', label: 'Booked', render: (b) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(b.createdAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox value={search} onChange={setSearch} placeholder="Search booking, name or email" />
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-48">
          <option value="">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending_payment">Payment pending</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
        </Select>
      </div>
      {isError ? (
        <Alert tone="error">{getErrorMessage(error)}</Alert>
      ) : (
        <Card className={cn('overflow-hidden transition-opacity', isFetching && !isLoading && 'opacity-60')}>
          {isLoading ? <div className="h-48 animate-pulse bg-slate-50" /> : <Table columns={columns} rows={data.items} empty="No bookings match." />}
        </Card>
      )}
      {data && <Pagination pagination={data.pagination} onChange={setPage} />}
    </div>
  );
}

export function AttendeesTab({ event }) {
  const [search, setSearch] = useState('');
  const [tierId, setTierId] = useState('');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const q = useDebounced(search);
  const params = { search: q.trim(), tierId, page, limit: 50 };
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: orgKeys.attendees(event.id, params),
    queryFn: () => orgEventsApi.attendees(event.id, params),
    placeholderData: keepPreviousData,
  });

  useEffect(() => setPage(1), [q, tierId]);

  const download = async () => {
    setDownloading(true);
    try {
      await orgEventsApi.downloadAttendees(event.id, event.title);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Download failed'));
    } finally {
      setDownloading(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Name', render: (a) => <span className="block min-w-36"><span className="font-medium text-slate-900">{a.name}</span><span className="block text-xs text-slate-500">{a.email}</span></span> },
    { key: 'phone', label: 'Phone', render: (a) => a.phone ?? '-' },
    { key: 'tier', label: 'Ticket', render: (a) => a.tier },
    { key: 'seat', label: event.seatingType === 'seated' ? 'Seat' : 'Qty', render: (a) => (a.seat ? a.seat.split(' - ').pop() : a.quantity) },
    { key: 'orderNumber', label: 'Booking', render: (a) => <span className="font-mono text-xs">{a.orderNumber}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox value={search} onChange={setSearch} placeholder="Search name, email or booking" />
        <Select aria-label="Filter by ticket type" value={tierId} onChange={(e) => setTierId(e.target.value)} className="sm:w-48">
          <option value="">All ticket types</option>
          {event.tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Button variant="secondary" icon={Download} loading={downloading} onClick={download} className="sm:ml-auto">
          Download CSV
        </Button>
      </div>
      {data && (
        <p className="text-sm text-slate-500">
          {formatNumber(data.summary.tickets)} ticket{data.summary.tickets === 1 ? '' : 's'} in {formatNumber(data.summary.orders)} confirmed booking{data.summary.orders === 1 ? '' : 's'}
        </p>
      )}
      {isError ? (
        <Alert tone="error">{getErrorMessage(error)}</Alert>
      ) : (
        <Card className={cn('overflow-hidden transition-opacity', isFetching && !isLoading && 'opacity-60')}>
          {isLoading ? (
            <div className="h-48 animate-pulse bg-slate-50" />
          ) : (
            <Table columns={columns} rows={data.items.map((a, i) => ({ ...a, id: `${a.orderNumber}-${a.seat ?? a.tier}-${i}` }))} empty="No confirmed attendees yet." />
          )}
        </Card>
      )}
      {data && <Pagination pagination={data.pagination} onChange={setPage} />}
    </div>
  );
}
