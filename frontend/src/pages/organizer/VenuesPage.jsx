import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Armchair, CalendarDays, ChevronRight, MapPin, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { orgKeys, venuesApi } from '../../api/organizer';
import VenueFormModal from '../../components/organizer/VenueFormModal';
import Button from '../../components/ui/Button';
import { Alert, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { Input } from '../../components/ui/Form';
import Pagination from '../../components/ui/Pagination';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';

export default function VenuesPage() {
  useDocumentTitle('Venues');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const params = { search: search.trim(), page, limit: 12 };
  const { data, isLoading, isError, error } = useQuery({ queryKey: orgKeys.venues(params), queryFn: () => venuesApi.list(params), placeholderData: keepPreviousData });

  return (
    <div>
      <PageHeader
        title="Venues & seat layouts"
        description="Save venues once and reuse them across events"
        action={<Button icon={Plus} onClick={() => setFormOpen(true)}>Add venue</Button>}
      />

      <label className="relative mb-5 block max-w-sm">
        <span className="sr-only">Search venues</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name or city"
          className="pl-9"
        />
      </label>

      {isError ? (
        <Alert tone="error">{getErrorMessage(error)}</Alert>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />)}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={search ? 'No venues match your search' : 'No venues yet'}
          description="Add the places where you host events. You can design seat maps for venues with reserved seating."
          action={!search && <Button icon={Plus} onClick={() => setFormOpen(true)}>Add venue</Button>}
          className="rounded-2xl bg-white ring-1 ring-slate-200"
        />
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((venue) => (
              <li key={venue.id}>
                <Link to={`/organizer/venues/${venue.id}`} className="group flex h-full flex-col rounded-2xl bg-white p-5 ring-1 ring-slate-200 transition hover:shadow-md hover:ring-brand-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{venue.name}</h3>
                      <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="line-clamp-2">
                          {venue.addressLine}, {venue.city}
                        </span>
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                  </div>
                  <div className="mt-auto flex gap-4 pt-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Armchair className="h-4 w-4" /> {venue.layoutCount} layout{venue.layoutCount === 1 ? '' : 's'}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-4 w-4" /> {venue.eventCount} event{venue.eventCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination className="mt-6" pagination={data.pagination} onChange={setPage} />
        </>
      )}

      <VenueFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
