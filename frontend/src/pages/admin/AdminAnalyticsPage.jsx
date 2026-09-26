import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BadgeIndianRupee, IndianRupee, Percent, Ticket, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { adminApi, adminKeys } from '../../api/admin';
import ColumnChart from '../../components/charts/ColumnChart';
import { StatCard, Table } from '../../components/organizer/orgUi';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Alert, PageHeader } from '../../components/ui/Feedback';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import cn from '../../lib/cn';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate, formatNumber } from '../../lib/format';
import { dayLabel, defaultRange, RangePicker, rangeParams } from '../organizer/AnalyticsPage';

const money = (v) => formatCurrency(v, { free: false });
const compactInr = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(v);

export default function AdminAnalyticsPage() {
  useDocumentTitle('Platform analytics');
  const [range, setRange] = useState(defaultRange);
  const params = rangeParams(range);
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: adminKeys.analytics(params),
    queryFn: () => adminApi.analytics(params),
    placeholderData: keepPreviousData,
    enabled: Boolean(params.from && params.to && params.from <= params.to),
  });

  const series = data?.revenueOverTime ?? [];
  const label = (d) => ({ label: dayLabel(d.date, series.length), tooltipLabel: formatDate(`${d.date}T12:00:00+05:30`, { weekday: 'short', day: 'numeric', month: 'short' }) });
  const revenue = series.map((d) => ({ ...label(d), value: d.platformRevenue }));
  const gbv = series.map((d) => ({ ...label(d), value: d.grossBookingValue }));

  const eventColumns = [
    { key: 'title', label: 'Event', render: (e) => <span className="block min-w-48"><span className="font-medium text-slate-900">{e.title}</span><span className="block text-xs text-slate-500">{e.organizer} &middot; {formatDate(e.startAt)}</span></span> },
    { key: 'tickets', label: 'Tickets', align: 'right', render: (e) => formatNumber(e.ticketsSold) },
    { key: 'gbv', label: 'Booking value', align: 'right', render: (e) => money(e.grossBookingValue) },
  ];
  const categoryColumns = [
    { key: 'name', label: 'Category', render: (c) => <span className="block min-w-28 font-medium text-slate-900">{c.name}<span className="block text-xs font-normal text-slate-500">{c.events} event(s)</span></span> },
    { key: 'tickets', label: 'Tickets', align: 'right', render: (c) => formatNumber(c.ticketsSold) },
    { key: 'gbv', label: 'Value', align: 'right', render: (c) => money(c.grossBookingValue) },
  ];
  const attendanceColumns = [
    { key: 'title', label: 'Event', render: (e) => <span className="block min-w-40"><span className="font-medium text-slate-900">{e.title}</span><span className="block text-xs text-slate-500">{formatDate(e.startAt)}</span></span> },
    { key: 'tickets', label: 'Tickets', align: 'right', render: (e) => formatNumber(e.tickets) },
    { key: 'checkedIn', label: 'Checked in', align: 'right', render: (e) => formatNumber(e.checkedIn) },
    {
      key: 'rate',
      label: 'Attendance',
      align: 'right',
      render: (e) => (
        <span className="flex items-center justify-end gap-2">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-brand-100">
            <span className="block h-full rounded-full bg-brand-600" style={{ width: `${e.rate}%` }} />
          </span>
          <span className="w-10 tabular-nums">{e.rate}%</span>
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Platform analytics" description="Revenue, growth and attendance across the marketplace" action={<RangePicker range={range} setRange={setRange} />} />

      {isError ? (
        <Alert tone="error">{getErrorMessage(error)}</Alert>
      ) : isLoading || !data ? (
        <div className="h-96 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />
      ) : (
        <div className={cn('space-y-6 transition-opacity', isFetching && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Platform revenue" value={money(data.totals.platformRevenue)} hint={`Commission ${money(data.totals.commissionEarned)}`} icon={IndianRupee} tone="green" />
            <StatCard label="Booking value" value={money(data.totals.grossBookingValue)} hint={`${formatNumber(data.totals.bookings)} bookings`} icon={BadgeIndianRupee} tone="blue" />
            <StatCard label="Tickets sold" value={formatNumber(data.totals.ticketsSold)} hint={`Organizers earned ${money(data.totals.organizerEarnings)}`} icon={Ticket} />
            <StatCard label="Refund rate" value={`${data.totals.refundRate}%`} hint={`${money(data.totals.refundedAmount)} refunded`} icon={Percent} tone="rose" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader title="Platform revenue per day" description="Commission and convenience fees" />
              <CardBody>
                <ColumnChart data={revenue} title="Platform revenue per day" formatValue={compactInr} />
              </CardBody>
            </Card>
            <Card className="min-w-0">
              <CardHeader title="Booking value per day" description="What attendees paid in total" />
              <CardBody>
                <ColumnChart data={gbv} title="Booking value per day" formatValue={compactInr} />
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card className="min-w-0 overflow-hidden">
              <CardHeader title="Top events" action={<Link to="/admin/events" className="text-sm font-semibold text-brand-600 hover:text-brand-700">All events</Link>} />
              <Table columns={eventColumns} rows={data.topEvents} empty="No sales in this period." />
            </Card>
            <Card className="min-w-0 overflow-hidden">
              <CardHeader title="Popular categories" />
              <Table columns={categoryColumns} rows={data.topCategories.map((c) => ({ ...c, id: c.id }))} empty="No sales in this period." />
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              title={<span className="flex items-center gap-2"><UserCheck className="h-4 w-4 text-brand-600" />Attendance trend</span>}
              description={`Events that already happened in this period. Overall ${data.attendance.overallRate}% of sold tickets were scanned.`}
            />
            <Table columns={attendanceColumns} rows={data.attendance.events} empty="No completed events in this period." />
          </Card>
        </div>
      )}
    </div>
  );
}
