import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, Ticket, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { orgEventsApi, orgKeys } from '../../../api/organizer';
import cn from '../../../lib/cn';
import { applyServerErrors, getErrorMessage } from '../../../lib/errors';
import { formatCurrency, formatDate, formatNumber } from '../../../lib/format';
import { fromIstInput, toIstInput } from '../../../lib/istDateTime';
import Button from '../../ui/Button';
import { Card, CardHeader } from '../../ui/Card';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../ui/Feedback';
import { Checkbox, Field, Input, Textarea } from '../../ui/Form';
import Modal from '../../ui/Modal';

const EMPTY = { name: '', description: '', price: '', quantity: '', maxPerOrder: '', saleStartAt: '', saleEndAt: '', sectionKeys: [], isActive: true };

function tierToForm(tier) {
  if (!tier) return EMPTY;
  return {
    name: tier.name,
    description: tier.description ?? '',
    price: String(tier.price),
    quantity: String(tier.quantity),
    maxPerOrder: tier.maxPerOrder ? String(tier.maxPerOrder) : '',
    saleStartAt: toIstInput(tier.saleStartAt),
    saleEndAt: toIstInput(tier.saleEndAt),
    sectionKeys: tier.sectionKeys ?? [],
    isActive: tier.isActive,
  };
}

