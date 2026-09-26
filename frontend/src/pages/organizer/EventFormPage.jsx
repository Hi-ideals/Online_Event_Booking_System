import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Armchair, ArrowLeft, Lock, Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { eventKeys, eventsApi } from '../../api/events';
import { orgEventsApi, orgKeys, venuesApi } from '../../api/organizer';
import VenueFormModal from '../../components/organizer/VenueFormModal';
import Button from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Feedback';
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/Form';
import { PageLoader } from '../../components/ui/Spinner';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import cn from '../../lib/cn';
import { applyServerErrors, getErrorMessage } from '../../lib/errors';
import { fromIstInput, toIstInput } from '../../lib/istDateTime';

const schema = z
  .object({
    title: z.string().trim().min(3, 'At least 3 characters').max(200),
    summary: z.string().trim().max(300),
    description: z.string().trim().max(20000),
    categoryId: z.coerce.number({ invalid_type_error: 'Choose a category' }).int().positive('Choose a category'),
    venueId: z.string().min(1, 'Choose a venue'),
    seatingType: z.enum(['general', 'seated']),
    seatLayoutId: z.string(),
    startAt: z.string().min(1, 'Choose a start date and time'),
    endAt: z.string().min(1, 'Choose an end date and time'),
    tags: z.string(),
    maxTicketsPerOrder: z.coerce.number().int().min(1, 'At least 1').max(50, 'At most 50'),
    refundAllowed: z.boolean(),
    refundCutoffHours: z.coerce.number().int().min(0).max(720, 'At most 720 hours'),
    refundPercent: z.coerce.number().int().min(0).max(100, 'At most 100%'),
  })
  .refine((v) => !v.startAt || !v.endAt || v.endAt > v.startAt, { message: 'End must be after start', path: ['endAt'] })
  .refine((v) => v.seatingType === 'general' || v.seatLayoutId, { message: 'Choose a seat layout', path: ['seatLayoutId'] });

const toForm = (event) => ({
  title: event?.title ?? '',
  summary: event?.summary ?? '',
  description: event?.description ?? '',
  categoryId: event?.category?.id ?? '',
  venueId: event?.venue?.id ?? '',
  seatingType: event?.seatingType ?? 'general',
  seatLayoutId: event?.seatLayoutId ?? '',
  startAt: toIstInput(event?.startAt),
  endAt: toIstInput(event?.endAt),
  tags: event?.tags?.join(', ') ?? '',
  maxTicketsPerOrder: event?.maxTicketsPerOrder ?? 10,
  refundAllowed: event?.refundAllowed ?? true,
  refundCutoffHours: event?.refundCutoffHours ?? 24,
  refundPercent: event?.refundPercent ?? 100,
});

