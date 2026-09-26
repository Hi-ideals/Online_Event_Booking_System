import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../../api/admin';
import { eventKeys, eventsApi } from '../../api/events';
import categoryStyle from '../../components/events/categoryStyle';
import { Table } from '../../components/organizer/orgUi';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Alert, Badge, PageHeader } from '../../components/ui/Feedback';
import { Field, Input, Textarea } from '../../components/ui/Form';
import Modal from '../../components/ui/Modal';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import cn from '../../lib/cn';
import { getErrorMessage } from '../../lib/errors';
import { formatNumber } from '../../lib/format';

const EMPTY = { name: '', description: '', sortOrder: '0' };

function CategoryModal({ open, category, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(category ? { name: category.name, description: category.description ?? '', sortOrder: String(category.sortOrder) } : EMPTY);
      setError(null);
    }
  }, [open, category]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { name: form.name.trim(), description: form.description.trim() || null, sortOrder: Number(form.sortOrder) || 0 };
      return category ? adminApi.updateCategory(category.id, payload) : adminApi.createCategory(payload);
    },
    onSuccess: () => {
      toast.success(category ? 'Category updated' : 'Category created');
      queryClient.invalidateQueries({ queryKey: eventKeys.categories });
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const submit = (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError('Enter a category name (at least 2 characters)');
    mutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && onClose()}
      title={category ? 'Edit category' : 'New category'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={mutation.isPending}>
            {category ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" required>
          {({ id }) => <Input id={id} value={form.name} maxLength={60} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Music, Comedy, Sports..." />}
        </Field>
        <Field label="Description" hint="Optional, shown on category pages">
          {({ id }) => <Textarea id={id} rows={2} maxLength={300} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}
        </Field>
        <Field label="Sort order" hint="Lower numbers appear first">
          {({ id }) => <Input id={id} type="number" min="0" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />}
        </Field>
      </form>
    </Modal>
  );
}

export default function CategoriesPage() {
  useDocumentTitle('Categories');
  const queryClient = useQueryClient();
  const [modal, setModal] = useState({ open: false, category: null });
  const [toDelete, setToDelete] = useState(null);
  const list = useQuery({ queryKey: [...eventKeys.categories, 'admin'], queryFn: () => eventsApi.categories({ includeInactive: true }) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: eventKeys.categories });

  const toggle = useMutation({
    mutationFn: (category) => adminApi.updateCategory(category.id, { isActive: !category.isActive }),
    onSuccess: (category) => {
      toast.success(category.isActive ? 'Category is visible again' : 'Category hidden. Organizers cannot pick it for new events.');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => adminApi.deleteCategory(toDelete.id),
    onSuccess: () => {
      toast.success('Category deleted');
      refresh();
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setToDelete(null);
    },
  });

  const columns = [
    {
      key: 'name',
      label: 'Category',
      render: (c) => {
        const { icon: Icon, gradient } = categoryStyle(c.slug);
        return (
          <span className="flex min-w-48 items-center gap-3">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white', gradient)}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-slate-900">{c.name}</span>
              <span className="block truncate text-xs text-slate-500">{c.description ?? c.slug}</span>
            </span>
          </span>
        );
      },
    },
    { key: 'upcomingEvents', label: 'Upcoming events', align: 'right', render: (c) => formatNumber(c.upcomingEvents) },
    { key: 'sortOrder', label: 'Order', align: 'right', render: (c) => c.sortOrder },
    { key: 'isActive', label: 'Visible', render: (c) => (c.isActive ? <Badge tone="green">Visible</Badge> : <Badge>Hidden</Badge>) },
    {
      key: 'actions',
      label: '',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setModal({ open: true, category: c })} aria-label={`Edit ${c.name}`} />
          <Button size="sm" variant="ghost" icon={c.isActive ? EyeOff : Eye} onClick={() => toggle.mutate(c)} aria-label={c.isActive ? `Hide ${c.name}` : `Show ${c.name}`} />
          <Button size="sm" variant="ghost" className="text-rose-600" icon={Trash2} onClick={() => setToDelete(c)} aria-label={`Delete ${c.name}`} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Categories" description="What organizers can file their events under" action={<Button icon={Plus} onClick={() => setModal({ open: true, category: null })}>New category</Button>} />

      <Card className="overflow-hidden">
        {list.isError ? (
          <div className="p-5">
            <Alert tone="error">{getErrorMessage(list.error)}</Alert>
          </div>
        ) : list.isLoading ? (
          <div className="h-48 animate-pulse bg-slate-50" />
        ) : (
          <Table columns={columns} rows={list.data} empty="No categories yet." />
        )}
      </Card>

      <CategoryModal open={modal.open} category={modal.category} onClose={() => setModal({ open: false, category: null })} />
      <ConfirmDialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={() => remove.mutate()} loading={remove.isPending} title={`Delete "${toDelete?.name}"?`} confirmLabel="Delete">
        Categories with events cannot be deleted - hide them instead.
      </ConfirmDialog>
    </div>
  );
}
