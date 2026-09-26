import { Armchair, Minus, Plus, Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import useStartBooking from '../../hooks/useStartBooking';
import cn from '../../lib/cn';
import { formatCurrency, formatDate } from '../../lib/format';
import Button from '../ui/Button';
import { Alert } from '../ui/Feedback';

const storageKey = (eventId) => `ticket-selection:${eventId}`;

function tierNote(tier) {
  const now = new Date();
  if (tier.saleStartAt && new Date(tier.saleStartAt) > now) return { text: `On sale from ${formatDate(tier.saleStartAt, { dateStyle: 'medium', timeStyle: 'short' })}`, tone: 'text-slate-500' };
  if (tier.saleEndAt && new Date(tier.saleEndAt) <= now) return { text: 'Sale ended', tone: 'text-slate-500' };
  if (tier.available <= 0) return { text: 'Sold out', tone: 'text-rose-600' };
  if (tier.available <= 20) return { text: `Only ${tier.available} left`, tone: 'text-amber-600' };
  if (tier.saleEndAt) return { text: `Sale ends ${formatDate(tier.saleEndAt)}`, tone: 'text-slate-500' };
  return null;
}

function Stepper({ value, max, onChange, label }) {
  const btn = 'flex h-8 w-8 items-center justify-center rounded-full ring-1 transition disabled:opacity-30';
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" className={cn(btn, 'text-slate-600 ring-slate-300 hover:bg-slate-100')} onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label={`Remove one ${label} ticket`}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-6 text-center font-semibold tabular-nums text-slate-900" aria-live="polite">
        {value}
      </span>
      <button type="button" className={cn(btn, 'text-brand-700 ring-brand-300 hover:bg-brand-50')} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Add one ${label} ticket`}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Ticket panel on the event page: tier quantities for general admission, or a link to the seat map. */
export default function TicketSelector({ event }) {
  const { start, isPending, canBook } = useStartBooking(event.slug);
  const [quantities, setQuantities] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey(event.id))) ?? {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(event.id), JSON.stringify(quantities));
    } catch {
      /* storage unavailable: selection just is not remembered */
    }
  }, [event.id, quantities]);

  if (!event.bookable) {
    const reason = {
      cancelled: ['error', 'This event has been cancelled', event.cancellationReason],
      completed: ['info', 'This event has ended', null],
      sales_closed: ['warning', 'Ticket sales are closed', 'The organizer has stopped selling tickets for this event.'],
    }[event.status] ?? ['warning', 'Tickets unavailable', new Date(event.startAt) <= new Date() ? 'This event has already started.' : 'All tickets are sold out or not on sale right now.'];
    return (
      <Alert tone={reason[0]} title={reason[1]}>
        {reason[2]}
      </Alert>
    );
  }

  if (event.seatingType === 'seated') {
    return (
      <div className="space-y-3">
        <ul className="divide-y divide-slate-100">
          {event.tiers.map((tier) => {
            const note = tierNote(tier);
            return (
              <li key={tier.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{tier.name}</p>
                  {note && <p className={cn('text-xs', note.tone)}>{note.text}</p>}
                </div>
                <p className="shrink-0 font-semibold text-slate-900">{formatCurrency(tier.price)}</p>
              </li>
            );
          })}
        </ul>
        <Button to={`/events/${event.slug}/seats`} size="lg" className="w-full" icon={Armchair}>
          Choose your seats
        </Button>
      </div>
    );
  }

  const totalSelected = Object.values(quantities).reduce((a, b) => a + b, 0);
  const total = event.tiers.reduce((sum, t) => sum + (quantities[t.id] ?? 0) * t.price, 0);

  const setQuantity = (tier, value) => setQuantities((q) => ({ ...q, [tier.id]: Math.max(0, value) }));

  const submit = () => {
    const items = event.tiers.filter((t) => quantities[t.id] > 0).map((t) => ({ tierId: t.id, quantity: quantities[t.id] }));
    start({ eventId: event.id, items }, {
      onBooked: () => {
        setQuantities({});
        try {
          sessionStorage.removeItem(storageKey(event.id));
        } catch {
          /* ignore */
        }
      },
    });
  };

  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {event.tiers.map((tier) => {
          const note = tierNote(tier);
          const current = quantities[tier.id] ?? 0;
          const selectable = tier.onSale && tier.available > 0;
          const max = Math.min(tier.available, tier.maxPerOrder ?? Infinity, event.maxTicketsPerOrder - (totalSelected - current));
          return (
            <li key={tier.id} className="flex items-start justify-between gap-3 py-4 first:pt-0">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{tier.name}</p>
                <p className="font-semibold text-slate-900">{formatCurrency(tier.price)}</p>
                {tier.description && <p className="mt-0.5 text-xs text-slate-500">{tier.description}</p>}
                {note && <p className={cn('mt-0.5 text-xs font-medium', note.tone)}>{note.text}</p>}
              </div>
              {selectable && <Stepper value={current} max={max} onChange={(v) => setQuantity(tier, v)} label={tier.name} />}
            </li>
          );
        })}
      </ul>

      <div className="mt-2 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {totalSelected} ticket{totalSelected === 1 ? '' : 's'}
          </span>
          <span className="text-lg font-bold text-slate-900">{formatCurrency(total, { free: false })}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">Max {event.maxTicketsPerOrder} tickets per booking</p>
        {!canBook && <Alert tone="warning" className="mt-3">Log in with an attendee account to book tickets.</Alert>}
        <Button size="lg" className="mt-4 w-full" icon={Ticket} disabled={totalSelected === 0 || !canBook} loading={isPending} onClick={submit}>
          {totalSelected === 0 ? 'Select tickets' : 'Continue to checkout'}
        </Button>
      </div>
    </div>
  );
}
