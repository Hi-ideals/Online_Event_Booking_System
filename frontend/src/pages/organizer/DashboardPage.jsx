import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, CalendarPlus, FilePen, IndianRupee, MapPinPlus, Ticket, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { orgEventsApi, orgKeys, organizerApi } from '../../api/organizer';
import { EventStatusBadge, StatCard } from '../../components/organizer/orgUi';
import Button from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState, PageHeader } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatCurrency, formatDate, formatNumber, formatTime } from '../../lib/format';

function EventList({ events, emptyText }) {
  if (!events.length) return <p className="px-5 py-8 text-center text-sm text-slate-500">{emptyText}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {events.map((event) => {
        const pct = event.totalTickets ? Math.round((event.ticketsSold / event.totalTickets) * 100) : 0;
        return (
          <li key={event.id}>
            <Link to={`/organizer/events/${event.id}`} className="flex flex-col gap-2 px-5 py-3.5 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{event.title}</p>
                <p className="text-xs text-slate-500">
                  {formatDate(event.startAt, { weekday: 'short', day: 'numeric', month: 'short' })}, {formatTime(event.startAt)} &middot; {event.venue.city}
                </p>
              </div>
              <div className="flex items-center gap-3 sm:w-56">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-20 text-right text-xs tabular-nums text-slate-600">
                  {formatNumber(event.ticketsSold)}/{formatNumber(event.totalTickets)}
                </span>
              </div>
              <div className="sm:w-28 sm:text-right">
                <EventStatusBadge status={event.status} blocked={event.isBlocked} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Organizer dashboard');
  const { user } = useAuth();

  const earnings = useQuery({ queryKey: orgKeys.earnings, queryFn: organizerApi.earnings });
  const analytics = useQuery({ queryKey: orgKeys.analytics({}), queryFn: () => organizerApi.analytics() });
  const upcoming = useQuery({ queryKey: orgKeys.events({ status: 'published', limit: 6 }), queryFn: () => orgEventsApi.list({ status: 'published', limit: 6 }) });
  const drafts = useQuery({ queryKey: orgKeys.events({ status: 'draft', limit: 5 }), queryFn: () => orgEventsApi.list({ status: 'draft', limit: 5 }) });

  const e = earnings.data;
  const totals = analytics.data?.totals;
  const noEventsYet = upcoming.data?.pagination.total === 0 && drafts.data?.pagination.total === 0;
  const loading = (q) => (q.isLoading ? '...' : null);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description={user.organizerProfile?.organizationName}
        action={
          <>
            <Button to="/organizer/venues" variant="secondary" icon={MapPinPlus}>
              Venues
            </Button>
            <Button to="/organizer/events/new" icon={CalendarPlus}>
              Create event
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Tickets sold" value={loading(analytics) ?? formatNumber(totals?.ticketsSold)} hint="Last 30 days" icon={Ticket} />
        <StatCard label="Net earnings" value={loading(analytics) ?? formatCurrency(totals?.netEarnings, { free: false })} hint="Last 30 days, after commission" icon={IndianRupee} tone="green" />
        <StatCard label="Upcoming earnings" value={loading(earnings) ?? formatCurrency(e?.upcomingEarnings, { free: false })} hint="From events not yet completed" icon={CalendarClock} tone="blue" />
        <StatCard label="Pending payout" value={loading(earnings) ?? formatCurrency(e?.pendingPayout, { free: false })} hint={e ? `Paid out so far ${formatCurrency(e.paidOut, { free: false })}` : undefined} icon={Wallet} tone="amber" />
      </div>

      {noEventsYet ? (
        <Card className="mt-6">
          <EmptyState
            icon={CalendarPlus}
            title="Create your first event"
            description="Add a venue, set up tickets and publish. Attendees can book as soon as your event is live."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button to="/organizer/venues" variant="secondary">
                  Add a venue
                </Button>
                <Button to="/organizer/events/new">Create event</Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
          <Card className="overflow-hidden">
            <CardHeader
              title="Events on sale"
              description="Ticket sales progress"
              action={
                <Link to="/organizer/events" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
                  All events <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
            {upcoming.isLoading ? <div className="h-40 animate-pulse bg-slate-50" /> : <EventList events={[...upcoming.data.items].sort((a, b) => new Date(a.startAt) - new Date(b.startAt))} emptyText="No events on sale right now." />}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title={<span className="flex items-center gap-2"><FilePen className="h-4 w-4 text-slate-400" />Drafts</span>} description="Finish and publish these" />
            {drafts.isLoading ? (
              <div className="h-40 animate-pulse bg-slate-50" />
            ) : drafts.data.items.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No drafts.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {drafts.data.items.map((event) => (
                  <li key={event.id}>
                    <Link to={`/organizer/events/${event.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{event.title}</span>
                        <span className="text-xs text-slate-500">{formatDate(event.startAt)}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
