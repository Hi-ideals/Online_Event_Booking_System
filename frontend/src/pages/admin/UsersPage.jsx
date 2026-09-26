import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ShieldPlus, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { adminApi, adminKeys } from '../../api/admin';
import { FilterSelect, ListCard, SearchBox } from '../../components/admin/AdminList';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Badge, PageHeader } from '../../components/ui/Feedback';
import { Field, Input, PasswordInput } from '../../components/ui/Form';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import useDebounced from '../../hooks/useDebounced';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { applyServerErrors, getErrorMessage } from '../../lib/errors';
import { formatDateTime, titleCase } from '../../lib/format';
import { emailSchema, passwordSchema } from '../../lib/validation';

const ROLE_TONE = { admin: 'brand', organizer: 'blue', attendee: 'gray' };
const STATUS_TONE = { active: 'green', pending_approval: 'amber', rejected: 'red', suspended: 'red' };

function NewAdminModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const schema = z.object({ name: z.string().trim().min(2, 'Enter a name').max(120), email: emailSchema, password: passwordSchema });
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: adminApi.createAdmin,
    onSuccess: (user) => {
      toast.success(`Admin ${user.email} created`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      reset();
      onClose();
    },
    onError: (error) => {
      if (!applyServerErrors(error, setError)) toast.error(getErrorMessage(error));
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && onClose()}
      title="Create admin account"
      description="Admins can manage everything on the platform"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="admin-form" loading={mutation.isPending}>
            Create admin
          </Button>
        </>
      }
    >
      <form id="admin-form" onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
        <Field label="Full name" required error={errors.name?.message}>
          {({ id }) => <Input id={id} error={errors.name} {...register('name')} />}
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          {({ id }) => <Input id={id} type="email" error={errors.email} {...register('email')} />}
        </Field>
        <Field label="Temporary password" required hint="Share it securely; they can change it in account settings." error={errors.password?.message}>
          {({ id }) => <PasswordInput id={id} error={errors.password} {...register('password')} />}
        </Field>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  useDocumentTitle('Users');
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const [newAdmin, setNewAdmin] = useState(false);
  const q = useDebounced(search);

  const query = { search: q.trim(), role, status, page, limit: 20 };
  const list = useQuery({ queryKey: adminKeys.users(query), queryFn: () => adminApi.users(query), placeholderData: keepPreviousData });

  const action = useMutation({
    mutationFn: ({ user, suspend, reason }) => adminApi.setUserStatus(user.id, suspend ? 'suspended' : 'active', reason),
    onSuccess: (_u, { suspend }) => {
      toast.success(suspend ? 'User suspended' : 'User reactivated');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setDialog(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setDialog(null);
    },
  });

  const reset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const columns = [
    {
      key: 'user',
      label: 'User',
      render: (u) => (
        <span className="block min-w-48">
          <span className="font-medium text-slate-900">{u.name}</span>
          <span className="block text-xs text-slate-500">{u.email}</span>
          {u.organizerProfile?.organizationName && <span className="block text-xs text-slate-400">{u.organizerProfile.organizationName}</span>}
        </span>
      ),
    },
    { key: 'role', label: 'Role', render: (u) => <Badge tone={ROLE_TONE[u.role]}>{titleCase(u.role)}</Badge> },
    { key: 'status', label: 'Status', render: (u) => <Badge tone={STATUS_TONE[u.status]}>{titleCase(u.status)}</Badge> },
    { key: 'phone', label: 'Phone', render: (u) => u.phone ?? '-' },
    { key: 'lastLoginAt', label: 'Last login', render: (u) => <span className="whitespace-nowrap text-xs text-slate-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</span> },
    {
      key: 'actions',
      label: '',
      render: (u) =>
        u.id === me.id ? (
          <span className="block text-right text-xs text-slate-400">You</span>
        ) : (
          <div className="flex justify-end">
            {u.status === 'suspended' ? (
              <Button size="sm" variant="secondary" icon={UserCheck} onClick={() => setDialog({ user: u, suspend: false })}>
                Reactivate
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="text-rose-600" icon={Ban} onClick={() => setDialog({ user: u, suspend: true })}>
                Suspend
              </Button>
            )}
          </div>
        ),
    },
  ];

  return (
    <div>
      <PageHeader title="Users" description="Everyone on the platform" action={<Button icon={ShieldPlus} onClick={() => setNewAdmin(true)}>New admin</Button>} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchBox value={search} onChange={reset(setSearch)} placeholder="Search name, email or organization" />
        <FilterSelect label="Role" value={role} onChange={reset(setRole)} allLabel="All roles" options={[{ value: 'attendee', label: 'Attendees' }, { value: 'organizer', label: 'Organizers' }, { value: 'admin', label: 'Admins' }]} />
        <FilterSelect
          label="Status"
          value={status}
          onChange={reset(setStatus)}
          allLabel="All statuses"
          options={[{ value: 'active', label: 'Active' }, { value: 'pending_approval', label: 'Pending approval' }, { value: 'rejected', label: 'Rejected' }, { value: 'suspended', label: 'Suspended' }]}
        />
      </div>

      <ListCard query={{ ...list, onPageChange: setPage }} columns={columns} empty="No users found." />

      <ConfirmDialog
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => action.mutate({ ...dialog, reason })}
        loading={action.isPending}
        title={dialog?.suspend ? 'Suspend this user?' : 'Reactivate this user?'}
        confirmLabel={dialog?.suspend ? 'Suspend' : 'Reactivate'}
        tone={dialog?.suspend ? 'danger' : 'primary'}
        reasonLabel="Reason (internal)"
      >
        <p className="font-medium text-slate-900">
          {dialog?.user?.name} ({dialog?.user?.email})
        </p>
        <p>{dialog?.suspend ? 'They are signed out immediately and cannot log in. Existing tickets stay valid.' : 'They will be able to log in again.'}</p>
      </ConfirmDialog>

      <NewAdminModal open={newAdmin} onClose={() => setNewAdmin(false)} />
    </div>
  );
}
