import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeIndianRupee, Landmark, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router';
import { adminApi, adminKeys } from '../../api/admin';
import { ListCard } from '../../components/admin/AdminList';
import { Tabs } from '../../components/organizer/orgUi';
import Button from '../../components/ui/Button';
import { Alert, Badge, PageHeader } from '../../components/ui/Feedback';
import { Field, Input, Textarea } from '../../components/ui/Form';
import Modal from '../../components/ui/Modal';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatCurrency, formatDate } from '../../lib/format';

const money = (v) => formatCurrency(v, { free: false });

function MarkPaidModal({ payout, onClose }) {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (payout) {
      setReference('');
      setNotes('');
      setError(null);
    }
  }, [payout]);

  const mutation = useMutation({
    mutationFn: () => adminApi.markPayoutPaid(payout.id, { reference: reference.trim(), notes: notes.trim() || undefined }),
    onSuccess: () => {
      toast.success('Payout marked as paid. The organizer has been emailed.');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const details = payout?.payoutDetails ?? {};
  const hasAccount = Boolean(details.accountNumber || details.upiId);

  return (
    <Modal
      open={Boolean(payout)}
      onClose={() => !mutation.isPending && onClose()}
      title="Mark payout as paid"
      description={payout?.event.title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} disabled={reference.trim().length < 3} onClick={() => mutation.mutate()}>
            Mark as paid
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-slate-500">Transfer amount</p>
          <p className="text-2xl font-bold text-slate-900">{money(payout?.amount ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">to {payout?.organizer.name}</p>
        </div>
        <div className="rounded-xl p-4 ring-1 ring-slate-200">
          <p className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
            <Landmark className="h-4 w-4 text-brand-600" /> Payout account
          </p>
          {hasAccount ? (
            <>
              {details.accountHolderName && <p className="text-slate-700">{details.accountHolderName}</p>}
              {details.bankName && <p className="text-slate-600">{details.bankName}</p>}
              {details.accountNumber && (
                <p className="font-mono text-slate-600">
                  {details.accountNumber} &middot; {details.ifscCode}
                </p>
              )}
              {details.upiId && <p className="text-slate-600">UPI: {details.upiId}</p>}
              <p className="mt-2 text-xs text-slate-500">Saved when the payout was created.</p>
            </>
          ) : (
            <Alert tone="warning">This organizer has not added bank or UPI details. Ask them to add them before transferring.</Alert>
          )}
        </div>
        <Field label="Transfer reference (UTR)" required hint="From your bank or UPI app, so the organizer can trace it">
          {({ id }) => <Input id={id} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR123456789" maxLength={100} />}
        </Field>
        <Field label="Internal notes" hint="Optional">
          {({ id }) => <Textarea id={id} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

export default function PayoutsPage() {
  useDocumentTitle('Payouts');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [payingOut, setPayingOut] = useState(null);
  const status = params.get('status') ?? '';

  const query = { status, page, limit: 20 };
  const list = useQuery({ queryKey: adminKeys.payouts(query), queryFn: () => adminApi.payouts(query), placeholderData: keepPreviousData });

  const generate = useMutation({
    mutationFn: adminApi.generatePayouts,
    onSuccess: (result) => {
      toast.success(result.created ? `${result.created} payout(s) created, ${money(result.totalAmount)} total` : 'No new payouts. Payouts are created for completed events.');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const columns = [
    { key: 'organizer', label: 'Organizer', render: (p) => <span className="block min-w-36"><span className="font-medium text-slate-900">{p.organizer.name}</span><span className="block text-xs text-slate-500">{p.organizer.email}</span></span> },
    { key: 'event', label: 'Event', render: (p) => <span className="block min-w-36"><span className="truncate text-slate-900">{p.event.title}</span><span className="block text-xs text-slate-500">{formatDate(p.event.startAt)}</span></span> },
    { key: 'gross', label: 'Gross', align: 'right', render: (p) => money(p.grossSales) },
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
            <span className="mt-0.5 block whitespace-nowrap text-xs text-slate-500">
              {formatDate(p.paidAt)}
              {p.reference ? ` · ${p.reference}` : ''}
            </span>
          </span>
        ) : (
          <Badge tone="amber">Pending</Badge>
        ),
    },
    { key: 'actions', label: '', render: (p) => (p.status === 'pending' ? <div className="flex justify-end"><Button size="sm" onClick={() => setPayingOut(p)}>Mark paid</Button></div> : null) },
  ];

  return (
    <div>
      <PageHeader
        title="Payouts"
        description="Transfers owed to organizers after each completed event"
        action={<Button icon={RefreshCw} loading={generate.isPending} onClick={() => generate.mutate()}>Generate payouts</Button>}
      />

      <Alert tone="info" className="mb-4">
        Payouts are created automatically every hour for events that have finished. Transfer the money from your bank, then mark the payout as paid with the reference number.
      </Alert>

      <Tabs
        className="mb-4"
        value={status}
        onChange={(v) => {
          setParams(v ? { status: v } : {});
          setPage(1);
        }}
        tabs={[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }]}
      />

      <ListCard
        query={{ ...list, onPageChange: setPage }}
        columns={columns}
        empty="No payouts yet."
        footer={
          list.data && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <BadgeIndianRupee className="h-4 w-4 text-brand-600" />
              {status === 'pending' ? 'Pending' : status === 'paid' ? 'Paid' : 'Total'}: <span className="font-semibold text-slate-900">{money(list.data.totalAmount)}</span>
            </p>
          )
        }
      />

      <MarkPaidModal payout={payingOut} onClose={() => setPayingOut(null)} />
    </div>
  );
}
