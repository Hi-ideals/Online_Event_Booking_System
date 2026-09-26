import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, MapPin, QrCode, Search, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { eventKeys, eventsApi } from '../api/events';
import categoryStyle from '../components/events/categoryStyle';
import EventCard, { EventCardSkeleton } from '../components/events/EventCard';
import Button from '../components/ui/Button';
import useDocumentTitle from '../hooks/useDocumentTitle';
import cn from '../lib/cn';
import { addDays, todayIst } from '../lib/dates';

function Section({ title, subtitle, icon: Icon, to, children, className }) {
  return (
    <section className={cn('container-page py-10 sm:py-14', className)}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {Icon && <Icon className="h-5 w-5 text-brand-600" />}
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {to && (
          <Link to={to} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
            See all <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Horizontal scroll on phones, grid on larger screens. */
function EventRail({ query, emptyText = 'No events yet. Check back soon!' }) {
  if (query.isLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <EventCardSkeleton key={i} />)}
      </div>
    );
  }
  const items = query.data?.items ?? [];
  if (!items.length) return <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">{emptyText}</p>;
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {items.map((event) => (
        <EventCard key={event.id} event={event} className="w-[78%] shrink-0 snap-start sm:w-auto" />
      ))}
    </div>
  );
}

function Hero({ cities }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (city) params.set('city', city);
    navigate(`/events${params.size ? `?${params}` : ''}`);
  };

  return (
    <section className="relative overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full bg-brand-600/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-[24rem] w-[24rem] rounded-full bg-fuchsia-600/30 blur-3xl" />
      <div className="container-page relative py-16 sm:py-24">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-100 ring-1 ring-white/15">
          <Sparkles className="h-3.5 w-3.5" /> Concerts &middot; Comedy &middot; Workshops &middot; Sports
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-6xl">Find your next unforgettable night out.</h1>
        <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">Discover events near you, pick your seats and walk in with a QR ticket on your phone.</p>

        <form onSubmit={submit} className="mt-8 flex max-w-3xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl sm:flex-row sm:items-center">
          <label className="flex flex-1 items-center gap-2 px-3">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <span className="sr-only">Search events</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search events, artists, venues"
              className="h-11 w-full bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 border-t border-slate-100 px-3 sm:w-48 sm:border-l sm:border-t-0">
            <MapPin className="h-5 w-5 shrink-0 text-slate-400" />
            <span className="sr-only">City</span>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="h-11 w-full bg-transparent text-slate-700 focus:outline-none">
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="lg" className="sm:px-8">
            Search
          </Button>
        </form>
      </div>
    </section>
  );
}

const PERKS = [
  { icon: BadgeCheck, title: 'Verified organizers', text: 'Every organizer is reviewed before selling tickets.' },
  { icon: QrCode, title: 'Instant QR tickets', text: 'Tickets arrive by email and live in your account.' },
  { icon: ShieldCheck, title: 'Secure checkout', text: 'Safe payments with clear refund policies.' },
];

export default function HomePage() {
  useDocumentTitle();
  const today = todayIst();

  const cities = useQuery({ queryKey: eventKeys.cities, queryFn: eventsApi.cities });
  const categories = useQuery({ queryKey: eventKeys.categories, queryFn: eventsApi.categories });
  const featuredParams = { featured: true, limit: 4 };
  const featured = useQuery({ queryKey: eventKeys.search(featuredParams), queryFn: () => eventsApi.search(featuredParams) });
  const weekParams = { dateFrom: today, dateTo: addDays(today, 6), limit: 4 };
  const thisWeek = useQuery({ queryKey: eventKeys.search(weekParams), queryFn: () => eventsApi.search(weekParams) });
  const trendingParams = { sort: 'popular', limit: 4 };
  const trending = useQuery({ queryKey: eventKeys.search(trendingParams), queryFn: () => eventsApi.search(trendingParams) });

  return (
    <>
      <Hero cities={cities.data ?? []} />

      {categories.data?.length > 0 && (
        <section className="container-page pt-10 sm:pt-14">
          <h2 className="sr-only">Browse by category</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
            {categories.data.map((category) => {
              const { icon: Icon, gradient } = categoryStyle(category.slug);
              return (
                <Link
                  key={category.id}
                  to={`/events?category=${category.slug}`}
                  className="group flex w-28 shrink-0 flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md sm:w-auto"
                >
                  <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white', gradient)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium text-slate-800">{category.name}</span>
                  <span className="text-xs text-slate-400">
                    {category.upcomingEvents} event{category.upcomingEvents === 1 ? '' : 's'}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <Section title="Featured events" subtitle="Handpicked experiences you should not miss" icon={Sparkles} to="/events?featured=true">
        <EventRail query={featured} />
      </Section>

      <Section title="Happening this week" subtitle="Plans for the next 7 days" to={`/events?date=week`} className="pt-0 sm:pt-0">
        <EventRail query={thisWeek} emptyText="Nothing scheduled this week. Explore upcoming events instead." />
      </Section>

      <Section title="Trending now" subtitle="What everyone is booking" icon={TrendingUp} to="/events?sort=popular" className="pt-0 sm:pt-0">
        <EventRail query={trending} />
      </Section>

      {cities.data?.length > 0 && (
        <Section title="Explore by city" className="pt-0 sm:pt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cities.data.map((c) => (
              <Link
                key={c.city}
                to={`/events?city=${encodeURIComponent(c.city)}`}
                className="flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200 transition hover:ring-brand-300"
              >
                <span className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
                  <MapPin className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="truncate">{c.city}</span>
                </span>
                <span className="text-xs text-slate-400">{c.eventCount}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <section className="container-page pb-14">
        <div className="grid gap-4 sm:grid-cols-3">
          {PERKS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <Icon className="h-6 w-6 shrink-0 text-brand-600" />
              <div>
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="mt-0.5 text-sm text-slate-500">{text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-10 overflow-hidden rounded-3xl bg-brand-700 px-6 py-10 sm:px-12 sm:py-14">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-fuchsia-500/30 blur-3xl" />
          <div className="relative flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Hosting an event?</h2>
              <p className="mt-2 max-w-xl text-brand-100">Sell tickets, design seat maps, scan QR codes at the gate and get paid. Free to start.</p>
            </div>
            <Button to="/register?role=organizer" size="lg" variant="secondary" className="bg-white text-brand-700 ring-0 hover:bg-brand-50">
              Start selling <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