function TierModal({ open, onClose, event, tier }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const seated = event.seatingType === 'seated';
  const draft = event.status === 'draft';
  const sections = event.seatLayout?.definition.sections ?? [];
  const takenSections = new Set(event.tiers.filter((t) => t.id !== tier?.id).flatMap((t) => t.sectionKeys));

  useEffect(() => {
    if (open) {
      setForm(tierToForm(tier));
      setErrors({});
    }
  }, [open, tier]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const buildPayload = () => {
    const next = {};
    const price = Number(form.price);
    if (form.name.trim().length < 1) next.name = 'Enter a name';
    // Compare with a tolerance: 19.99 * 100 is 1998.9999999999998 in floating point.
    if (form.price === '' || !(price >= 0) || Math.abs(Math.round(price * 100) - price * 100) > 1e-6) next.price = 'Enter a valid price (up to 2 decimals)';
    if (!seated && !(Number.isInteger(Number(form.quantity)) && Number(form.quantity) >= 1)) next.quantity = 'Enter how many tickets to sell';
    if (seated && !form.sectionKeys.length) next.sectionKeys = 'Choose at least one section';
    if (form.maxPerOrder && !(Number.isInteger(Number(form.maxPerOrder)) && Number(form.maxPerOrder) >= 1)) next.maxPerOrder = 'Whole number, at least 1';
    if (form.saleStartAt && form.saleEndAt && form.saleEndAt <= form.saleStartAt) next.saleEndAt = 'Sale end must be after sale start';
    setErrors(next);
    if (Object.keys(next).length) return null;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price,
      maxPerOrder: form.maxPerOrder ? Number(form.maxPerOrder) : null,
      saleStartAt: fromIstInput(form.saleStartAt) ?? null,
      saleEndAt: fromIstInput(form.saleEndAt) ?? null,
      isActive: form.isActive,
    };
    if (!seated) payload.quantity = Number(form.quantity);
    if (seated && draft) payload.sectionKeys = form.sectionKeys;
    return payload;
  };

  const mutation = useMutation({
    mutationFn: (payload) => (tier ? orgEventsApi.updateTier(event.id, tier.id, payload) : orgEventsApi.createTier(event.id, payload)),
    onSuccess: (updated) => {
      queryClient.setQueryData(orgKeys.event(event.id), (old) => ({ ...old, ...updated }));
      queryClient.invalidateQueries({ queryKey: ['organizer', 'events'] });
      toast.success(tier ? 'Ticket type updated' : 'Ticket type added');
      onClose();
    },
    onError: (error) => {
      const fieldErrors = {};
      if (!applyServerErrors(error, (name, { message }) => (fieldErrors[name] = message))) toast.error(getErrorMessage(error));
      setErrors(fieldErrors);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const payload = buildPayload();
    if (payload) mutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && onClose()}
      title={tier ? 'Edit ticket type' : 'Add ticket type'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="tier-form" loading={mutation.isPending}>
            {tier ? 'Save' : 'Add ticket type'}
          </Button>
        </>
      }
    >
      <form id="tier-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Name" required error={errors.name} className="sm:col-span-2">
          {({ id }) => <Input id={id} value={form.name} onChange={set('name')} placeholder="Early Bird, VIP, General..." maxLength={80} error={errors.name} />}
        </Field>
        <Field label="Price (INR)" required hint="Use 0 for free tickets" error={errors.price}>
          {({ id }) => <Input id={id} type="number" min="0" step="0.01" value={form.price} onChange={set('price')} error={errors.price} />}
        </Field>
        {!seated ? (
          <Field label="Quantity" required hint={tier?.soldCount ? `${tier.soldCount} already sold` : undefined} error={errors.quantity}>
            {({ id }) => <Input id={id} type="number" min="1" value={form.quantity} onChange={set('quantity')} error={errors.quantity} />}
          </Field>
        ) : (
          <Field label="Max per booking" hint="Optional" error={errors.maxPerOrder}>
            {({ id }) => <Input id={id} type="number" min="1" max="50" value={form.maxPerOrder} onChange={set('maxPerOrder')} error={errors.maxPerOrder} />}
          </Field>
        )}

        {seated && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium text-slate-700">
              Seat sections <span className="text-rose-500">*</span>
            </legend>
            {!draft && (
              <p className="mb-2 flex items-center gap-1 text-xs text-slate-500">
                <Lock className="h-3 w-3" /> Sections cannot change after publishing.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {sections.map((s) => {
                const taken = takenSections.has(s.key);
                const seats = s.rows.reduce((n, r) => n + r.seats - (r.blocked?.length ?? 0), 0);
                return (
                  <label key={s.key} className={cn('flex items-center gap-3 rounded-xl p-3 ring-1 ring-slate-200', (taken || !draft) && 'opacity-60')}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      disabled={taken || !draft}
                      checked={form.sectionKeys.includes(s.key)}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, sectionKeys: e.target.checked ? [...f.sectionKeys, s.key] : f.sectionKeys.filter((k) => k !== s.key) }))
                      }
                    />
                    <span className="text-sm">
                      <span className="font-medium text-slate-900">{s.name}</span>
                      <span className="block text-xs text-slate-500">{taken ? 'Used by another ticket type' : `${seats} seats`}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.sectionKeys && <p className="mt-1.5 text-xs text-rose-600">{errors.sectionKeys}</p>}
          </fieldset>
        )}

        {!seated && (
          <Field label="Max per booking" hint="Optional" error={errors.maxPerOrder}>
            {({ id }) => <Input id={id} type="number" min="1" max="50" value={form.maxPerOrder} onChange={set('maxPerOrder')} error={errors.maxPerOrder} />}
          </Field>
        )}
        <Field label="Description" hint="Optional, e.g. what is included" error={errors.description} className="sm:col-span-2">
          {({ id }) => <Textarea id={id} rows={2} maxLength={500} value={form.description} onChange={set('description')} />}
        </Field>
        <Field label="Sale starts (IST)" hint="Leave empty to start immediately" error={errors.saleStartAt}>
          {({ id }) => <Input id={id} type="datetime-local" value={form.saleStartAt} onChange={set('saleStartAt')} />}
        </Field>
        <Field label="Sale ends (IST)" hint="Leave empty to sell until the event" error={errors.saleEndAt}>
          {({ id }) => <Input id={id} type="datetime-local" value={form.saleEndAt} onChange={set('saleEndAt')} error={errors.saleEndAt} />}
        </Field>
        <Checkbox className="sm:col-span-2" label="Active" description="Inactive ticket types are hidden from attendees" checked={form.isActive} onChange={set('isActive')} />
      </form>
    </Modal>
  );
}

export default function TicketsTab({ event }) {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState({ open: false, tier: null });
  const [toDelete, setToDelete] = useState(null);
  const closed = ['completed', 'cancelled'].includes(event.status);
  const seatedLocked = event.seatingType === 'seated' && event.status !== 'draft';
  const needsLayout = event.seatingType === 'seated' && !event.seatLayout;

  const remove = useMutation({
    mutationFn: () => orgEventsApi.removeTier(event.id, toDelete.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(orgKeys.event(event.id), (old) => ({ ...old, ...updated }));
      toast.success('Ticket type deleted');
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setToDelete(null);
    },
  });

  const canAdd = !closed && !seatedLocked && !needsLayout;

  return (
    <div className="space-y-4">
      {needsLayout && <Alert tone="warning" title="Choose a seat layout first">Edit the event and select a seat layout before adding ticket types for reserved seating.</Alert>}
      <Card className="overflow-hidden">
        <CardHeader
          title="Ticket types"
          description={event.seatingType === 'seated' ? 'Each ticket type covers one or more seat sections' : 'Set price and quantity for each ticket type'}
          action={canAdd && <Button icon={Plus} onClick={() => setModal({ open: true, tier: null })}>Add ticket type</Button>}
        />
        {event.tiers.length === 0 ? (
          <EmptyState icon={Ticket} title="No ticket types yet" description="Add at least one ticket type before publishing." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {event.tiers.map((tier) => {
              const pct = tier.quantity ? Math.round(((tier.soldCount + tier.heldCount) / tier.quantity) * 100) : 0;
              const hasBookings = tier.soldCount > 0 || tier.heldCount > 0;
              return (
                <li key={tier.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                      {tier.name}
                      {!tier.isActive && <Badge>Inactive</Badge>}
                      {tier.isActive && !tier.onSale && <Badge tone="amber">Not on sale now</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {formatCurrency(tier.price)}
                      {tier.sectionKeys.length > 0 && ` · Sections: ${tier.sectionKeys.join(', ')}`}
                      {tier.maxPerOrder && ` · Max ${tier.maxPerOrder}/booking`}
                      {tier.saleEndAt && ` · Sale ends ${formatDate(tier.saleEndAt)}`}
                    </p>
                  </div>
                  <div className="sm:w-48">
                    <p className="text-xs tabular-nums text-slate-600">
                      {formatNumber(tier.soldCount)} sold{tier.heldCount > 0 && ` + ${tier.heldCount} held`} / {formatNumber(tier.quantity)}
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                  {!closed && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setModal({ open: true, tier })}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600"
                        disabled={hasBookings || seatedLocked}
                        title={hasBookings ? 'Ticket types with bookings cannot be deleted. Mark them inactive instead.' : undefined}
                        onClick={() => setToDelete(tier)}
                        aria-label={`Delete ${tier.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <TierModal open={modal.open} tier={modal.tier} event={event} onClose={() => setModal({ open: false, tier: null })} />
      <ConfirmDialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={() => remove.mutate()} loading={remove.isPending} title={`Delete "${toDelete?.name}"?`} confirmLabel="Delete">
        This ticket type will be removed.
      </ConfirmDialog>
    </div>
  );
}
