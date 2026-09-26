import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarSearch, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { eventKeys, eventsApi } from '../../api/events';
import EventCard, { EventCardSkeleton } from '../../components/events/EventCard';
import Button from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { Field, Input, Select } from '../../components/ui/Form';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import cn from '../../lib/cn';
import { DATE_PRESETS } from '../../lib/dates';
import { getErrorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';

const SORTS = [
  { value: 'date', label: 'Date: soonest first' },
  { value: 'popular', label: 'Most popular' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newly added' },
];

const PRICE_RANGES = [
  { value: 'free', label: 'Free', min: undefined, max: 0 },
  { value: 'under500', label: 'Under ₹500', min: undefined, max: 500 },
  { value: '500-2000', label: '₹500 - ₹2,000', min: 500, max: 2000 },
  { value: 'over2000', label: 'Above ₹2,000', min: 2000, max: undefined },
];

const FILTER_KEYS = ['q', 'category', 'city', 'date', 'dateFrom', 'dateTo', 'price', 'featured', 'sort', 'page'];

/** Converts URL params into API query params. */
function toApiParams(params) {
  const api = {
    q: params.get('q') || undefined,
    category: params.get('category') || undefined,
    city: params.get('city') || undefined,
    featured: params.get('featured') === 'true' ? true : undefined,
    sort: params.get('sort') || (params.get('q') ? 'relevance' : 'date'),
    page: Number(params.get('page')) || 1,
    limit: 12,
  };
  const preset = DATE_PRESETS.find((p) => p.value === params.get('date'));
  if (preset) [api.dateFrom, api.dateTo] = preset.range();
  else if (params.get('date') === 'custom') {
    api.dateFrom = params.get('dateFrom') || undefined;
    api.dateTo = params.get('dateTo') || undefined;
  }
  const price = PRICE_RANGES.find((p) => p.value === params.get('price'));
  if (price) {
    api.minPrice = price.min;
    api.maxPrice = price.max;
  }
  return api;
}

function Filters({ params, update, categories, cities }) {
  const date = params.get('date') ?? '';
  return (
    <div className="space-y-5">
      <Field label="Category">
        {({ id }) => (
          <Select id={id} value={params.get('category') ?? ''} onChange={(e) => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="City">
        {({ id }) => (
          <Select id={id} value={params.get('city') ?? ''} onChange={(e) => update({ city: e.target.value })}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.city} value={c.city}>
                {c.city} ({c.eventCount})
              </option>
            ))}
          </Select>
        )}
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Date</legend>
        <div className="flex flex-wrap gap-2">
          {[...DATE_PRESETS, { value: 'custom', label: 'Pick dates' }].map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => update({ date: date === p.value ? '' : p.value, dateFrom: '', dateTo: '' })}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm ring-1 transition',
                date === p.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400'
              )}
              aria-pressed={date === p.value}
            >
              {p.label}
            </button>
          ))}
        </div>
        {date === 'custom' && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="From">
              {({ id }) => <Input id={id} type="date" value={params.get('dateFrom') ?? ''} onChange={(e) => update({ dateFrom: e.target.value })} />}
            </Field>
            <Field label="To">
              {({ id }) => <Input id={id} type="date" min={params.get('dateFrom') ?? undefined} value={params.get('dateTo') ?? ''} onChange={(e) => update({ dateTo: e.target.value })} />}
            </Field>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Price</legend>
        <div className="flex flex-wrap gap-2">
          {PRICE_RANGES.map((p) => {
            const active = params.get('price') === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => update({ price: active ? '' : p.value })}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm ring-1 transition',
                  active ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400'
                )}
                aria-pressed={active}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-100/70 px-3 py-2.5">
        <span className="text-sm font-medium text-slate-700">Featured only</span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand-600"
          checked={params.get('featured') === 'true'}
          onChange={(e) => update({ featured: e.target.checked ? 'true' : '' })}
        />
      </label>
    </div>
  );
}

