import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, ClipboardList, LayoutDashboard, Ticket, Users } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { orgEventsApi, orgKeys } from '../../api/organizer';
import OverviewTab from '../../components/organizer/event/OverviewTab';
import { AttendeesTab, BookingsTab } from '../../components/organizer/event/PeopleTabs';
import SalesTab from '../../components/organizer/event/SalesTab';
import TicketsTab from '../../components/organizer/event/TicketsTab';
import { EventStatusBadge, Tabs } from '../../components/organizer/orgUi';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import Button from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatDate, formatTime } from '../../lib/format';

export default function EventManagePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: event, isLoading, isError, error } = useQuery({ queryKey: orgKeys.event(id), queryFn: () => orgEventsApi.get(id) });
  useDocumentTitle(event?.title ?? 'Event');

  if (isLoading) return <PageLoader />;
  if (isError) {
    return error.response?.status === 404 ? (
      <EmptyState icon={Ticket} title="Event not found" action={<Button to="/organizer/events">Back to events</Button>} />
    ) : (
      <Alert tone="error">{getErrorMessage(error)}</Alert>
    );
  }

  const hasSales = event.status !== 'draft';
  const tabs = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    { value: 'tickets', label: 'Tickets', icon: Ticket, count: event.tiers.length },
    ...(hasSales
      ? [
        { value: 'bookings', label: 'Bookings', icon: ClipboardList },
        { value: 'attendees', label: 'Attendees', icon: Users },
        { value: 'sales', label: 'Sales', icon: BarChart3 },
      ]
      : []),
  ];
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview';

  return (
    <div>
      <Link to="/organizer/events" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Events
      </Link>
      <div className="mt-2 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{event.title}</h1>
          <EventStatusBadge status={event.status} blocked={event.isBlocked} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {formatDate(event.startAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, {formatTime(event.startAt)} &middot; {event.venue.name}, {event.venue.city}
        </p>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={(value) => setParams(value === 'overview' ? {} : { tab: value }, { replace: true })} className="mb-6" />

      {tab === 'overview' && <OverviewTab event={event} />}
      {tab === 'tickets' && <TicketsTab event={event} />}
      {tab === 'bookings' && <BookingsTab event={event} />}
      {tab === 'attendees' && <AttendeesTab event={event} />}
      {tab === 'sales' && <SalesTab event={event} />}
    </div>
  );
}
