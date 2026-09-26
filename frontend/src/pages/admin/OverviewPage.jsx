import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeIndianRupee, ClipboardList, IndianRupee, MessageSquareWarning, Percent, Ticket, UserCheck, Users } from 'lucide-react';
import { Link } from 'react-router';
import { adminApi, adminKeys } from '../../api/admin';
import ColumnChart from '../../components/charts/ColumnChart';
import { EventStatusBadge, StatCard, Table } from '../../components/organizer/orgUi';
import Button from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Alert, PageHeader } from '../../components/ui/Feedback';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate, formatNumber } from '../../lib/format';
import { dayLabel } from '../organizer/AnalyticsPage';

const money = (v) => formatCurrency(v, { free: false });
const compactInr = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(v);

const ACTIONS = [
  { key: 'organizerApprovals', label: 'Organizers awaiting approval', to: '/admin/organizers?status=pending_approval', icon: ClipboardList },
  { key: 'refundRequests', label: 'Open refund requests', to: '/admin/refund-requests', icon: MessageSquareWarning },
  { key: 'payouts', label: 'Payouts to transfer', to: '/admin/payouts?status=pending', icon: BadgeIndianRupee },
  { key: 'failedRefunds', label: 'Failed refunds', to: '/admin/payments?tab=refunds&status=failed', icon: AlertTriangle },
];

export default function OverviewPage() {
  useDocumentTitle('Admin overview');
  const { data, isLoading, isError, error } = useQuery({ queryKey: adminKeys.analytics({}), queryFn: () => adminApi.analytics() });

  if (isError) return <Alert tone="error">{getErrorMessage(error)}</Alert>;
  if (isLoading) return <div className="h-96 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />;

  const { totals, pendingActions, users, revenueOverTime } = data;
  const series = revenueOverTime.map((d) => ({
    label: dayLabel(d.date, revenueOverTime.length),
    tooltipLabel: formatDate(`${d.date}T12:00:00+05:30`, { weekday: 'short', day: 'numeric', month: 'short' }),
    value: d.platformRevenue,
  }));
  const openActions = ACTIONS.filter((a) => pendingActions[a.key] > 0);

  const eventColumns = [
    { key: 'title', label: 'Event', render: (e) => <span className="block min-w-44"><span className="font-medium text-slate-900">{e.title}</span><span className="block text-xs text-slate-500">{e.organizer} &middot; {formatDate(e.startAt)}</span></span> },
    { key: 'ticketsSold', label: 'Tickets', align: 'right', render: (e) => formatNumber(e.ticketsSold) },
    { key: 'gbv', label: 'Sales', align: 'right', render: (e) => money(e.grossBookingValue) },
  ];
  const organizerColumns = [
    { key: 'name', label: 'Organizer', render: (o) => <span className="block min-w-36 font-medium text-slate-900">{o.name}<span className="block text-xs font-normal text-slate-500">{o.events} event(s)</span></span> },
    { key: 'gbv', label: 'Sales', align: 'right', render: (o) => money(o.grossBookingValue) },
    { key: 'commission', label: 'Commission', align: 'right', render: (o) => money(o.commissionEarned) },
  ];

  return (
    <div>
      <PageHeader
        title="Platform overview"
        description={`${formatDate(data.range.from)} - ${formatDate(data.range.to)}`}
        action={<Button to="/admin/analytics" variant="secondary">Full analytics</Button>}
      />

      {openActions.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {openActions.map(({ key, label, to, icon: Icon }) => (
            <Link key={key} to={to} className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 transition hover:ring-amber-300">
              <Icon className="h-5 w-5 shrink-0 text-amber-600" />
              <span className="min-w-0">
                <span className="block text-xl font-bold text-amber-900">{formatNumber(pendingActions[key])}</span>
                <span className="block text-xs text-amber-800">{label}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Platform revenue" value={money(totals.platformRevenue)} hint={`Commission ${money(totals.commissionEarned)} + fees ${money(totals.convenienceFees)}`} icon={IndianRupee} tone="green" />
        <StatCard label="Booking value" value={money(totals.grossBookingValue)} hint={`${formatNumber(totals.bookings)} bookings`} icon={BadgeIndianRupee} tone="blue" />
        <StatCard label="Tickets sold" value={formatNumber(totals.ticketsSold)} hint={`Organizer earnings ${money(totals.organizerEarnings)}`} icon={Ticket} />
        <StatCard label="Refund rate" value={`${totals.refundRate}%`} hint={`${money(totals.refundedAmount)} in ${formatNumber(totals.refundsProcessed)} refunds`} icon={Percent} tone="rose" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="min-w-0">
          <CardHeader title="Platform revenue per day" description="Commission and convenience fees" />
          <div className="px-5 py-5 sm:px-6">
            <ColumnChart data={series} title="Platform revenue per day" formatValue={compactInr} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-brand-600" />People</span>} />
            <ul className="divide-y divide-slate-100 text-sm">
              {['attendee', 'organizer', 'admin'].map((role) => (
                <li key={role} className="flex items-center justify-between px-5 py-2.5">
                  <span className="capitalize text-slate-600">{role}s</span>
                  <span className="tabular-nums text-slate-900">
                    {formatNumber(users[role]?.total ?? 0)}
                    {users[role]?.newInRange > 0 && (
                      <span className="ml-1 text-xs text-emerald-600" title={`${users[role].newInRange} joined in this period`}>
                        +{users[role].newInRange}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><UserCheck className="h-4 w-4 text-brand-600" />Attendance</span>} description="Events that already happened" />
            <div className="px-5 py-4">
              <p className="text-3xl font-bold text-slate-900">{data.attendance.overallRate}%</p>
              <p className="mt-1 text-sm text-slate-500">of sold tickets were scanned at the gate</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Top events" description="By tickets sold" action={<Link to="/admin/events" className="text-sm font-semibold text-brand-600 hover:text-brand-700">All events</Link>} />
          <Table columns={eventColumns} rows={data.topEvents} empty="No sales in this period." />
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Top organizers" description="By booking value" action={<Link to="/admin/organizers" className="text-sm font-semibold text-brand-600 hover:text-brand-700">All organizers</Link>} />
          <Table columns={organizerColumns} rows={data.topOrganizers} empty="No sales in this period." />
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Events by status" />
        <ul className="flex flex-wrap gap-4 px-5 py-4">
          {Object.entries(data.eventsByStatus).map(([status, count]) => (
            <li key={status} className="flex items-center gap-2">
              <EventStatusBadge status={status} />
              <span className="text-sm font-semibold tabular-nums text-slate-900">{formatNumber(count)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
