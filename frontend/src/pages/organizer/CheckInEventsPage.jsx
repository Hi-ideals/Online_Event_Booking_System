import { useQuery } from '@tanstack/react-query';
import { ChevronRight, QrCode } from 'lucide-react';
import { Link } from 'react-router';
import { orgEventsApi, orgKeys } from '../../api/organizer';
import { EventBanner } from '../../components/events/EventCard';
import { EventStatusBadge } from '../../components/organizer/orgUi';
import { Alert, EmptyState, PageHeader } from '../../components/ui/Feedback';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatDate, formatNumber, formatTime } from '../../lib/format';

const OPENS_HOURS_BEFORE = 24;

function windowLabel(event) {
  const now = Date.now();
  const opens = new Date(event.startAt).getTime() - OPENS_HOURS_BEFORE * 36e5;
  if (now < opens) return { text: `Check-in opens ${formatDate(new Date(opens), { day: 'numeric', month: 'short' })}, ${formatTime(new Date(opens))}`, open: false };
  if (now > new Date(event.endAt).getTime()) return { text: 'Event ended', open: true };
  if (now >= new Date(event.startAt).getTime()) return { text: 'Happening now', open: true };
  return { text: 'Check-in open', open: true };
}

export default function CheckInEventsPage() {
  useDocumentTitle('Check-in');
  const params = { limit: 50 };
  const { data, isLoading, isError, error } = useQuery({ queryKey: orgKeys.events({ ...params, scope: 'checkin' }), queryFn: () => orgEventsApi.list(params) });

  // Events that have (or had) tickets: soonest first, cancelled and drafts excluded.
  const events = (data?.items ?? [])
    .filter((e) => ['published', 'sales_closed', 'completed'].includes(e.status))
    .sort((a, b) => {
      const aPast = new Date(a.endAt) < new Date();
      const bPast = new Date(b.endAt) < new Date();
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast ? new Date(b.startAt) - new Date(a.startAt) : new Date(a.startAt) - new Date(b.startAt);
    });

  return (
    <div>
      <PageHeader title="Check-in" description="Pick an event to scan tickets at the gate and follow live attendance" />
      {isError ? (
        <Alert tone="error">{getErrorMessage(error)}</Alert>
      ) : isLoading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />
      ) : events.length === 0 ? (
        <EmptyState icon={QrCode} title="No events to check in" description="Published events appear here." className="rounded-2xl bg-white ring-1 ring-slate-200" />
      ) : (
        <ul className="space-y-3">
          {events.map((event) => {
            const w = windowLabel(event);
            return (
              <li key={event.id}>
                <Link to={`/organizer/check-in/${event.id}`} className="flex items-center gap-4 rounded-2xl bg-white p-3 ring-1 ring-slate-200 transition hover:shadow-md sm:p-4">
                  <EventBanner event={event} className="h-16 w-16 shrink-0 rounded-xl sm:h-20 sm:w-28" iconClassName="h-6 w-6" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{event.title}</p>
                    <p className="text-sm text-slate-500">
                      {formatDate(event.startAt, { weekday: 'short', day: 'numeric', month: 'short' })}, {formatTime(event.startAt)} &middot; {event.venue.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <EventStatusBadge status={event.status} />
                      <span className={w.open ? 'text-xs font-medium text-emerald-700' : 'text-xs text-slate-500'}>{w.text}</span>
                      <span className="text-xs text-slate-400">&middot; {formatNumber(event.ticketsSold)} tickets</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
