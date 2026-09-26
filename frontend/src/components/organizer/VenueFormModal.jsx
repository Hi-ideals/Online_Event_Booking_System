import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { venuesApi } from '../../api/organizer';
import { applyServerErrors, getErrorMessage } from '../../lib/errors';
import Button from '../ui/Button';
import { Field, Input } from '../ui/Form';
import Modal from '../ui/Modal';

const optional = (schema) => z.string().trim().transform((v) => v || null).pipe(schema.nullable());

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the venue name').max(160),
  addressLine: z.string().trim().min(3, 'Enter the street address').max(300),
  city: z.string().trim().min(2, 'Enter the city').max(100),
  state: optional(z.string().max(100)),
  pincode: optional(z.string().regex(/^[0-9]{6}$/, 'Enter a 6-digit pincode')),
  capacity: z
    .string()
    .trim()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int('Whole number only').positive('Must be more than 0').nullable()),
  mapUrl: optional(z.string().url('Enter a full link, e.g. https://maps.google.com/...')),
});

const toForm = (venue) => ({
  name: venue?.name ?? '',
  addressLine: venue?.addressLine ?? '',
  city: venue?.city ?? '',
  state: venue?.state ?? '',
  pincode: venue?.pincode ?? '',
  capacity: venue?.capacity ? String(venue.capacity) : '',
  mapUrl: venue?.mapUrl ?? '',
});

export default function VenueFormModal({ open, onClose, venue, onSaved }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: toForm(venue) });

  useEffect(() => {
    if (open) reset(toForm(venue));
  }, [open, venue, reset]);

  const mutation = useMutation({
    mutationFn: (values) => (venue ? venuesApi.update(venue.id, values) : venuesApi.create(values)),
    onSuccess: (saved) => {
      toast.success(venue ? 'Venue updated' : 'Venue added');
      queryClient.invalidateQueries({ queryKey: ['organizer', 'venues'] });
      queryClient.invalidateQueries({ queryKey: ['organizer', 'venue', saved.id] });
      onSaved?.(saved);
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
      title={venue ? 'Edit venue' : 'Add venue'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="venue-form" loading={mutation.isPending}>
            {venue ? 'Save changes' : 'Add venue'}
          </Button>
        </>
      }
    >
      <form id="venue-form" onSubmit={handleSubmit((v) => mutation.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Venue name" required error={errors.name?.message} className="sm:col-span-2">
          {({ id }) => <Input id={id} placeholder="Chowdiah Memorial Hall" error={errors.name} {...register('name')} />}
        </Field>
        <Field label="Street address" required error={errors.addressLine?.message} className="sm:col-span-2">
          {({ id }) => <Input id={id} placeholder="16th Cross, Malleshwaram" error={errors.addressLine} {...register('addressLine')} />}
        </Field>
        <Field label="City" required error={errors.city?.message}>
          {({ id }) => <Input id={id} placeholder="Bengaluru" error={errors.city} {...register('city')} />}
        </Field>
        <Field label="State" error={errors.state?.message}>
          {({ id }) => <Input id={id} placeholder="Karnataka" error={errors.state} {...register('state')} />}
        </Field>
        <Field label="Pincode" error={errors.pincode?.message}>
          {({ id }) => <Input id={id} inputMode="numeric" maxLength={6} error={errors.pincode} {...register('pincode')} />}
        </Field>
        <Field label="Capacity" error={errors.capacity?.message}>
          {({ id }) => <Input id={id} type="number" min="1" error={errors.capacity} {...register('capacity')} />}
        </Field>
        <Field label="Google Maps link" hint="Optional. Shown to attendees as directions." error={errors.mapUrl?.message} className="sm:col-span-2">
          {({ id }) => <Input id={id} type="url" placeholder="https://maps.google.com/..." error={errors.mapUrl} {...register('mapUrl')} />}
        </Field>
      </form>
    </Modal>
  );
}
