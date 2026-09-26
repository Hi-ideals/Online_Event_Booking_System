import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Users } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { checkinApi, orgKeys } from '../../../api/organizer';
import cn from '../../../lib/cn';
import { getErrorMessage } from '../../../lib/errors';
import { formatDateTime, formatNumber, formatTime } from '../../../lib/format';
import ColumnChart from '../../charts/ColumnChart';
import Button from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { Alert, Badge } from '../../ui/Feedback';
import { Select } from '../../ui/Form';
import Pagination from '../../ui/Pagination';

export const RESULT_UI = {
  checked_in: { label: 'Entry allowed', tone: 'green' },
  already_checked_in: { label: 'Already used', tone: 'amber' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  wrong_event: { label: 'Wrong event', tone: 'red' },
  invalid: { label: 'Invalid', tone: 'red' },
  not_open: { label: 'Not open', tone: 'gray' },
  undone: { label: 'Undone', tone: 'gray' },
};

function Meter({ value, total, label, detail }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium text-slate-700">{label}</span>
        <span className="shrink-0 tabular-nums text-slate-500">{detail ?? `${formatNumber(value)} / ${formatNumber(total)}`}</span>
      </div>
      {/* Track is a lighter step of the same hue as the fill. */}
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={label}>
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CheckInStats({ eventId }) {
  const { data: stats, isLoading, isError, error } = useQuery({
    queryKey: orgKeys.checkinStats(eventId),
    queryFn: () => checkinApi.stats(eventId),
    refetchInterval: 10000,
  });

  if (isError) return <Alert tone="error">{getErrorMessage(error)}</Alert>;
  if (isLoading) return <div className="h-64 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />;

  const arrivals = stats.arrivals.map((a) => ({ label: formatTime(a.slot), tooltipLabel: `${formatTime(a.slot)} - ${formatTime(new Date(new Date(a.slot).getTime() + 15 * 60000))}`, value: a.checkedIn }));

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-slate-500">Checked in</p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
            {formatNumber(stats.checkedIn)}
            <span className="text-lg font-medium text-slate-400"> / {formatNumber(stats.totalTickets)}</span>
          </p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.attendanceRate} aria-label="Attendance">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${stats.attendanceRate}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-sm text-slate-500">
            <span>{stats.attendanceRate}% arrived</span>
            <span>{formatNumber(stats.remaining)} still to come</span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="By ticket type" />
        <CardBody className="space-y-4">
          {stats.byTier.map((t) => (
            <Meter key={t.tierId} label={t.name} value={t.checkedIn} total={t.total} />
          ))}
        </CardBody>
      </Card>

      {stats.byGate.length > 0 && (
        <Card>
          <CardHeader title="By gate" />
          <CardBody className="space-y-4">
            {stats.byGate.map((g) => (
              <Meter key={g.gate} label={g.gate} value={g.checkedIn} total={stats.checkedIn} detail={formatNumber(g.checkedIn)} />
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Arrivals" description="Check-ins per 15 minutes" />
        <CardBody>
          {arrivals.length ? <ColumnChart data={arrivals} title="Arrivals per 15 minutes" height={160} /> : <p className="py-6 text-center text-sm text-slate-500">No check-ins yet.</p>}
        </CardBody>
      </Card>

      {Object.keys(stats.scanResults).length > 0 && (
        <Card>
          <CardHeader title="Scan results" />
          <CardBody className="flex flex-wrap gap-2">
            {Object.entries(stats.scanResults).map(([result, count]) => (
              <Badge key={result} tone={RESULT_UI[result]?.tone}>
                {RESULT_UI[result]?.label ?? result}: {formatNumber(count)}
              </Badge>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export function CheckInLog({ eventId }) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);
  const [undoing, setUndoing] = useState(null);
  const params = { result, page, limit: 20 };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: orgKeys.checkinLogs(eventId, params),
    queryFn: () => checkinApi.logs(eventId, params),
    refetchInterval: 15000,
  });

  const undo = useMutation({
    mutationFn: (reason) => checkinApi.undo(eventId, undoing.ticketId, reason),
    onSuccess: () => {
      toast.success('Check-in undone. The ticket can be scanned again.');
      queryClient.invalidateQueries({ queryKey: ['organizer', 'checkin', eventId] });
      setUndoing(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setUndoing(null);
    },
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Scan log"
        description="Every scan, newest first"
        action={
          <Select
            aria-label="Filter by result"
            value={result}
            onChange={(e) => {
              setResult(e.target.value);
              setPage(1);
            }}
            className="w-44"
          >
            <option value="">All results</option>
            {Object.entries(RESULT_UI).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        }
      />
      {isError ? (
        <div className="p-5">
          <Alert tone="error">{getErrorMessage(error)}</Alert>
        </div>
      ) : isLoading ? (
        <div className="h-40 animate-pulse bg-slate-50" />
      ) : data.items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">No scans yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.items.map((log) => (
            <li key={log.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={RESULT_UI[log.result]?.tone}>{RESULT_UI[log.result]?.label ?? log.result}</Badge>
                  <span className="truncate text-sm font-medium text-slate-900">{log.attendeeName ?? 'Unknown ticket'}</span>
                  {log.ticketCode && <span className="font-mono text-xs text-slate-500">{log.ticketCode}</span>}
                </div>
                <p className={cn('mt-0.5 text-xs text-slate-500')}>
                  {formatDateTime(log.scannedAt)}
                  {log.gate && ` · ${log.gate}`}
                  {log.scannedBy && ` · ${log.scannedBy}`}
                  {log.method === 'offline_sync' && ' · offline'}
                  {log.note && ` · ${log.note}`}
                </p>
              </div>
              {log.result === 'checked_in' && log.ticketId && (
                <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setUndoing(log)}>
                  Undo
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && (
        <div className="border-t border-slate-100 px-5 py-3">
          <Pagination pagination={data.pagination} onChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(undoing)}
        onClose={() => setUndoing(null)}
        onConfirm={(reason) => undo.mutate(reason)}
        loading={undo.isPending}
        title="Undo this check-in?"
        confirmLabel="Undo check-in"
        tone="primary"
        reasonLabel="Reason"
        reasonMinLength={3}
      >
        <p className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" /> {undoing?.attendeeName} ({undoing?.ticketCode})
        </p>
        <p>The ticket becomes valid again and can be scanned at the gate.</p>
      </ConfirmDialog>
    </Card>
  );
}
