import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, CalendarDays, Clock, MapPin, Navigation, RotateCcw, Share2, Tag, Ticket } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link, useParams } from 'react-router';
import { eventKeys, eventsApi } from '../../api/events';
import { availabilityBadge, EventBanner, priceLabel } from '../../components/events/EventCard';
import TicketSelector from '../../components/events/TicketSelector';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { PageLoader } from '../../components/ui/Spinner';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatDate, formatTime } from '../../lib/format';

function InfoRow({ icon: Icon, title, children }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-slate-900">{title}</p>
        <div className="text-slate-500">{children}</div>
      </div>
    </div>
  );
}

function refundPolicyText(event) {
  if (!event.refundAllowed) return 'Tickets for this event are non-refundable.';
  const when = event.refundCutoffHours > 0 ? `up to ${event.refundCutoffHours} hours before the event starts` : 'until the event starts';
  const amount = event.refundPercent === 100 ? 'a full refund of the ticket price' : `a ${event.refundPercent}% refund of the ticket price`;
  return `Cancel ${when} for ${amount}. Convenience fees are non-refundable.`;
}

async function share(event) {
  const url = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: event.title, text: event.summary ?? event.title, url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    }
  } catch {
    /* user closed the share sheet */
  }
}

export default function EventDetailPage() {
  const { slug } = useParams();
  const { data: event, isLoading, isError, error } = useQuery({ queryKey: eventKeys.detail(slug), queryFn: () => eventsApi.get(slug) });
  useDocumentTitle(event?.title ?? 'Event');

  if (isLoading) return <PageLoader />;
  if (isError) {
    return (
      <div className="container-page py-16">
        {error.response?.status === 404 ? (
          <EmptyState icon={Ticket} title="Event not found" description="This event may have been removed or the link is incorrect." action={<Button to="/events">Browse events</Button>} />
        ) : (
          <Alert tone="error" title="Could not load this event">
            {getErrorMessage(error)}
          </Alert>
        )}
      </div>
    );
  }

  const sameDay = formatDate(event.startAt) === formatDate(event.endAt);
  const mapUrl = event.venue.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue.name}, ${event.venue.addressLine}, ${event.venue.city}`)}`;
  const badge = availabilityBadge(event);

  return (
    <div className="pb-24 lg:pb-12">
      {/* Banner */}
      <div className="relative overflow-hidden bg-slate-900">
        <EventBanner event={event} className="absolute inset-0 h-full w-full scale-110 opacity-40 blur-2xl" iconClassName="hidden" />
        <div className="container-page relative py-4 sm:py-6">
          <Link to="/events" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> All events
          </Link>
          <EventBanner event={event} className="aspect-[16/9] max-h-[420px] w-full rounded-2xl shadow-2xl sm:aspect-[21/9]" iconClassName="h-20 w-20" />
        </div>
      </div>

      <div className="container-page mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{event.category.name}</Badge>
            {event.isFeatured && <Badge tone="amber">Featured</Badge>}
            {badge}
          </div>
          <div className="mt-3 flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">{event.title}</h1>
            <Button variant="secondary" size="icon" onClick={() => share(event)} aria-label="Share event" className="shrink-0 rounded-full">
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
          {event.summary && <p className="mt-3 text-base text-slate-600 sm:text-lg">{event.summary}</p>}

          <Card className="mt-6 grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <InfoRow icon={CalendarDays} title={formatDate(event.startAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
              {formatTime(event.startAt)} - {sameDay ? formatTime(event.endAt) : formatDate(event.endAt, { dateStyle: 'medium', timeStyle: 'short' })}
            </InfoRow>
            <InfoRow icon={MapPin} title={event.venue.name}>
              <p>
                {event.venue.addressLine}, {event.venue.city}
                {event.venue.pincode ? ` - ${event.venue.pincode}` : ''}
              </p>
              <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700">
                <Navigation className="h-3.5 w-3.5" /> Get directions
              </a>
            </InfoRow>
            <InfoRow icon={Building2} title="Organized by">
              {event.organizer.name}
            </InfoRow>
            <InfoRow icon={Clock} title="Duration">
              {Math.round((new Date(event.endAt) - new Date(event.startAt)) / 36e5 * 10) / 10} hours
            </InfoRow>
          </Card>

          {event.status === 'cancelled' && (
            <Alert tone="error" title="This event has been cancelled" className="mt-6">
              {event.cancellationReason ?? 'All ticket holders will be refunded automatically.'}
            </Alert>
          )}

          {event.description && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-slate-900">About this event</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-600">{event.description}</p>
            </section>
          )}

          {event.tags?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {event.tags.map((tag) => (
                <Link key={tag} to={`/events?q=${encodeURIComponent(tag)}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600 hover:bg-slate-200">
                  <Tag className="h-3.5 w-3.5" /> {tag}
                </Link>
              ))}
            </div>
          )}

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-slate-900">Cancellation & refunds</h2>
            <div className="mt-3 flex gap-3 rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
              <RotateCcw className="h-5 w-5 shrink-0 text-brand-600" />
              {refundPolicyText(event)}
            </div>
          </section>
        </div>

        <aside id="tickets" className="scroll-mt-24">
          <Card className="p-5 sm:p-6 lg:sticky lg:top-24">
            <div className="mb-4 flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Tickets</h2>
              <p className="text-sm font-medium text-slate-500">{priceLabel(event)}</p>
            </div>
            <TicketSelector event={event} />
          </Card>
        </aside>
      </div>

      {/* Mobile booking bar */}
      {event.bookable && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">{formatDate(event.startAt, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
              <p className="font-bold text-slate-900">{priceLabel(event)}</p>
            </div>
            {event.seatingType === 'seated' ? (
              <Button to={`/events/${event.slug}/seats`} size="lg">Choose seats</Button>
            ) : (
              <Button size="lg" onClick={() => document.getElementById('tickets')?.scrollIntoView({ behavior: 'smooth' })}>
                Book tickets
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
