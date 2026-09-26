import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Circle, ExternalLink, ImagePlus, Pencil, PlayCircle, Rocket, StopCircle, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { orgEventsApi, orgKeys } from '../../../api/organizer';
import { getErrorMessage } from '../../../lib/errors';
import { formatDate, formatDateTime, formatNumber, formatTime, titleCase } from '../../../lib/format';
import { EventBanner } from '../../events/EventCard';
import Button from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { Alert } from '../../ui/Feedback';

const MAX_BANNER_MB = 5;

function Checklist({ event }) {
  const tiersReady = event.tiers.length > 0 && (event.seatingType === 'general' ? event.tiers.every((t) => t.quantity > 0) : event.tiers.every((t) => t.sectionKeys.length > 0));
  const items = [
    { done: true, label: 'Event details added' },
    { done: event.seatingType === 'general' || Boolean(event.seatLayoutId), label: 'Seat layout selected' },
    { done: tiersReady, label: event.seatingType === 'seated' ? 'Every ticket type has seat sections' : 'At least one ticket type with quantity' },
    { done: new Date(event.startAt) > new Date(), label: 'Start time is in the future' },
    { done: Boolean(event.bannerUrl), label: 'Banner image (recommended)', optional: true },
  ];
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          {item.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className={item.optional ? 'h-4 w-4 text-slate-300' : 'h-4 w-4 text-amber-500'} />}
          <span className={item.done ? 'text-slate-700' : 'text-slate-500'}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export default function OverviewTab({ event }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [dialog, setDialog] = useState(null); // 'publish' | 'close' | 'reopen' | 'cancel' | 'delete'

  const onEvent = (updated, message) => {
    queryClient.setQueryData(orgKeys.event(event.id), (old) => ({ ...old, ...updated }));
    queryClient.invalidateQueries({ queryKey: ['organizer'] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    toast.success(message);
    setDialog(null);
  };
  const onError = (error) => {
    toast.error(getErrorMessage(error));
    setDialog(null);
  };

  const action = useMutation({
    mutationFn: ({ type, reason }) => {
      switch (type) {
        case 'publish': return orgEventsApi.publish(event.id);
        case 'close': return orgEventsApi.closeSales(event.id);
        case 'reopen': return orgEventsApi.reopenSales(event.id);
        case 'cancel': return orgEventsApi.cancel(event.id, reason);
        default: return orgEventsApi.remove(event.id);
      }
    },
    onSuccess: (updated, { type }) => {
      if (type === 'delete') {
        toast.success('Draft deleted');
        queryClient.invalidateQueries({ queryKey: ['organizer'] });
        navigate('/organizer/events', { replace: true });
        return;
      }
      const messages = { publish: 'Event published! Tickets are on sale.', close: 'Ticket sales closed', reopen: 'Ticket sales reopened', cancel: 'Event cancelled. Attendees will be refunded.' };
      onEvent(updated, messages[type]);
    },
    onError,
  });

  const banner = useMutation({
    mutationFn: (file) => orgEventsApi.uploadBanner(event.id, file),
    onSuccess: (updated) => onEvent(updated, 'Banner updated'),
    onError,
  });

  const pickBanner = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast.error('Use a JPG, PNG or WEBP image');
    if (file.size > MAX_BANNER_MB * 1024 * 1024) return toast.error(`Image must be smaller than ${MAX_BANNER_MB} MB`);
    banner.mutate(file);
  };

  const run = (type, reason) => action.mutate({ type, reason });
  const { status } = event;
  const editable = !['completed', 'cancelled'].includes(status);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
        {event.isBlocked && (
          <Alert tone="error" title="Blocked by the platform admin">
            {event.blockedReason} This event is hidden from attendees. Contact support to resolve it.
          </Alert>
        )}
        {status === 'cancelled' && (
          <Alert tone="error" title="Event cancelled">
            {event.cancellationReason} &middot; {formatDateTime(event.cancelledAt)}. Paid attendees were refunded automatically.
          </Alert>
        )}

        <Card className="overflow-hidden">
          <div className="relative">
            <EventBanner event={event} className="aspect-[21/9] w-full" iconClassName="h-14 w-14" />
            {editable && (
              <div className="absolute bottom-3 right-3">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickBanner} />
                <Button size="sm" variant="secondary" icon={ImagePlus} loading={banner.isPending} onClick={() => fileRef.current?.click()}>
                  {event.bannerUrl ? 'Change banner' : 'Upload banner'}
                </Button>
              </div>
            )}
          </div>
          <CardBody>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Date & time</dt>
                <dd className="font-medium text-slate-900">
                  {formatDate(event.startAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, {formatTime(event.startAt)} - {formatTime(event.endAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Venue</dt>
                <dd className="font-medium text-slate-900">
                  {event.venue.name}, {event.venue.city}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Category</dt>
                <dd className="font-medium text-slate-900">{event.category.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Seating</dt>
                <dd className="font-medium text-slate-900">
                  {event.seatingType === 'seated' ? `Reserved (${event.seatLayout?.name ?? 'no layout'})` : 'General admission'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Tickets sold</dt>
                <dd className="font-medium text-slate-900">
                  {formatNumber(event.ticketsSold)} of {formatNumber(event.totalTickets)}
                  {event.ticketsHeld > 0 && <span className="font-normal text-slate-500"> ({event.ticketsHeld} in checkout)</span>}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Cancellation policy</dt>
                <dd className="font-medium text-slate-900">
                  {event.refundAllowed ? `${event.refundPercent}% refund until ${event.refundCutoffHours}h before` : 'No refunds'}
                </dd>
              </div>
            </dl>
            {event.summary && <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600">{event.summary}</p>}
          </CardBody>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader title="Status" description={titleCase(status)} />
          <CardBody className="space-y-3">
            {status === 'draft' && (
              <>
                <Checklist event={event} />
                <Button className="w-full" icon={Rocket} disabled={event.isBlocked} onClick={() => setDialog('publish')}>
                  Publish event
                </Button>
              </>
            )}
            {status === 'published' && (
              <>
                <p className="text-sm text-slate-600">Tickets are on sale.</p>
                <Button to={`/events/${event.slug}`} target="_blank" variant="secondary" className="w-full" icon={ExternalLink}>
                  View public page
                </Button>
                <Button variant="secondary" className="w-full" icon={StopCircle} onClick={() => setDialog('close')}>
                  Close ticket sales
                </Button>
              </>
            )}
            {status === 'sales_closed' && (
              <Button variant="secondary" className="w-full" icon={PlayCircle} onClick={() => setDialog('reopen')}>
                Reopen ticket sales
              </Button>
            )}
            {editable && (
              <Button to={`/organizer/events/${event.id}/edit`} variant="secondary" className="w-full" icon={Pencil}>
                Edit details
              </Button>
            )}
            {['published', 'sales_closed'].includes(status) && (
              <Button variant="ghost" className="w-full text-rose-600 hover:bg-rose-50" icon={Ban} onClick={() => setDialog('cancel')}>
                Cancel event
              </Button>
            )}
            {status === 'draft' && (
              <Button variant="ghost" className="w-full text-rose-600 hover:bg-rose-50" icon={Trash2} onClick={() => setDialog('delete')}>
                Delete draft
              </Button>
            )}
          </CardBody>
        </Card>
      </aside>

      <ConfirmDialog open={dialog === 'publish'} onClose={() => setDialog(null)} onConfirm={() => run('publish')} loading={action.isPending} tone="primary" title="Publish this event?" confirmLabel="Publish">
        Attendees will be able to find and book it immediately. Venue, seating and seat layout cannot be changed after publishing.
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'close'} onClose={() => setDialog(null)} onConfirm={() => run('close')} loading={action.isPending} tone="primary" title="Close ticket sales?" confirmLabel="Close sales">
        The event stays visible but nobody can buy new tickets. You can reopen sales later.
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'reopen'} onClose={() => setDialog(null)} onConfirm={() => run('reopen')} loading={action.isPending} tone="primary" title="Reopen ticket sales?" confirmLabel="Reopen">
        Attendees will be able to book tickets again.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => run('cancel', reason)}
        loading={action.isPending}
        title="Cancel this event?"
        confirmLabel="Cancel event"
        reasonLabel="Reason shown to attendees"
        reasonMinLength={5}
      >
        <Alert tone="error">
          This cannot be undone. All {formatNumber(event.ticketsSold)} sold ticket(s) will be cancelled and every paid attendee gets a full refund automatically.
        </Alert>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} onConfirm={() => run('delete')} loading={action.isPending} title="Delete this draft?" confirmLabel="Delete">
        The draft and its ticket types will be removed permanently.
      </ConfirmDialog>
    </div>
  );
}
