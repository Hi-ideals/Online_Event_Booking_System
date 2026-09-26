import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Eye, ShieldOff, Sparkles, Star } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router';
import { adminApi, adminKeys } from '../../api/admin';
import { FilterSelect, ListCard, SearchBox } from '../../components/admin/AdminList';
import { EventBanner } from '../../components/events/EventCard';
import { EVENT_STATUS_OPTIONS, EventStatusBadge, StatCard } from '../../components/organizer/orgUi';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Alert, PageHeader } from '../../components/ui/Feedback';
import Modal from '../../components/ui/Modal';
import useDebounced from '../../hooks/useDebounced';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate, formatNumber, formatTime } from '../../lib/format';

const money = (v) => formatCurrency(v, { free: false });

function SalesModal({ event, onClose }) {
  const { data, isLoading, isError, error } = useQuery({ queryKey: adminKeys.eventSales(event?.id), queryFn: () => adminApi.eventSales(event.id), enabled: Boolean(event) });
  return (
    <Modal open={Boolean(event)} onClose={onClose} title="Event sales" description={event?.title} size="lg">
      {isError ? (
        <Alert tone="error">{getErrorMessage(error)}</Alert>
      ) : isLoading || !data ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Tickets sold" value={formatNumber(data.ticketsSold)} hint={`${data.confirmedBookings} bookings`} />
            <StatCard label="Gross sales" value={money(data.grossTicketSales)} tone="blue" />
            <StatCard label="Refunded" value={money(data.refunded)} hint={`${data.cancelledBookings} cancelled`} tone="rose" />
            <StatCard label="Platform commission" value={money(data.platformCommission)} tone="green" />
          </div>
          <dl className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 text-sm">
            {[
              ['Net ticket sales', money(data.netTicketSales)],
              ['Convenience fees (platform)', money(data.convenienceFees)],
              ['Organizer earnings', money(data.organizerEarnings)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between px-4 py-2.5">
                <dt className="text-slate-600">{label}</dt>
                <dd className="tabular-nums text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Ticket type</th>
                  <th className="px-4 py-2 text-right">Sold</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.byTier.map((t) => (
                  <tr key={t.tierId}>
                    <td className="px-4 py-2 text-slate-700">{t.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(t.sold)} / {formatNumber(t.quantity)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(t.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminEventsPage() {
  useDocumentTitle('All events');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null); // { type: 'block' | 'unblock' | 'feature' | 'unfeature', event }
  const [salesFor, setSalesFor] = useState(null);
  const q = useDebounced(search);
  const status = params.get('status') ?? '';
  const flag = params.get('flag') ?? '';

  const query = {
    status,
    search: q.trim(),
    page,
    limit: 20,
    ...(flag === 'blocked' && { blocked: true }),
    ...(flag === 'featured' && { featured: true }),
  };
  const list = useQuery({ queryKey: adminKeys.events(query), queryFn: () => adminApi.events(query), placeholderData: keepPreviousData });

  const action = useMutation({
    mutationFn: ({ type, event, reason }) => {
      if (type === 'block') return adminApi.blockEvent(event.id, reason);
      if (type === 'unblock') return adminApi.unblockEvent(event.id);
      return adminApi.featureEvent(event.id, type === 'feature');
    },
    onSuccess: (_e, { type }) => {
      toast.success({ block: 'Event blocked and hidden from attendees', unblock: 'Event unblocked', feature: 'Event featured on the homepage', unfeature: 'Event removed from featured' }[type]);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setDialog(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setDialog(null);
    },
  });

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
    setPage(1);
  };

  const columns = [
    {
      key: 'event',
      label: 'Event',
      render: (e) => (
        <div className="flex min-w-64 items-center gap-3">
          <EventBanner event={e} className="h-10 w-14 shrink-0 rounded-lg" iconClassName="h-4 w-4" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-900">
              {e.isFeatured && <Star className="mr-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
              {e.title}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {e.organizer.name} &middot; {e.venue.city}
            </span>
          </span>
        </div>
      ),
    },
    { key: 'date', label: 'Date', render: (e) => <span className="whitespace-nowrap">{formatDate(e.startAt)}<span className="block text-xs text-slate-500">{formatTime(e.startAt)}</span></span> },
    { key: 'status', label: 'Status', render: (e) => <EventStatusBadge status={e.status} blocked={e.isBlocked} /> },
    { key: 'sold', label: 'Sold', align: 'right', render: (e) => `${formatNumber(e.ticketsSold)} / ${formatNumber(e.totalTickets)}` },
    {
      key: 'actions',
      label: '',
      render: (e) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={Eye} onClick={() => setSalesFor(e)} aria-label="View sales" />
          {e.status !== 'draft' && (
            <a href={`/events/${e.slug}`} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Open public page">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {!e.isBlocked && e.status === 'published' && (
            <Button
              size="sm"
              variant="ghost"
              className={e.isFeatured ? 'text-amber-600' : 'text-slate-400'}
              icon={Sparkles}
              onClick={() => action.mutate({ type: e.isFeatured ? 'unfeature' : 'feature', event: e })}
              aria-label={e.isFeatured ? 'Remove from featured' : 'Feature event'}
            />
          )}
          {e.isBlocked ? (
            <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'unblock', event: e })}>
              Unblock
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="text-rose-600" icon={ShieldOff} onClick={() => setDialog({ type: 'block', event: e })} aria-label="Block event" />
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="All events" description="Every event on the platform, across organizers" />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by title" />
        <FilterSelect label="Status" value={status} onChange={(v) => setParam('status', v)} allLabel="All statuses" options={EVENT_STATUS_OPTIONS} />
        <FilterSelect label="Flag" value={flag} onChange={(v) => setParam('flag', v)} allLabel="All events" options={[{ value: 'featured', label: 'Featured only' }, { value: 'blocked', label: 'Blocked only' }]} />
      </div>

      <ListCard query={{ ...list, onPageChange: setPage }} columns={columns} empty="No events found." />

      <ConfirmDialog
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => action.mutate({ ...dialog, reason })}
        loading={action.isPending}
        title={dialog?.type === 'block' ? 'Block this event?' : 'Unblock this event?'}
        confirmLabel={dialog?.type === 'block' ? 'Block event' : 'Unblock'}
        tone={dialog?.type === 'block' ? 'danger' : 'primary'}
        reasonLabel={dialog?.type === 'block' ? 'Reason (shown to the organizer)' : undefined}
        reasonMinLength={dialog?.type === 'block' ? 5 : 0}
      >
        <p className="font-medium text-slate-900">{dialog?.event?.title}</p>
        <p>
          {dialog?.type === 'block'
            ? 'The event is hidden from attendees immediately and cannot be published. Existing bookings are not cancelled or refunded automatically.'
            : 'The event becomes visible to attendees again.'}
        </p>
      </ConfirmDialog>

      <SalesModal event={salesFor} onClose={() => setSalesFor(null)} />
    </div>
  );
}
