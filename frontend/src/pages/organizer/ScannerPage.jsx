import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, BarChart3, Camera, CameraOff, CheckCircle2, CloudDownload, CloudUpload, History, Keyboard, QrCode, TriangleAlert, WifiOff, XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useParams } from 'react-router';
import { checkinApi, orgEventsApi, orgKeys } from '../../api/organizer';
import { CheckInLog, CheckInStats } from '../../components/organizer/checkin/CheckInStats';
import { Tabs } from '../../components/organizer/orgUi';
import Button from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Feedback';
import { Input } from '../../components/ui/Form';
import { PageLoader } from '../../components/ui/Spinner';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useQrScanner, { scanFeedback } from '../../hooks/useQrScanner';
import cn from '../../lib/cn';
import { getErrorMessage } from '../../lib/errors';
import { formatDateTime, formatNumber, formatTime } from '../../lib/format';
import { loadManifest, loadQueue, offlineScan, saveManifest, saveQueue } from '../../lib/offlineCheckin';

const RESULT_STYLE = {
  checked_in: { bg: 'bg-emerald-600', icon: CheckCircle2, title: 'Entry allowed' },
  already_checked_in: { bg: 'bg-amber-500', icon: TriangleAlert, title: 'Already used' },
};
const DENIED = { bg: 'bg-rose-600', icon: XCircle, title: 'Entry denied' };

