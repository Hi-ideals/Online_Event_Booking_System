import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Armchair, ArrowLeft, ExternalLink, LayoutGrid, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router';
import { orgKeys, venuesApi } from '../../api/organizer';
import VenueFormModal from '../../components/organizer/VenueFormModal';
import Button from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { PageLoader } from '../../components/ui/Spinner';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';
import { formatDate, formatNumber } from '../../lib/format';

export default function VenueDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // { type: 'venue' } | { type: 'layout', layout }

  const venue = useQuery({ queryKey: orgKeys.venue(id), queryFn: () => venuesApi.get(id) });
  const layouts = useQuery({ queryKey: orgKeys.layouts(id), queryFn: () => venuesApi.layouts(id) });
  useDocumentTitle(venue.data?.name ?? 'Venue');

  const remove = useMutation({
    mutationFn: () => (confirm.type === 'venue' ? venuesApi.remove(id) : venuesApi.removeLayout(confirm.layout.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer'] });
      if (confirm.type === 'venue') {
        toast.success('Venue deleted');
        navigate('/organizer/venues', { replace: true });
      } else {
        toast.success('Seat layout deleted');
      }
      setConfirm(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setConfirm(null);
    },
  });

  if (venue.isLoading) return <PageLoader />;
  if (venue.isError) return <Alert tone="error">{getErrorMessage(venue.error)}</Alert>;
  const v = venue.data;

  return (
    <div>
      <Link to="/organizer/venues" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Venues
      </Link>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{v.name}</h1>
          <p className="mt-1 text-slate-500">
            {v.addressLine}, {v.city}
            {v.state ? `, ${v.state}` : ''}
            {v.pincode ? ` - ${v.pincode}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            {v.capacity && <span>Capacity {formatNumber(v.capacity)}</span>}
            <span>{v.eventCount} event{v.eventCount === 1 ? '' : 's'}</span>
            {v.mapUrl && (
              <a href={v.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700">
                Map <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Delete venue"
            className="text-rose-600"
            disabled={v.eventCount > 0}
            title={v.eventCount > 0 ? 'Venues used by events cannot be deleted' : 'Delete venue'}
            onClick={() => setConfirm({ type: 'venue' })}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Seat layouts"
          description="Needed only for events with reserved seating"
          action={<Button to={`/organizer/venues/${id}/layouts/new`} icon={Plus}>New seat layout</Button>}
        />
        {layouts.isLoading ? (
          <div className="h-32 animate-pulse bg-slate-50" />
        ) : layouts.data.length === 0 ? (
          <EmptyState icon={LayoutGrid} title="No seat layouts" description="Design a seat map with sections, rows and aisles. General admission events do not need one." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {layouts.data.map((layout) => (
              <li key={layout.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    <Armchair className="h-4 w-4 text-brand-600" />
                    {layout.name}
                    {layout.inUse && (
                      <Badge tone="amber">
                        <Lock className="h-3 w-3" /> Used by a published event
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {formatNumber(layout.totalSeats)} seats &middot; {layout.definition.sections.length} section{layout.definition.sections.length === 1 ? '' : 's'} &middot; Updated {formatDate(layout.updatedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button to={`/organizer/layouts/${layout.id}`} variant="secondary" size="sm" icon={layout.inUse ? LayoutGrid : Pencil}>
                    {layout.inUse ? 'View' : 'Edit'}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-rose-600" disabled={layout.inUse} onClick={() => setConfirm({ type: 'layout', layout })} aria-label={`Delete ${layout.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <VenueFormModal open={editOpen} onClose={() => setEditOpen(false)} venue={v} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={confirm?.type === 'venue' ? 'Delete this venue?' : `Delete "${confirm?.layout?.name}"?`}
        confirmLabel="Delete"
      >
        This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
