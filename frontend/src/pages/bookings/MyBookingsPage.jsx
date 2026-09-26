import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Clock, MapPin, Ticket } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { bookingKeys, bookingsApi } from '../../api/bookings';
import { BookingStatusBadge } from '../../components/bookings/bookingUi';
import { EventBanner } from '../../components/events/EventCard';
import Button from '../../components/ui/Button';
import { Alert, EmptyState, PageHeader } from '../../components/ui/Feedback';
import Pagination from '../../components/ui/Pagination';
import useCountdown from '../../hooks/useCountdown';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import cn from '../../lib/cn';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate, formatTime } from '../../lib/format';

const TABS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All bookings' },
];

function PendingNotice({ booking }) {
  const { label, expired } = useCountdown(booking.expiresAt);
  if (expired) return <p className="text-xs font-medium text-slate-500">Reservation expired</p>;
  return (
    <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
      <Clock className="h-3.5 w-3.5" /> Pay within {label}
    </p>
  );
}

function BookingRow({ booking }) {
  const { event } = booking;
  const pending = booking.status === 'pending_payment';
  const to = pending ? `/checkout/${booking.id}` : `/bookings/${booking.id}`;
  const past = new Date(event.endAt) < new Date();

  return (
    <li>
      <Link to={to} className="group flex gap-4 rounded-2xl bg-white p-3 ring-1 ring-slate-200 transition hover:shadow-md hover:ring-slate-300 sm:p-4">
        <EventBanner event={event} className={cn('h-24 w-24 shrink-0 rounded-xl sm:h-28 sm:w-40', past && 'grayscale')} iconClassName="h-8 w-8" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-700">{event.title}</h3>
            <ChevronRight className="mt-0.5 hidden h-5 w-5 shrink-0 text-slate-300 sm:block" />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {formatDate(event.startAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, {formatTime(event.startAt)}
            </span>
          </p>
          <p className="mt-0.5 hidden items-center gap-1.5 text-sm text-slate-500 sm:flex">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {event.venue.name}, {event.venue.city}
            </span>
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
            <BookingStatusBadge status={booking.status} />
            <span className="text-xs text-slate-500">
              {booking.ticketCount} ticket{booking.ticketCount === 1 ? '' : 's'} &middot; {formatCurrency(booking.totalAmount)}
            </span>
            {pending && <PendingNotice booking={booking} />}
          </div>
        </div>
      </Link>
    </li>
  );
}

export default function MyBookingsPage() {
  useDocumentTitle('My bookings');
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'upcoming';
  const page = Number(params.get('page')) || 1;
  const query = { when: tab === 'all' ? undefined : tab, page, limit: 10 };

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: bookingKeys.list(query),
    queryFn: () => bookingsApi.list(query),
    placeholderData: keepPreviousData,
  });

  const setTab = (value) => setParams(value === 'upcoming' ? {} : { tab: value });

  return (
    <div className="container-page max-w-4xl py-8 sm:py-10">
      <PageHeader title="My bookings" description="Your tickets, invoices and booking history" action={<Button to="/events" variant="secondary">Find events</Button>} />

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition',
              tab === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isError ? (
        <Alert tone="error" title="Could not load bookings">
          {getErrorMessage(error)}
        </Alert>
      ) : isLoading ? (
        <ul className="space-y-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="h-32 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />
          ))}
        </ul>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={tab === 'past' ? 'No past bookings' : 'No bookings yet'}
          description={tab === 'upcoming' ? 'When you book an event, your tickets will appear here.' : 'Bookings for events that have ended show up here.'}
          action={<Button to="/events">Explore events</Button>}
          className="rounded-2xl bg-white ring-1 ring-slate-200"
        />
      ) : (
        <>
          <ul className={cn('space-y-3 transition-opacity', isFetching && 'opacity-60')}>
            {data.items.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </ul>
          <Pagination
            className="mt-6"
            pagination={data.pagination}
            onChange={(p) => {
              const next = new URLSearchParams(params);
              if (p > 1) next.set('page', p);
              else next.delete('page');
              setParams(next);
            }}
          />
        </>
      )}
    </div>
  );
}
