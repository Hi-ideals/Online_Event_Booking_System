import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Percent } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi, adminKeys } from '../../api/admin';
import { FilterSelect, ListCard } from '../../components/admin/AdminList';
import Button from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Alert, Badge, PageHeader } from '../../components/ui/Feedback';
import { Field, Input } from '../../components/ui/Form';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatDateTime, titleCase } from '../../lib/format';

const ENTITY_TYPES = [
  { value: 'user', label: 'Users & organizers' },
  { value: 'event', label: 'Events' },
  { value: 'order', label: 'Bookings' },
  { value: 'refund_request', label: 'Refund requests' },
  { value: 'payout', label: 'Payouts' },
  { value: 'category', label: 'Categories' },
  { value: 'settings', label: 'Settings' },
  { value: 'ticket', label: 'Tickets' },
];

function CommissionCard() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: adminKeys.settings, queryFn: adminApi.settings });
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (settings.data) setValue(String(settings.data.commissionPercent));
  }, [settings.data]);

  const mutation = useMutation({
    mutationFn: () => adminApi.updateSettings({ commissionPercent: Number(value) }),
    onSuccess: (updated) => {
      toast.success(`Commission set to ${updated.commissionPercent}%`);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const submit = (e) => {
    e.preventDefault();
    const n = Number(value);
    if (!(n >= 0 && n <= 100)) return setError('Enter a percentage between 0 and 100');
    setError(null);
    mutation.mutate();
  };

  const unchanged = settings.data && Number(value) === settings.data.commissionPercent;

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Percent className="h-4 w-4 text-brand-600" />Platform commission</span>} description="Your share of ticket sales, before organizer-specific rates" />
      <form onSubmit={submit} noValidate>
        <CardBody className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Commission percentage" required hint="Applies to bookings confirmed from now on. Past bookings keep the rate they were confirmed with.">
            {({ id }) => <Input id={id} type="number" min="0" max="100" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} disabled={settings.isLoading} className="max-w-40" />}
          </Field>
          <p className="text-sm text-slate-500">
            An organizer can be given their own rate on the <span className="font-medium text-slate-700">Organizers</span> page, which overrides this one.
          </p>
        </CardBody>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3 sm:px-6">
          <Button type="submit" loading={mutation.isPending} disabled={unchanged}>
            Save commission
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const query = { entityType, page, limit: 20 };
  const logs = useQuery({ queryKey: adminKeys.auditLogs(query), queryFn: () => adminApi.auditLogs(query), placeholderData: keepPreviousData });

  const columns = [
    { key: 'action', label: 'Action', render: (l) => <span className="block min-w-40"><Badge tone="brand">{titleCase(l.action.split('.')[0])}</Badge><span className="mt-1 block text-xs text-slate-600">{l.action}</span></span> },
    { key: 'actor', label: 'By', render: (l) => (l.actor ? <span className="block min-w-32"><span className="text-slate-900">{l.actor.name}</span><span className="block text-xs text-slate-500">{titleCase(l.actor.role)}</span></span> : <span className="text-slate-400">System</span>) },
    { key: 'entity', label: 'Record', render: (l) => <span className="block max-w-48 truncate text-xs text-slate-500">{l.entityType}{l.entityId ? ` · ${l.entityId}` : ''}</span> },
    { key: 'metadata', label: 'Details', render: (l) => <span className="block max-w-64 truncate text-xs text-slate-500">{Object.keys(l.metadata ?? {}).length ? JSON.stringify(l.metadata) : '-'}</span> },
    { key: 'createdAt', label: 'When', render: (l) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(l.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Settings" description="Platform commission and the activity trail" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
        <CommissionCard />

        <div className="min-w-0">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <History className="h-4 w-4 text-brand-600" /> Activity log
            </h2>
            <FilterSelect label="Record type" value={entityType} onChange={(v) => { setEntityType(v); setPage(1); }} allLabel="All records" options={ENTITY_TYPES} />
          </div>
          <ListCard query={{ ...logs, onPageChange: setPage }} columns={columns} empty="Nothing recorded yet." />
          <p className="mt-2 text-xs text-slate-500">Sensitive actions are recorded here: approvals, suspensions, refunds, payouts, blocks and settings changes.</p>
        </div>
      </div>
    </div>
  );
}
