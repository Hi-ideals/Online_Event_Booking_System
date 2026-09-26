import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, ExternalLink, Percent, X } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router';
import { adminApi, adminKeys } from '../../api/admin';
import { ListCard, SearchBox } from '../../components/admin/AdminList';
import { Tabs } from '../../components/organizer/orgUi';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Alert, Badge, PageHeader } from '../../components/ui/Feedback';
import { Field, Input } from '../../components/ui/Form';
import Modal from '../../components/ui/Modal';
import useDebounced from '../../hooks/useDebounced';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatDate, titleCase } from '../../lib/format';

const STATUS_TONE = { active: 'green', pending_approval: 'amber', rejected: 'red', suspended: 'red' };
const TABS = [
  { value: 'pending_approval', label: 'Awaiting approval' },
  { value: 'active', label: 'Approved' },
  { value: 'all', label: 'All' },
];

function CommissionModal({ organizer, onClose }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(organizer?.organizerProfile?.commissionPercent ?? '');
  const mutation = useMutation({
    mutationFn: () => adminApi.setCommission(organizer.id, value === '' ? null : Number(value)),
    onSuccess: (result) => {
      toast.success(value === '' ? 'Using the platform commission rate' : `Commission set to ${result.commissionPercent}%`);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Modal
      open={Boolean(organizer)}
      onClose={() => !mutation.isPending && onClose()}
      title="Commission rate"
      description={organizer?.organizerProfile?.organizationName}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Commission percentage" hint="Leave empty to use the platform default. Applies to bookings confirmed from now on.">
          {({ id }) => <Input id={id} type="number" min="0" max="100" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Platform default" />}
        </Field>
      </div>
    </Modal>
  );
}

export default function OrganizersPage() {
  useDocumentTitle('Organizers');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null); // { type, organizer }
  const [commissionFor, setCommissionFor] = useState(null);
  const tab = params.get('status') ?? 'pending_approval';
  const status = tab === 'all' ? '' : tab;
  const q = useDebounced(search);

  const query = { status, search: q.trim(), page, limit: 20 };
  const list = useQuery({ queryKey: adminKeys.organizers(query), queryFn: () => adminApi.organizers(query), placeholderData: keepPreviousData });

  const action = useMutation({
    mutationFn: ({ type, organizer, reason }) => {
      if (type === 'approve') return adminApi.approveOrganizer(organizer.id);
      if (type === 'reject') return adminApi.rejectOrganizer(organizer.id, reason);
      return adminApi.setUserStatus(organizer.id, type === 'suspend' ? 'suspended' : 'active', reason);
    },
    onSuccess: (_user, { type }) => {
      const messages = { approve: 'Organizer approved. They can publish events now.', reject: 'Organizer rejected', suspend: 'Organizer suspended', reactivate: 'Organizer reactivated' };
      toast.success(messages[type]);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setDialog(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setDialog(null);
    },
  });

  const columns = [
    {
      key: 'org',
      label: 'Organizer',
      render: (u) => (
        <span className="block min-w-48">
          <span className="font-medium text-slate-900">{u.organizerProfile?.organizationName ?? u.name}</span>
          <span className="block text-xs text-slate-500">
            {u.name} &middot; {u.email}
          </span>
        </span>
      ),
    },
    { key: 'city', label: 'City', render: (u) => u.organizerProfile?.city ?? '-' },
    {
      key: 'status',
      label: 'Status',
      render: (u) => (
        <span className="block">
          <Badge tone={STATUS_TONE[u.status]}>{titleCase(u.status)}</Badge>
          {u.organizerProfile?.rejectionReason && u.status === 'rejected' && <span className="mt-0.5 block max-w-48 text-xs text-slate-500">{u.organizerProfile.rejectionReason}</span>}
        </span>
      ),
    },
    { key: 'commission', label: 'Commission', render: (u) => (u.organizerProfile?.commissionPercent != null ? `${u.organizerProfile.commissionPercent}%` : <span className="text-slate-400">Default</span>) },
    { key: 'createdAt', label: 'Registered', render: (u) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDate(u.createdAt)}</span> },
    {
      key: 'actions',
      label: '',
      render: (u) => (
        <div className="flex justify-end gap-1">
          {u.status === 'pending_approval' && (
            <>
              <Button size="sm" icon={Check} onClick={() => setDialog({ type: 'approve', organizer: u })}>
                Approve
              </Button>
              <Button size="sm" variant="ghost" className="text-rose-600" icon={X} onClick={() => setDialog({ type: 'reject', organizer: u })}>
                Reject
              </Button>
            </>
          )}
          {u.status === 'active' && (
            <>
              <Button size="sm" variant="ghost" icon={Percent} onClick={() => setCommissionFor(u)} aria-label="Set commission" />
              <Button size="sm" variant="ghost" className="text-rose-600" icon={Ban} onClick={() => setDialog({ type: 'suspend', organizer: u })} aria-label="Suspend organizer" />
            </>
          )}
          {u.status === 'suspended' && (
            <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'reactivate', organizer: u })}>
              Reactivate
            </Button>
          )}
          {u.organizerProfile?.website && (
            <a href={u.organizerProfile.website} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Open website">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      ),
    },
  ];

  const dialogText = {
    approve: ['Approve this organizer?', 'Approve', 'primary', 'They will be able to create venues and publish events. We email them right away.'],
    reject: ['Reject this organizer?', 'Reject', 'danger', 'They will be emailed with your reason and cannot publish events.'],
    suspend: ['Suspend this organizer?', 'Suspend', 'danger', 'They are signed out immediately and cannot manage events until reactivated. Published events stay online.'],
    reactivate: ['Reactivate this organizer?', 'Reactivate', 'primary', 'They will be able to sign in and manage events again.'],
  }[dialog?.type] ?? [];

  return (
    <div>
      <PageHeader title="Organizers" description="Review applications and manage organizer accounts" />
      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(v) => {
          setParams({ status: v });
          setPage(1);
        }}
        className="mb-4"
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, email or organization" />
      </div>

      {status === 'pending_approval' && list.data?.items.length > 0 && (
        <Alert tone="info" className="mb-4">
          Check the organization details before approving. Approved organizers can sell tickets immediately.
        </Alert>
      )}

      <ListCard query={{ ...list, onPageChange: setPage }} columns={columns} empty={status === 'pending_approval' ? 'No applications waiting.' : 'No organizers found.'} />

      <ConfirmDialog
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => action.mutate({ ...dialog, reason })}
        loading={action.isPending}
        title={dialogText[0]}
        confirmLabel={dialogText[1]}
        tone={dialogText[2]}
        reasonLabel={dialog?.type === 'reject' ? 'Reason (emailed to the organizer)' : dialog?.type === 'suspend' ? 'Reason (internal)' : undefined}
        reasonMinLength={dialog?.type === 'reject' ? 5 : 0}
      >
        <p className="font-medium text-slate-900">{dialog?.organizer?.organizerProfile?.organizationName ?? dialog?.organizer?.name}</p>
        <p>{dialogText[3]}</p>
      </ConfirmDialog>

      <CommissionModal key={commissionFor?.id ?? 'none'} organizer={commissionFor} onClose={() => setCommissionFor(null)} />
    </div>
  );
}