function toPayload(values, { locked, original }) {
  const payload = {
    title: values.title,
    summary: values.summary || null,
    description: values.description || null,
    categoryId: values.categoryId,
    tags: [...new Set(values.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10),
    maxTicketsPerOrder: values.maxTicketsPerOrder,
    refundAllowed: values.refundAllowed,
    refundCutoffHours: values.refundCutoffHours,
    refundPercent: values.refundPercent,
  };
  // Only send times that changed: the API rejects a start time in the past, which an event already under way has.
  if (!original || values.startAt !== toIstInput(original.startAt)) payload.startAt = fromIstInput(values.startAt);
  if (!original || values.endAt !== toIstInput(original.endAt)) payload.endAt = fromIstInput(values.endAt);
  if (!locked) {
    payload.venueId = values.venueId;
    payload.seatingType = values.seatingType;
    payload.seatLayoutId = values.seatingType === 'seated' ? values.seatLayoutId : null;
  }
  return payload;
}

export default function EventFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [venueModal, setVenueModal] = useState(false);
  useDocumentTitle(editing ? 'Edit event' : 'Create event');

  const eventQuery = useQuery({ queryKey: orgKeys.event(id), queryFn: () => orgEventsApi.get(id), enabled: editing });
  const categories = useQuery({ queryKey: eventKeys.categories, queryFn: eventsApi.categories });
  const venues = useQuery({ queryKey: orgKeys.venues({ limit: 100 }), queryFn: () => venuesApi.list({ limit: 100 }) });

  const { register, control, handleSubmit, reset, setValue, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: toForm() });
  const [venueId, seatingType, refundAllowed] = useWatch({ control, name: ['venueId', 'seatingType', 'refundAllowed'] });
  const layouts = useQuery({ queryKey: orgKeys.layouts(venueId), queryFn: () => venuesApi.layouts(venueId), enabled: Boolean(venueId) });

  useEffect(() => {
    if (eventQuery.data) reset(toForm(eventQuery.data));
  }, [eventQuery.data, reset]);

  const event = eventQuery.data;
  const locked = Boolean(event && event.status !== 'draft');
  const closed = event && ['completed', 'cancelled'].includes(event.status);

  const mutation = useMutation({
    mutationFn: (values) => (editing ? orgEventsApi.update(id, toPayload(values, { locked, original: event })) : orgEventsApi.create(toPayload(values, { locked: false }))),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['organizer'] });
      toast.success(editing ? 'Event updated' : 'Draft created. Now add ticket types.');
      navigate(`/organizer/events/${saved.id}${editing ? '' : '?tab=tickets'}`);
    },
    onError: (error) => {
      if (!applyServerErrors(error, setError)) toast.error(getErrorMessage(error));
    },
  });

  if (editing && eventQuery.isLoading) return <PageLoader />;
  if (eventQuery.isError) return <Alert tone="error">{getErrorMessage(eventQuery.error)}</Alert>;
  if (closed) return <Alert tone="warning" title="This event can no longer be edited">{`The event is ${event.status}.`}</Alert>;

  const minStart = toIstInput(new Date(Date.now() + 5 * 60 * 1000).toISOString());

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <Link to={editing ? `/organizer/events/${id}` : '/organizer/events'} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {editing ? 'Back to event' : 'Events'}
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{editing ? 'Edit event' : 'Create event'}</h1>
      <p className="mt-1 text-sm text-slate-500">{editing ? event.title : 'Your event is saved as a draft. You can add tickets and publish it next.'}</p>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-6 space-y-6" noValidate>
        <Card>
          <CardHeader title="Basic details" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Event title" required error={errors.title?.message} className="sm:col-span-2">
              {({ id: fid }) => <Input id={fid} placeholder="Comedy Night with..." error={errors.title} {...register('title')} />}
            </Field>
            <Field label="Category" required error={errors.categoryId?.message}>
              {({ id: fid }) => (
                <Select id={fid} error={errors.categoryId} {...register('categoryId')}>
                  <option value="">Choose a category</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Tags" hint="Comma separated, e.g. stand-up, hindi" error={errors.tags?.message}>
              {({ id: fid }) => <Input id={fid} placeholder="rock, live band" {...register('tags')} />}
            </Field>
            <Field label="Short summary" hint="One line shown on event cards" error={errors.summary?.message} className="sm:col-span-2">
              {({ id: fid }) => <Input id={fid} maxLength={300} error={errors.summary} {...register('summary')} />}
            </Field>
            <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
              {({ id: fid }) => <Textarea id={fid} rows={6} placeholder="What attendees can expect, line-up, entry rules..." error={errors.description} {...register('description')} />}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Date & time" description="India Standard Time (IST)" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" required error={errors.startAt?.message}>
              {({ id: fid }) => <Input id={fid} type="datetime-local" min={minStart} error={errors.startAt} {...register('startAt')} />}
            </Field>
            <Field label="Ends" required error={errors.endAt?.message}>
              {({ id: fid }) => <Input id={fid} type="datetime-local" min={minStart} error={errors.endAt} {...register('endAt')} />}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Venue & seating"
            description={locked ? undefined : 'Choose where the event happens and how people are seated'}
            action={!locked && <Button variant="soft" size="sm" icon={Plus} onClick={() => setVenueModal(true)}>New venue</Button>}
          />
          <CardBody className="space-y-4">
            {locked && (
              <Alert tone="info">
                <Lock className="mr-1 inline h-3.5 w-3.5" /> Venue and seating cannot change after publishing, so issued tickets stay valid.
              </Alert>
            )}
            <Field label="Venue" required error={errors.venueId?.message}>
              {({ id: fid }) => (
                <Select
                  id={fid}
                  disabled={locked}
                  error={errors.venueId}
                  {...register('venueId', { onChange: () => setValue('seatLayoutId', '') })}
                >
                  <option value="">Choose a venue</option>
                  {venues.data?.items.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}, {v.city}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Controller
              control={control}
              name="seatingType"
              render={({ field }) => (
                <fieldset disabled={locked}>
                  <legend className="mb-2 text-sm font-medium text-slate-700">Seating</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { value: 'general', label: 'General admission', text: 'Sell a number of tickets per type. No assigned seats.', icon: Users },
                      { value: 'seated', label: 'Reserved seating', text: 'Attendees pick exact seats on a seat map.', icon: Armchair },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          'flex cursor-pointer gap-3 rounded-xl p-4 ring-1 transition',
                          field.value === opt.value ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-white ring-slate-200 hover:ring-slate-300',
                          locked && 'cursor-not-allowed opacity-70'
                        )}
                      >
                        <input type="radio" className="sr-only" checked={field.value === opt.value} onChange={() => field.onChange(opt.value)} />
                        <opt.icon className={cn('h-5 w-5 shrink-0', field.value === opt.value ? 'text-brand-600' : 'text-slate-400')} />
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">{opt.label}</span>
                          <span className="block text-xs text-slate-500">{opt.text}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            />

            {seatingType === 'seated' && (
              <Field label="Seat layout" required error={errors.seatLayoutId?.message}>
                {({ id: fid }) => (
                  <>
                    <Select id={fid} disabled={locked || !venueId} error={errors.seatLayoutId} {...register('seatLayoutId')}>
                      <option value="">{venueId ? 'Choose a seat layout' : 'Choose a venue first'}</option>
                      {layouts.data?.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.totalSeats} seats)
                        </option>
                      ))}
                    </Select>
                    {venueId && layouts.data?.length === 0 && !locked && (
                      <p className="mt-2 text-xs text-slate-500">
                        This venue has no seat layouts.{' '}
                        <Link to={`/organizer/venues/${venueId}/layouts/new`} className="font-medium text-brand-600 hover:text-brand-700">
                          Design one
                        </Link>
                        , then come back.
                      </p>
                    )}
                  </>
                )}
              </Field>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Booking rules" />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Field label="Max tickets per booking" error={errors.maxTicketsPerOrder?.message}>
              {({ id: fid }) => <Input id={fid} type="number" min="1" max="50" error={errors.maxTicketsPerOrder} {...register('maxTicketsPerOrder')} />}
            </Field>
            <div className="sm:col-span-2 sm:pt-7">
              <Checkbox label="Allow cancellations with refund" description="Attendees can cancel before the cutoff time" {...register('refundAllowed')} />
            </div>
            {refundAllowed && (
              <>
                <Field label="Cancellation cutoff (hours before start)" error={errors.refundCutoffHours?.message}>
                  {({ id: fid }) => <Input id={fid} type="number" min="0" max="720" error={errors.refundCutoffHours} {...register('refundCutoffHours')} />}
                </Field>
                <Field label="Refund percentage" error={errors.refundPercent?.message}>
                  {({ id: fid }) => <Input id={fid} type="number" min="0" max="100" error={errors.refundPercent} {...register('refundPercent')} />}
                </Field>
              </>
            )}
          </CardBody>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" to={editing ? `/organizer/events/${id}` : '/organizer/events'}>
            Cancel
          </Button>
          <Button type="submit" size="lg" loading={mutation.isPending || isSubmitting}>
            {editing ? 'Save changes' : 'Create draft'}
          </Button>
        </div>
      </form>

      <VenueFormModal
        open={venueModal}
        onClose={() => setVenueModal(false)}
        onSaved={(v) => {
          queryClient.invalidateQueries({ queryKey: ['organizer', 'venues'] }).then(() => setValue('venueId', v.id, { shouldValidate: true }));
        }}
      />
    </div>
  );
}
