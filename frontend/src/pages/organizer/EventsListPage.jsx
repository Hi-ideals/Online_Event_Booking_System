import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarPlus, CalendarSearch, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { orgEventsApi, orgKeys } from '../../api/organizer';
import { EventBanner } from '../../components/events/EventCard';
import { EVENT_STATUS_OPTIONS, EventStatusBadge, Table, Tabs } from '../../components/organizer/orgUi';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Alert, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { Input } from '../../components/ui/Form';
import Pagination from '../../components/ui/Pagination';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import cn from '../../lib/cn';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate, formatNumber, formatTime } from '../../lib/format';

const TABS = [{ value: '', label: 'All' }, ...EVENT_STATUS_OPTIONS];

function Sold({ event }) {
  const pct = event.totalTickets ? Math.round((event.ticketsSold / event.totalTickets) * 100) : 0;
  return (
    <div className="min-w-28">
      <p className="text-xs tabular-nums text-slate-600">
        {formatNumber(event.ticketsSold)} / {formatNumber(event.totalTickets)}
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function EventsListPage() {
  useDocumentTitle('My events');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const status = params.get('status') ?? '';
  const page = Number(params.get('page')) || 1;
  const query = { status, search: search.trim(), page, limit: 10 };

  const { data, isLoading, isError, error, isFetching } = useQuery({ queryKey: orgKeys.events(query), queryFn: () => orgEventsApi.list(query), placeholderData: keepPreviousData });

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const columns = [
    {
      key: 'title',
      label: 'Event',
      render: (e) => (
        <div className="flex min-w-64 items-center gap-3">
          <EventBanner event={e} className="h-10 w-14 shrink-0 rounded-lg" iconClassName="h-4 w-4" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{e.title}</p>
            <p className="truncate text-xs text-slate-500">{e.venue.name}, {e.venue.city}</p>
          </div>
        </div>
      ),
    },
    { key: 'date', label: 'Date', render: (e) => <span className="whitespace-nowrap">{formatDate(e.startAt)}<span className="block text-xs text-slate-500">{formatTime(e.startAt)}</span></span> },
    { key: 'status', label: 'Status', render: (e) => <EventStatusBadge status={e.status} blocked={e.isBlocked} /> },
    { key: 'sold', label: 'Sold', render: (e) => <Sold event={e} /> },
    { key: 'price', label: 'Price', align: 'right', render: (e) => (e.minPrice === null ? '-' : formatCurrency(e.minPrice)) },
  ];

  return (
    <div>
      <PageHeader title="Events" description="Create, publish and manage your events" action={<Button to="/organizer/events/new" icon={CalendarPlus}>Create event</Button>} />

      <Tabs tabs={TABS} value={status} onChange={(v) => setParam('status', v)} />

      <label className="relative mt-4 block max-w-sm">
        <span className="sr-only">Search events</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setParam('page', '');
          }}
          placeholder="Search by title"
          className="pl-9"
        />
      </label>

      <div className={cn('mt-4 transition-opacity', isFetching && !isLoading && 'opacity-60')}>
        {isError ? (
          <Alert tone="error">{getErrorMessage(error)}</Alert>
        ) : isLoading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={CalendarSearch}
            title={status || search ? 'No events found' : 'No events yet'}
            description={status || search ? 'Try another status or search.' : 'Create your first event to start selling tickets.'}
            action={!status && !search && <Button to="/organizer/events/new" icon={CalendarPlus}>Create event</Button>}
            className="rounded-2xl bg-white ring-1 ring-slate-200"
          />
        ) : (
          <>
            {/* Phones: cards */}
            <ul className="space-y-3 md:hidden">
              {data.items.map((e) => (
                <li key={e.id}>
                  <Link to={`/organizer/events/${e.id}`} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                    <EventBanner event={e} className="h-20 w-20 shrink-0 rounded-xl" iconClassName="h-6 w-6" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-medium text-slate-900">{e.title}</p>
                      <p className="text-xs text-slate-500">{formatDate(e.startAt)}, {formatTime(e.startAt)}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <EventStatusBadge status={e.status} blocked={e.isBlocked} />
                        <span className="text-xs tabular-nums text-slate-500">
                          {formatNumber(e.ticketsSold)}/{formatNumber(e.totalTickets)} sold
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Larger screens: table */}
            <Card className="hidden overflow-hidden md:block">
              <Table columns={columns} rows={data.items} onRowClick={(e) => navigate(`/organizer/events/${e.id}`)} />
            </Card>
            <Pagination className="mt-6" pagination={data.pagination} onChange={(p) => setParam('page', p > 1 ? String(p) : '')} />
          </>
        )}
      </div>
    </div>
  );
}