function ResultOverlay({ outcome, onDismiss }) {
  useEffect(() => {
    if (!outcome) return undefined;
    const timer = setTimeout(onDismiss, outcome.allowed ? 2200 : 4000);
    return () => clearTimeout(timer);
  }, [outcome, onDismiss]);

  if (!outcome) return null;
  const style = RESULT_STYLE[outcome.result] ?? DENIED;
  const { ticket } = outcome;
  return (
    <button
      type="button"
      onClick={onDismiss}
      className={cn('fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center text-white', style.bg)}
      aria-live="assertive"
    >
      <style.icon className="h-24 w-24" strokeWidth={1.5} />
      <p className="mt-4 text-3xl font-extrabold sm:text-4xl">{style.title}</p>
      {outcome.message !== style.title && <p className="mt-2 text-lg text-white/90">{outcome.message}</p>}
      {ticket && (
        <div className="mt-6 w-full max-w-sm rounded-2xl bg-white/15 p-4 text-left">
          <p className="text-xl font-bold">{ticket.attendeeName}</p>
          <p className="text-white/90">
            {ticket.tierName}
            {ticket.seatLabel ? ` · ${ticket.seatLabel.split(' - ').pop()}` : ''}
          </p>
          <p className="mt-1 font-mono text-sm text-white/80">{ticket.ticketCode}</p>
        </div>
      )}
      {outcome.offline && <p className="mt-4 flex items-center gap-1 text-sm text-white/80"><WifiOff className="h-4 w-4" /> Saved offline, sync when connected</p>}
      <p className="mt-8 text-sm text-white/70">Tap anywhere to scan the next ticket</p>
    </button>
  );
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function ScannerPage() {
  const { eventId } = useParams();
  const queryClient = useQueryClient();
  const online = useOnline();
  const event = useQuery({ queryKey: orgKeys.event(eventId), queryFn: () => orgEventsApi.get(eventId) });
  useDocumentTitle(event.data ? `Check-in - ${event.data.title}` : 'Check-in');

  const [tab, setTab] = useState('scan');
  const [gate, setGate] = useState(() => localStorage.getItem('checkin-gate') ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  // Ignore camera reads while a result is on screen, so the same ticket is not re-submitted.
  const showingResult = useRef(false);
  const [recent, setRecent] = useState([]);
  const [offlineMode, setOfflineMode] = useState(false);
  const [manifestInfo, setManifestInfo] = useState(() => loadManifest(eventId));
  const [queueSize, setQueueSize] = useState(() => loadQueue(eventId).length);
  const [syncing, setSyncing] = useState(false);
  const offlineActive = offlineMode || !online;

  useEffect(() => {
    try {
      localStorage.setItem('checkin-gate', gate);
    } catch {
      /* ignore */
    }
  }, [gate]);

  const record = useCallback((result) => {
    scanFeedback(result.allowed);
    showingResult.current = true;
    setOutcome(result);
    setRecent((list) => [{ ...result, at: new Date(), key: `${Date.now()}-${Math.random()}` }, ...list].slice(0, 15));
  }, []);

  const submit = useCallback(
    async (input) => {
      if (busy || showingResult.current) return;
      const payload = { ...input, ...(gate.trim() && { gate: gate.trim() }) };
      if (offlineActive) {
        record(offlineScan(eventId, payload));
        setQueueSize(loadQueue(eventId).length);
        return;
      }
      setBusy(true);
      try {
        record(await checkinApi.scan(eventId, payload));
        queryClient.invalidateQueries({ queryKey: ['organizer', 'checkin', eventId] });
      } catch (error) {
        if (!error.response) {
          toast.error('Connection lost. Switch to offline mode to keep scanning.');
        } else {
          toast.error(getErrorMessage(error));
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, gate, offlineActive, eventId, record, queryClient]
  );

  const onDecode = useCallback((data) => submit({ qrToken: data }), [submit]);
  const scanner = useQrScanner(onDecode);

  const submitCode = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    submit({ ticketCode: code.trim() });
    setCode('');
  };

  const downloadManifest = async () => {
    try {
      const manifest = await checkinApi.manifest(eventId);
      if (!saveManifest(eventId, manifest)) throw new Error('Not enough storage on this device');
      setManifestInfo(manifest);
      toast.success(`${formatNumber(manifest.tickets.length)} tickets saved for offline scanning`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const syncQueue = async () => {
    const queue = loadQueue(eventId);
    if (!queue.length) return;
    setSyncing(true);
    try {
      const result = await checkinApi.sync(eventId, { scans: queue, ...(gate.trim() && { gate: gate.trim() }) });
      saveQueue(eventId, []);
      setQueueSize(0);
      const conflicts = result.summary.already_checked_in ?? 0;
      toast.success(`Uploaded ${result.processed} scan(s)${conflicts ? `, ${conflicts} were already used at another gate` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['organizer', 'checkin', eventId] });
      if (manifestInfo) await downloadManifest();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  };

  const dismiss = useCallback(() => {
    showingResult.current = false;
    setOutcome(null);
  }, []);

  // The camera keeps running only while the Scan tab is visible.
  const { stop: stopCamera } = scanner;
  useEffect(() => {
    if (tab !== 'scan') stopCamera();
  }, [tab, stopCamera]);

  if (event.isLoading) return <PageLoader />;
  if (event.isError) return <Alert tone="error">{getErrorMessage(event.error)}</Alert>;
  const ev = event.data;

  return (
    <div>
      <Link to="/organizer/check-in" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Events
      </Link>
      <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{ev.title}</h1>
      <p className="text-sm text-slate-500">
        {formatDateTime(ev.startAt)} &middot; {ev.venue.name}
      </p>

      <Tabs
        className="mt-4 mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'scan', label: 'Scan', icon: QrCode },
          { value: 'stats', label: 'Live stats', icon: BarChart3 },
          { value: 'log', label: 'Scan log', icon: History },
        ]}
      />

      {/* Kept mounted (hidden) so the camera's video element survives tab switches. */}
      <div hidden={tab !== 'scan'}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-4">
            {!online && (
              <Alert tone="warning" title="You are offline">
                {manifestInfo ? 'Scans are checked against the downloaded ticket list and saved on this device.' : 'Download the ticket list while online to scan without internet.'}
              </Alert>
            )}

            <Card className="overflow-hidden">
              <div className="relative aspect-square bg-slate-900 sm:aspect-video">
                <video ref={scanner.videoRef} className={cn('h-full w-full object-cover', !scanner.active && 'invisible')} muted playsInline />
                {!scanner.active && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-slate-300">
                    <Camera className="h-12 w-12" strokeWidth={1.5} />
                    <p className="max-w-xs text-sm">Point the camera at the QR code on the attendee's ticket.</p>
                    <Button size="lg" icon={Camera} loading={scanner.starting} onClick={scanner.start}>
                      Start camera
                    </Button>
                  </div>
                )}
                {busy && <div className="absolute inset-x-0 top-0 h-1 animate-pulse bg-brand-400" />}
                {offlineActive && (
                  <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white">
                    <WifiOff className="h-3.5 w-3.5" /> Offline mode
                  </span>
                )}
              </div>
              {scanner.active && (
                <div className="flex justify-end border-t border-slate-100 p-2">
                  <Button variant="ghost" size="sm" icon={CameraOff} onClick={scanner.stop}>
                    Stop camera
                  </Button>
                </div>
              )}
            </Card>
            {scanner.error && <Alert tone="warning">{scanner.error}</Alert>}

            <Card>
              <CardBody>
                <form onSubmit={submitCode} className="flex gap-2">
                  <label className="relative flex-1">
                    <span className="sr-only">Ticket code</span>
                    <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Type ticket code, e.g. TKT-7KQ2-M9XD" className="pl-9 font-mono uppercase" autoComplete="off" />
                  </label>
                  <Button type="submit" loading={busy} disabled={!code.trim()}>
                    Check
                  </Button>
                </form>
              </CardBody>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardBody className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Gate name</span>
                  <Input value={gate} onChange={(e) => setGate(e.target.value)} placeholder="e.g. Gate A" maxLength={60} />
                </label>
                <div className="border-t border-slate-100 pt-4">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span>
                      <span className="block text-sm font-medium text-slate-700">Offline mode</span>
                      <span className="block text-xs text-slate-500">For gates with poor internet</span>
                    </span>
                    <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={offlineActive} disabled={!online} onChange={(e) => setOfflineMode(e.target.checked)} />
                  </label>
                  <p className="mt-2 text-xs text-slate-500">
                    {manifestInfo ? `Ticket list saved ${formatTime(manifestInfo.generatedAt)} (${formatNumber(manifestInfo.tickets.length)} tickets)` : 'No ticket list on this device yet.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" icon={CloudDownload} disabled={!online} onClick={downloadManifest}>
                      {manifestInfo ? 'Refresh list' : 'Download list'}
                    </Button>
                    <Button variant={queueSize ? 'primary' : 'secondary'} size="sm" icon={CloudUpload} disabled={!online || !queueSize} loading={syncing} onClick={syncQueue}>
                      Upload {queueSize} scan{queueSize === 1 ? '' : 's'}
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">This session</div>
              {recent.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Scanned tickets appear here.</p>
              ) : (
                <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                  {recent.map((r) => (
                    <li key={r.key} className="flex items-center gap-3 px-4 py-2.5">
                      {r.allowed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : r.result === 'already_checked_in' ? <TriangleAlert className="h-5 w-5 shrink-0 text-amber-500" /> : <XCircle className="h-5 w-5 shrink-0 text-rose-600" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{r.ticket?.attendeeName ?? r.message}</p>
                        <p className="truncate text-xs text-slate-500">
                          {r.ticket ? `${r.ticket.tierName} · ${r.message}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">{formatTime(r.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      </div>

      {tab === 'stats' && <CheckInStats eventId={eventId} />}
      {tab === 'log' && <CheckInLog eventId={eventId} />}

      <ResultOverlay outcome={outcome} onDismiss={dismiss} />
    </div>
  );
}
