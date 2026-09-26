import { CheckCircle2, Maximize2, XCircle } from 'lucide-react';
import { useState } from 'react';
import cn from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../ui/Feedback';
import Modal from '../ui/Modal';

function TicketCard({ ticket, onEnlarge }) {
  const valid = ticket.status === 'valid';
  const used = Boolean(ticket.checkedInAt);

  return (
    <li className={cn('flex overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200', !valid && 'opacity-70')}>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900">{ticket.tierName}</p>
          {!valid && <Badge tone="red">Cancelled</Badge>}
          {valid && used && <Badge tone="gray">Used</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-600">{ticket.seatLabel ?? 'General admission'}</p>
        <dl className="mt-auto space-y-1 pt-3 text-xs text-slate-500">
          <div className="flex gap-1">
            <dt>Attendee:</dt>
            <dd className="truncate font-medium text-slate-700">{ticket.attendeeName}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Code:</dt>
            <dd className="font-mono font-medium tracking-wide text-slate-700">{ticket.ticketCode}</dd>
          </div>
          {used && (
            <div className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Checked in {formatDateTime(ticket.checkedInAt)}
            </div>
          )}
        </dl>
      </div>

      {/* Perforated edge */}
      <div className="relative w-px border-l-2 border-dashed border-slate-200">
        <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-slate-50 ring-1 ring-slate-200" />
        <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-slate-50 ring-1 ring-slate-200" />
      </div>

      <div className="flex w-32 shrink-0 flex-col items-center justify-center gap-1 p-3 sm:w-36">
        {valid && ticket.qrDataUrl ? (
          <button type="button" onClick={() => onEnlarge(ticket)} className="group relative rounded-lg" aria-label={`Enlarge QR code for ${ticket.ticketCode}`}>
            <img src={ticket.qrDataUrl} alt={`QR code for ticket ${ticket.ticketCode}`} className={cn('h-24 w-24 sm:h-28 sm:w-28', used && 'opacity-40')} />
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/40 group-hover:opacity-100">
              <Maximize2 className="h-6 w-6 text-white" />
            </span>
          </button>
        ) : (
          <XCircle className="h-12 w-12 text-slate-300" aria-hidden="true" />
        )}
        {valid && <span className="text-[11px] text-slate-400">Tap to enlarge</span>}
      </div>
    </li>
  );
}

export default function TicketCards({ tickets, eventTitle }) {
  const [enlarged, setEnlarged] = useState(null);
  return (
    <>
      <ul className="grid gap-4 md:grid-cols-2">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} onEnlarge={setEnlarged} />
        ))}
      </ul>
      <Modal open={Boolean(enlarged)} onClose={() => setEnlarged(null)} title={enlarged?.tierName ?? 'Ticket'} description={eventTitle} size="sm">
        {enlarged && (
          <div className="flex flex-col items-center text-center">
            <img src={enlarged.qrDataUrl} alt={`QR code for ticket ${enlarged.ticketCode}`} className="w-full max-w-xs rounded-xl bg-white p-2 ring-1 ring-slate-200" />
            <p className="mt-3 font-mono text-lg font-semibold tracking-wider text-slate-900">{enlarged.ticketCode}</p>
            <p className="text-sm text-slate-600">
              {enlarged.attendeeName} &middot; {enlarged.seatLabel ?? 'General admission'}
            </p>
            <p className="mt-3 text-xs text-slate-500">Turn up your screen brightness and show this code at the entry gate.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
