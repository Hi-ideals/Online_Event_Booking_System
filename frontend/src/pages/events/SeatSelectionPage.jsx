import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Armchair, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, Navigate, useParams } from 'react-router';
import { eventKeys, eventsApi } from '../../api/events';
import Button from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { PageLoader } from '../../components/ui/Spinner';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useStartBooking from '../../hooks/useStartBooking';
import cn from '../../lib/cn';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate, formatTime } from '../../lib/format';

// One colour per ticket tier, in tier order.
const TIER_COLORS = [
  { seat: 'bg-violet-100 ring-violet-400 text-violet-800 hover:bg-violet-200', dot: 'bg-violet-400' },
  { seat: 'bg-sky-100 ring-sky-400 text-sky-800 hover:bg-sky-200', dot: 'bg-sky-400' },
  { seat: 'bg-emerald-100 ring-emerald-400 text-emerald-800 hover:bg-emerald-200', dot: 'bg-emerald-400' },
  { seat: 'bg-amber-100 ring-amber-400 text-amber-800 hover:bg-amber-200', dot: 'bg-amber-400' },
  { seat: 'bg-rose-100 ring-rose-400 text-rose-800 hover:bg-rose-200', dot: 'bg-rose-400' },
  { seat: 'bg-teal-100 ring-teal-400 text-teal-800 hover:bg-teal-200', dot: 'bg-teal-400' },
];

function Seat({ seat, color, selected, onToggle, sectionName, rowLabel }) {
  if (seat.status === 'gap') return <span className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" aria-hidden="true" />;
  const unavailable = seat.status !== 'available' && !selected;
  return (
    <button
      type="button"
      onClick={() => onToggle(seat)}
      disabled={unavailable}
      aria-pressed={selected}
      aria-label={`${sectionName} row ${rowLabel} seat ${seat.number}${unavailable ? ', unavailable' : ''}`}
      title={`${rowLabel}${seat.number}`}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-t-lg rounded-b-sm text-[10px] font-semibold ring-1 ring-inset transition sm:h-8 sm:w-8 sm:text-xs',
        selected && 'bg-brand-600 text-white ring-brand-700 hover:bg-brand-700',
        !selected && unavailable && 'cursor-not-allowed bg-slate-200 text-slate-400 ring-slate-200',
        !selected && !unavailable && color.seat
      )}
    >
      {seat.number}
    </button>
  );
}

