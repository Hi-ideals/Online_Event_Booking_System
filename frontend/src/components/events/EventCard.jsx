import { CalendarDays, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { assetUrl } from '../../api/client';
import cn from '../../lib/cn';
import { formatCurrency, formatDate, formatTime } from '../../lib/format';
import { Badge } from '../ui/Feedback';
import categoryStyle from './categoryStyle';

/** Event image, or a category-coloured placeholder when the organizer has not uploaded a banner. */
export function EventBanner({ event, className, iconClassName = 'h-12 w-12' }) {
  const { icon: Icon, gradient } = categoryStyle(event.category?.slug);
  if (event.bannerUrl) {
    return <img src={assetUrl(event.bannerUrl)} alt="" className={cn('object-cover', className)} loading="lazy" />;
  }
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-gradient-to-br', gradient, className)} aria-hidden="true">
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
      <div className="absolute -bottom-10 -left-4 h-32 w-32 rounded-full bg-black/10" />
      <Icon className={cn('relative text-white/85 drop-shadow', iconClassName)} strokeWidth={1.5} />
    </div>
  );
}

export function availabilityBadge(event) {
  if (event.status === 'cancelled') return <Badge tone="red">Cancelled</Badge>;
  if (event.status === 'completed') return <Badge tone="gray">Ended</Badge>;
  if (event.status === 'sales_closed') return <Badge tone="gray">Sales closed</Badge>;
  if (event.totalTickets > 0 && event.ticketsAvailable <= 0) return <Badge tone="red">Sold out</Badge>;
  if (event.totalTickets > 0 && event.ticketsAvailable / event.totalTickets <= 0.15) return <Badge tone="amber">Filling fast</Badge>;
  return null;
}

export function priceLabel(event) {
  if (event.minPrice === null || event.minPrice === undefined) return 'Tickets soon';
  if (event.maxPrice === 0) return 'Free';
  return event.minPrice === event.maxPrice ? formatCurrency(event.minPrice) : `From ${formatCurrency(event.minPrice, { free: false })}`;
}

export default function EventCard({ event, className }) {
  const badge = availabilityBadge(event);
  return (
    <Link
      to={`/events/${event.slug}`}
      className={cn('group flex flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-200/60 transition hover:-translate-y-0.5 hover:shadow-lg', className)}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <EventBanner event={event} className="h-full w-full transition duration-300 group-hover:scale-105" />
        <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-2.5 py-1 text-center shadow-sm">
          <p className="text-[10px] font-semibold uppercase leading-none text-brand-600">{formatDate(event.startAt, { month: 'short' })}</p>
          <p className="text-lg font-bold leading-tight text-slate-900">{formatDate(event.startAt, { day: 'numeric' })}</p>
        </div>
        {badge && <div className="absolute right-3 top-3">{badge}</div>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-600">{event.category?.name}</p>
        <h3 className="mt-1 line-clamp-2 font-semibold leading-snug text-slate-900 group-hover:text-brand-700">{event.title}</h3>
        <div className="mt-2 space-y-1 text-sm text-slate-500">
          <p className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {formatDate(event.startAt, { weekday: 'short', day: 'numeric', month: 'short' })}, {formatTime(event.startAt)}
            </span>
          </p>
          <p className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {event.venue?.name}, {event.venue?.city}
            </span>
          </p>
        </div>
        <p className="mt-auto pt-3 font-semibold text-slate-900">{priceLabel(event)}</p>
      </div>
    </Link>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/60" aria-hidden="true">
      <div className="aspect-[16/9] animate-pulse bg-slate-200" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-2/5 animate-pulse rounded bg-slate-200" />
      </div>
    </div>
  );
}
