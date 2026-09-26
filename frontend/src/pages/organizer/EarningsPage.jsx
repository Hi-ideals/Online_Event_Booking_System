import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BadgeCheck, CalendarClock, Clock, IndianRupee, Landmark, Percent } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { orgKeys, organizerApi } from '../../api/organizer';
import { StatCard, Table, Tabs } from '../../components/organizer/orgUi';
import { Card, CardHeader } from '../../components/ui/Card';
import { Alert, Badge, PageHeader } from '../../components/ui/Feedback';
import Pagination from '../../components/ui/Pagination';
import { useAuth } from '../../context/AuthContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate } from '../../lib/format';

const money = (v) => formatCurrency(v, { free: false });

export default function EarningsPage() {
  useDocumentTitle('Earnings & payouts');
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const earnings = useQuery({ queryKey: orgKeys.earnings, queryFn: organizerApi.earnings });
  const params = { status, page, limit: 10 };
  const payouts = useQuery({ queryKey: orgKeys.payouts(params), queryFn: () => organizerApi.payouts(params), placeholderData: keepPreviousData });

  const e = earnings.data;
  const payout = user.organizerProfile?.payoutDetails ?? {};
  const hasPayoutDetails = Boolean(payout.accountNumber || payout.upiId);

  const columns = [
    { key: 'event', label: 'Event', render: (p) => <span className="block min-w-44"><span className="font-medium text-slate-900">{p.event.title}</span><span className="block text-xs text-slate-500">{formatDate(p.event.startAt)}</span></span> },
    { key: 'gross', label: 'Gross sales', align: 'right', render: (p) => money(p.grossSales) },
    { key: 'refunds', label: 'Refunds', align: 'right', render: (p) => money(p.refunds) },
    { key: 'commission', label: 'Commission', align: 'right', render: (p) => money(p.commission) },
    { key: 'amount', label: 'Payout', align: 'right', render: (p) => <span className="font-semibold text-slate-900">{money(p.amount)}</span> },
    {
      key: 'status',
      label: 'Status',
      render: (p) =>
        p.status === 'paid' ? (
          <span className="block">
            <Badge tone="green">Paid</Badge>
            <span className="mt-0.5 block whitespace-nowrap text-xs text-slate-500">{formatDate(p.paidAt)}{p.reference && ` · ${p.reference}`}</span>
          </span>
        ) : (
          <Badge tone="amber">Pending</Badge>
        ),
    },
  ];

  return (
    <div>
      <PageHeader title="Earnings & payouts" description="Money from your ticket sales after refunds and platform commission" />

      {earnings.isError ? (
        <Alert tone="error">{getErrorMessage(earnings.error)}</Alert>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Total earnings" value={e ? money(e.totalEarnings) : '...'} hint={e ? `From ${money(e.grossTicketSales)} gross sales` : undefined} icon={IndianRupee} tone="green" />
          <StatCard label="Upcoming" value={e ? money(e.upcomingEarnings) : '...'} hint="Events not yet completed" icon={CalendarClock} tone="blue" />
          <StatCard label="Pending payout" value={e ? money(e.pendingPayout) : '...'} hint="Completed events, transfer due" icon={Clock} tone="amber" />
          <StatCard label="Paid out" value={e ? money(e.paidOut) : '...'} icon={BadgeCheck} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Payouts" description="One payout per completed event" />
          <div className="px-5 pt-2 sm:px-6">
            <Tabs
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              tabs={[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }]}
            />
          </div>
          {payouts.isError ? (
            <div className="p-5">
              <Alert tone="error">{getErrorMessage(payouts.error)}</Alert>
            </div>
          ) : payouts.isLoading ? (
            <div className="h-40 animate-pulse bg-slate-50" />
          ) : (
            <>
              <Table columns={columns} rows={payouts.data.items} empty="No payouts yet. A payout is created after each event is completed." />
              <div className="border-t border-slate-100 px-5 py-3">
                <Pagination pagination={payouts.data.pagination} onChange={setPage} />
              </div>
            </>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-brand-600" />Payout account</span>} />
            <div className="space-y-1 px-5 py-4 text-sm sm:px-6">
              {hasPayoutDetails ? (
                <>
                  <p className="font-medium text-slate-900">{payout.accountHolderName ?? user.organizerProfile?.organizationName}</p>
                  {payout.bankName && <p className="text-slate-600">{payout.bankName}</p>}
                  {payout.accountNumber && <p className="font-mono text-slate-600">A/c ending {payout.accountNumber.slice(-4)} &middot; {payout.ifscCode}</p>}
                  {payout.upiId && <p className="text-slate-600">UPI: {payout.upiId}</p>}
                </>
              ) : (
                <Alert tone="warning">Add your bank or UPI details so we can send your payouts.</Alert>
              )}
              <Link to="/account" className="inline-block pt-2 font-medium text-brand-600 hover:text-brand-700">
                {hasPayoutDetails ? 'Update details' : 'Add payout details'}
              </Link>
            </div>
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Percent className="h-4 w-4 text-brand-600" />How earnings work</span>} />
            <ul className="space-y-2 px-5 py-4 text-sm text-slate-600 sm:px-6">
              <li>
                Platform commission: <strong className="text-slate-900">{e ? `${e.commissionPercent}%` : '...'}</strong> of ticket sales kept after refunds.
              </li>
              <li>Convenience fees paid by attendees are not deducted from your earnings.</li>
              <li>After an event is completed, a payout is created and transferred to your account.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