export default function SeatSelectionPage() {
  const { slug } = useParams();
  const event = useQuery({ queryKey: eventKeys.detail(slug), queryFn: () => eventsApi.get(slug) });
  // Refresh seat availability regularly while the attendee is choosing.
  const seatMap = useQuery({ queryKey: eventKeys.seatMap(slug), queryFn: () => eventsApi.seatMap(slug), refetchInterval: 20000, enabled: event.data?.seatingType === 'seated' });
  const { start, isPending, canBook } = useStartBooking(slug);
  const [selected, setSelected] = useState(new Map()); // seatId -> { label, tierId }
  const mapRef = useRef(null);
  useDocumentTitle(event.data ? `Seats - ${event.data.title}` : 'Choose seats');

  const tiers = useMemo(() => {
    const list = seatMap.data?.tiers ?? [];
    return new Map(list.map((t, i) => [t.id, { ...t, color: TIER_COLORS[i % TIER_COLORS.length] }]));
  }, [seatMap.data]);

  // On narrow screens, start with the middle of the seat map (the stage centre) in view.
  const hasMap = Boolean(seatMap.data);
  useEffect(() => {
    const el = mapRef.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [hasMap]);

  // Drop selections that someone else booked in the meantime.
  useEffect(() => {
    if (!seatMap.data) return;
    const available = new Set(seatMap.data.sections.flatMap((s) => s.rows.flatMap((r) => r.seats.filter((x) => x.status === 'available').map((x) => x.id))));
    setSelected((current) => {
      const lost = [...current.keys()].filter((id) => !available.has(id));
      if (!lost.length) return current;
      toast.error(`${lost.length} selected seat${lost.length > 1 ? 's were' : ' was'} just taken by someone else`);
      const next = new Map(current);
      lost.forEach((id) => next.delete(id));
      return next;
    });
  }, [seatMap.data]);

  if (event.isLoading || seatMap.isLoading) return <PageLoader label="Loading seat map..." />;
  if (event.isError) return <div className="container-page py-10"><Alert tone="error">{getErrorMessage(event.error)}</Alert></div>;
  if (event.data.seatingType !== 'seated') return <Navigate to={`/events/${slug}`} replace />;
  if (seatMap.isError) return <div className="container-page py-10"><Alert tone="error">{getErrorMessage(seatMap.error)}</Alert></div>;

  const ev = event.data;
  const maxSeats = ev.maxTicketsPerOrder;
  const selectedList = [...selected.entries()];
  const total = selectedList.reduce((sum, [, s]) => sum + (tiers.get(s.tierId)?.price ?? 0), 0);

  const toggle = (seat, tierId) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(seat.id)) {
        next.delete(seat.id);
        return next;
      }
      if (next.size >= maxSeats) {
        toast.error(`You can select up to ${maxSeats} seats per booking`);
        return current;
      }
      next.set(seat.id, { label: seat.label, tierId });
      return next;
    });
  };

  return (
    <div className="pb-40">
      <div className="border-b border-slate-200 bg-white">
        <div className="container-page flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link to={`/events/${slug}`} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
              <ArrowLeft className="h-4 w-4" /> Back to event
            </Link>
            <h1 className="mt-1 truncate text-xl font-bold text-slate-900 sm:text-2xl">{ev.title}</h1>
            <p className="text-sm text-slate-500">
              {formatDate(ev.startAt, { weekday: 'short', day: 'numeric', month: 'short' })}, {formatTime(ev.startAt)} &middot; {ev.venue.name}
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {[...tiers.values()].map((t) => (
              <li key={t.id} className="flex items-center gap-1.5">
                <span className={cn('h-3 w-3 rounded-sm', t.color.dot)} />
                <span className="text-slate-700">{t.name}</span>
                <span className="font-semibold text-slate-900">{formatCurrency(t.price)}</span>
              </li>
            ))}
            <li className="flex items-center gap-1.5 text-slate-500">
              <span className="h-3 w-3 rounded-sm bg-brand-600" /> Selected
            </li>
            <li className="flex items-center gap-1.5 text-slate-500">
              <span className="h-3 w-3 rounded-sm bg-slate-200" /> Unavailable
            </li>
          </ul>
        </div>
      </div>

      {!ev.bookable && (
        <div className="container-page mt-6">
          <Alert tone="warning" title="Tickets are not on sale">This seat map is view-only right now.</Alert>
        </div>
      )}

      <div className="container-page mt-6">
        <div ref={mapRef} className="overflow-x-auto rounded-2xl bg-white py-6 ring-1 ring-slate-200">
          <div className="mx-auto w-max min-w-full px-4 sm:px-8">
            <div className="mx-auto mb-8 w-3/4 max-w-lg rounded-b-[50%] bg-gradient-to-b from-slate-300 to-slate-100 py-2 text-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Stage
            </div>
            <div className="space-y-8">
              {seatMap.data.sections.map((section) => {
                const tier = tiers.get(section.tierId);
                return (
                  <section key={section.key} aria-label={section.name}>
                    <p className="mb-3 text-center text-sm font-semibold text-slate-700">
                      {section.name}
                      {tier && <span className="ml-2 font-normal text-slate-500">{formatCurrency(tier.price)}</span>}
                    </p>
                    <div className="space-y-1.5">
                      {section.rows.map((row) => (
                        <div key={row.label} className="flex items-center justify-center gap-1.5">
                          <span className="w-5 shrink-0 text-center text-xs font-medium text-slate-400">{row.label}</span>
                          <div className="flex gap-1 sm:gap-1.5">
                            {row.seats.map((seat) => (
                              <Seat
                                key={seat.id ?? `${row.label}-${seat.number}`}
                                seat={ev.bookable ? seat : { ...seat, status: seat.status === 'gap' ? 'gap' : 'unavailable' }}
                                color={tier?.color ?? TIER_COLORS[0]}
                                selected={selected.has(seat.id)}
                                onToggle={(s) => toggle(s, section.tierId)}
                                sectionName={section.name}
                                rowLabel={row.label}
                              />
                            ))}
                          </div>
                          <span className="w-5 shrink-0 text-center text-xs font-medium text-slate-400">{row.label}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400 sm:hidden">Swipe sideways to see the full seat map</p>
      </div>

      {/* Selection summary */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="container-page py-3">
          {selectedList.length > 0 && (
            <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {selectedList.map(([id, s]) => (
                <button
                  key={id}
                  onClick={() => toggle({ id }, s.tierId)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200"
                  aria-label={`Remove ${s.label}`}
                >
                  {s.label.split(' - ').pop()}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">
                {selectedList.length} of {maxSeats} seats
              </p>
              <p className="text-lg font-bold text-slate-900">{formatCurrency(total, { free: false })}</p>
            </div>
            <Button
              size="lg"
              icon={Armchair}
              disabled={!selectedList.length || !ev.bookable || !canBook}
              loading={isPending}
              onClick={() => start({ eventId: ev.id, seatIds: selectedList.map(([id]) => id) })}
            >
              {canBook ? 'Continue' : 'Attendees only'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