export default function EventsPage() {
  useDocumentTitle('Explore events');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  /** Updates URL params; any filter change resets to page 1. */
  const update = (changes, { keepPage = false } = {}) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    if (!keepPage) next.delete('page');
    setParams(next, { replace: !('page' in changes) });
  };

  // Keep the box in sync when the URL changes (back button, links).
  useEffect(() => {
    const q = params.get('q') ?? '';
    setSearch((current) => (current.trim() === q ? current : q));
  }, [params]);

  // Search as the user types, after a short pause.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (search.trim() === current) return undefined;
    const timer = setTimeout(() => update({ q: search.trim() }), 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const apiParams = useMemo(() => toApiParams(params), [params]);
  const results = useQuery({ queryKey: eventKeys.search(apiParams), queryFn: () => eventsApi.search(apiParams), placeholderData: keepPreviousData });
  const categories = useQuery({ queryKey: eventKeys.categories, queryFn: eventsApi.categories });
  const cities = useQuery({ queryKey: eventKeys.cities, queryFn: eventsApi.cities });

  const categoryName = categories.data?.find((c) => c.slug === params.get('category'))?.name;
  const chips = [
    params.get('q') && { key: 'q', label: `"${params.get('q')}"` },
    categoryName && { key: 'category', label: categoryName },
    params.get('city') && { key: 'city', label: params.get('city') },
    params.get('date') && {
      key: 'date',
      label: DATE_PRESETS.find((p) => p.value === params.get('date'))?.label
        ?? `${params.get('dateFrom') ? formatDate(params.get('dateFrom')) : 'Any'} - ${params.get('dateTo') ? formatDate(params.get('dateTo')) : 'Any'}`,
    },
    params.get('price') && { key: 'price', label: PRICE_RANGES.find((p) => p.value === params.get('price'))?.label },
    params.get('featured') && { key: 'featured', label: 'Featured' },
  ].filter(Boolean);
  const activeFilterCount = chips.filter((c) => c.key !== 'q').length;

  const clearAll = () => {
    setSearch('');
    setParams(new URLSearchParams(params.get('sort') ? { sort: params.get('sort') } : {}));
  };

  const removeChip = (key) => {
    if (key === 'q') setSearch('');
    update(key === 'date' ? { date: '', dateFrom: '', dateTo: '' } : { [key]: '' });
  };

  const filterProps = { params, update, categories: categories.data ?? [], cities: cities.data ?? [] };
  const data = results.data;
  const hasFilters = chips.length > 0 || FILTER_KEYS.some((k) => k !== 'sort' && k !== 'page' && params.get(k));

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Explore events</h1>
        <p className="mt-1 text-sm text-slate-500 sm:text-base">Concerts, comedy, workshops and more across India</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search events</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by event, artist or venue"
            className="h-11 pl-10"
            type="search"
          />
        </label>
        <div className="flex gap-2">
          <Button variant="secondary" className="h-11 flex-1 lg:hidden" icon={SlidersHorizontal} onClick={() => setFiltersOpen(true)}>
            Filters{activeFilterCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{activeFilterCount}</span>}
          </Button>
          <Select aria-label="Sort by" value={params.get('sort') ?? (params.get('q') ? 'relevance' : 'date')} onChange={(e) => update({ sort: e.target.value })} className="h-11 flex-1 sm:w-56">
            {params.get('q') && <option value="relevance">Best match</option>}
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => removeChip(chip.key)}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-2 text-sm text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100"
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label}
              <X className="h-3.5 w-3.5" />
            </button>
          ))}
          <button onClick={clearAll} className="text-sm font-medium text-slate-500 hover:text-slate-800">
            Clear all
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <p className="mb-4 font-semibold text-slate-900">Filters</p>
            <Filters {...filterProps} />
          </div>
        </aside>

        <div className={cn('min-w-0 transition-opacity', results.isFetching && !results.isLoading && 'opacity-60')}>
          {results.isError ? (
            <Alert tone="error" title="Could not load events">
              {getErrorMessage(results.error)}
            </Alert>
          ) : results.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => <EventCardSkeleton key={i} />)}
            </div>
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={CalendarSearch}
              title="No events match your search"
              description="Try a different date, city or category."
              action={hasFilters && <Button variant="secondary" onClick={clearAll}>Clear filters</Button>}
              className="rounded-2xl bg-white ring-1 ring-slate-200"
            />
          ) : (
            <>
              <p className="mb-4 text-sm text-slate-500">
                {data.pagination.total} event{data.pagination.total === 1 ? '' : 's'} found
              </p>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {data.items.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
              <Pagination
                className="mt-8"
                pagination={data.pagination}
                onChange={(page) => {
                  update({ page: page > 1 ? String(page) : '' }, { keepPage: true });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          )}
        </div>
      </div>

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <>
            <Button variant="secondary" onClick={clearAll}>
              Clear all
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Show {data?.pagination.total ?? ''} results</Button>
          </>
        }
      >
        <Filters {...filterProps} />
      </Modal>
    </div>
  );
}
