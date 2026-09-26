import { useQuery } from '@tanstack/react-query';
import { IndianRupee, Percent, RotateCcw, Ticket, Wallet } from 'lucide-react';
import { orgEventsApi, orgKeys } from '../../../api/organizer';
import { getErrorMessage } from '../../../lib/errors';
import { formatCurrency, formatNumber } from '../../../lib/format';
import { Card, CardHeader } from '../../ui/Card';
import { Alert } from '../../ui/Feedback';
import { StatCard, Table } from '../orgUi';

const money = (v) => formatCurrency(v, { free: false });

export default function SalesTab({ event }) {
  const { data, isLoading, isError, error } = useQuery({ queryKey: orgKeys.sales(event.id), queryFn: () => orgEventsApi.salesSummary(event.id) });

  if (isError) return <Alert tone="error">{getErrorMessage(error)}</Alert>;
  if (isLoading) return <div className="h-64 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />;

  const columns = [
    { key: 'name', label: 'Ticket type', render: (t) => <span className="font-medium text-slate-900">{t.name}</span> },
    { key: 'price', label: 'Price', align: 'right', render: (t) => formatCurrency(t.price) },
    { key: 'sold', label: 'Sold', align: 'right', render: (t) => `${formatNumber(t.sold)} / ${formatNumber(t.quantity)}` },
    { key: 'held', label: 'In checkout', align: 'right', render: (t) => formatNumber(t.held) },
    { key: 'revenue', label: 'Revenue', align: 'right', render: (t) => money(t.revenue) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Tickets sold" value={formatNumber(data.ticketsSold)} hint={`${data.confirmedBookings} confirmed booking(s)`} icon={Ticket} />
        <StatCard label="Gross ticket sales" value={money(data.grossTicketSales)} icon={IndianRupee} tone="blue" />
        <StatCard label="Refunded" value={money(data.refunded)} hint={`${data.cancelledBookings} cancelled booking(s)`} icon={RotateCcw} tone="rose" />
        <StatCard label="Your earnings" value={money(data.organizerEarnings)} hint="After refunds and commission" icon={Wallet} tone="green" />
      </div>

      <Card>
        <CardHeader title="Earnings breakdown" />
        <dl className="divide-y divide-slate-100 text-sm">
          {[
            ['Gross ticket sales', money(data.grossTicketSales)],
            ['Refunds', `- ${money(Math.min(data.refunded, data.grossTicketSales))}`],
            ['Net ticket sales', money(data.netTicketSales)],
            [<span key="c" className="flex items-center gap-1"><Percent className="h-3.5 w-3.5" /> Platform commission</span>, `- ${money(data.platformCommission)}`],
          ].map(([label, value], i) => (
            <div key={i} className="flex justify-between px-5 py-3 sm:px-6">
              <dt className="text-slate-600">{label}</dt>
              <dd className="tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between bg-emerald-50/60 px-5 py-3 font-semibold sm:px-6">
            <dt className="text-slate-900">Your earnings</dt>
            <dd className="tabular-nums text-emerald-700">{money(data.organizerEarnings)}</dd>
          </div>
        </dl>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:px-6">Convenience fees are charged to attendees and are not part of your earnings. A payout is created after the event is completed.</p>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="By ticket type" />
        <Table columns={columns} rows={data.byTier.map((t) => ({ ...t, id: t.tierId }))} empty="No ticket types." />
      </Card>
    </div>
  );
}
