import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { IndianRupee, Percent, RotateCcw, Ticket, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { orgKeys, organizerApi } from '../../api/organizer';
import ColumnChart from '../../components/charts/ColumnChart';
import { EventStatusBadge, StatCard, Table } from '../../components/organizer/orgUi';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Alert, PageHeader } from '../../components/ui/Feedback';
import { Input } from '../../components/ui/Form';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import cn from '../../lib/cn';
import { addDays, todayIst } from '../../lib/dates';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate, formatNumber } from '../../lib/format';

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'custom', label: 'Custom' },
];

/** Compact rupee axis labels: ₹0, ₹500, ₹1.5K, ₹2L */
const compactInr = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(v);

export function RangePicker({ range, setRange }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRange((cur) => ({ ...cur, preset: r.value }))}
            aria-pressed={range.preset === r.value}
            className={cn('flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none', range.preset === r.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
          >
            {r.label}
          </button>
        ))}
      </div>
      {range.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="From" value={range.from} max={range.to} onChange={(e) => setRange((cur) => ({ ...cur, from: e.target.value }))} className="h-9" />
          <span className="text-slate-400">-</span>
          <Input type="date" aria-label="To" value={range.to} min={range.from} max={todayIst()} onChange={(e) => setRange((cur) => ({ ...cur, to: e.target.value }))} className="h-9" />
        </div>
      )}
    </div>
  );
}

export function rangeParams(range) {
  if (range.preset === 'custom') return { from: range.from, to: range.to };
  const to = todayIst();
  return { from: addDays(to, -(Number(range.preset) - 1)), to };
}

export const defaultRange = () => ({ preset: '30', from: addDays(todayIst(), -29), to: todayIst() });

/** Readable x labels: day numbers for short ranges, "12 Sep" style otherwise. */
export const dayLabel = (ymd, count) => formatDate(`${ymd}T12:00:00+05:30`, count <= 14 ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' });

export default function AnalyticsPage() {
  useDocumentTitle('Analytics');
  const [range, setRange] = useState(defaultRange);
  const params = rangeParams(range);
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: orgKeys.analytics(params),
    queryFn: () => organizerApi.analytics(params),
    placeholderData: keepPreviousData,
    enabled: Boolean(params.from && params.to && params.from <= params.to),
  });

  const series = data?.salesOverTime ?? [];
  const tickets = series.map((d) => ({ label: dayLabel(d.date, series.length), tooltipLabel: formatDate(`${d.date}T12:00:00+05:30`, { weekday: 'short', day: 'numeric', month: 'short' }), value: d.tickets }));
  const earnings = series.map((d) => ({ label: dayLabel(d.date, series.length), tooltipLabel: formatDate(`${d.date}T12:00:00+05:30`, { weekday: 'short', day: 'numeric', month: 'short' }), value: d.netEarnings }));

  const topColumns = [
    { key: 'title', label: 'Event', render: (e) => <Link to={`/organizer/events/${e.id}`} className="block min-w-44 font-medium text-slate-900 hover:text-brand-700">{e.title}<span className="block text-xs font-normal text-slate-500">{formatDate(e.startAt)}</span></Link> },
    { key: 'status', label: 'Status', render: (e) => <EventStatusBadge status={e.status} /> },
    { key: 'sold', label: 'Tickets', align: 'right', render: (e) => formatNumber(e.ticketsSold) },
    { key: 'earnings', label: 'Earnings', align: 'right', render: (e) => formatCurrency(e.netEarnings, { free: false }) },
    { key: 'checkedIn', label: 'Checked in', align: 'right', render: (e) => (e.ticketsSold ? `${formatNumber(e.checkedIn)} (${Math.round((e.checkedIn / e.ticketsSold) * 100)}%)` : '-') },
  ];

  return (
    <div>
      <PageHeader title="Analytics" description="Sales and attendance across your events" action={<RangePicker range={range} setRange={setRange} />} />

      {isError ? (
        <Alert tone="error">{getErrorMessage(error)}</Alert>
      ) : isLoading || !data ? (
        <div className="h-96 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />
      ) : (
        <div className={cn('space-y-6 transition-opacity', isFetching && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Tickets sold" value={formatNumber(data.totals.ticketsSold)} hint={`${formatNumber(data.totals.bookings)} bookings`} icon={Ticket} />
            <StatCard label="Net earnings" value={formatCurrency(data.totals.netEarnings, { free: false })} hint={`Gross ${formatCurrency(data.totals.grossSales, { free: false })}`} icon={IndianRupee} tone="green" />
            <StatCard label="Refunded" value={formatCurrency(data.totals.refunded, { free: false })} hint={`Commission ${formatCurrency(data.totals.platformCommission, { free: false })}`} icon={RotateCcw} tone="rose" />
            <StatCard label="Attendance rate" value={`${data.attendance.rate}%`} hint={`${formatNumber(data.attendance.checkedIn)} of ${formatNumber(data.attendance.tickets)} at past events`} icon={UserCheck} tone="blue" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader title="Tickets sold per day" description={`${formatDate(data.range.from)} - ${formatDate(data.range.to)}`} />
              <CardBody>
                <ColumnChart data={tickets} title="Tickets sold per day" formatValue={(v) => formatNumber(v)} />
              </CardBody>
            </Card>
            <Card className="min-w-0">
              <CardHeader title="Net earnings per day" description="After refunds and commission" />
              <CardBody>
                <ColumnChart data={earnings} title="Net earnings per day" formatValue={compactInr} />
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">
            <Card className="min-w-0 overflow-hidden">
              <CardHeader title="Top events" description="All time, by earnings" />
              <Table columns={topColumns} rows={data.topEvents} empty="No sales yet." />
            </Card>
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><Percent className="h-4 w-4 text-brand-600" />Events by status</span>} />
              <ul className="divide-y divide-slate-100 text-sm">
                {Object.entries(data.eventsByStatus).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between px-5 py-2.5">
                    <EventStatusBadge status={status} />
                    <span className="tabular-nums text-slate-900">{formatNumber(count)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
