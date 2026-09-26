import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi, adminKeys } from '../../api/admin';
import { FilterSelect, ListCard, SearchBox } from '../../components/admin/AdminList';
import { Alert, Badge, PageHeader } from '../../components/ui/Feedback';
import useDebounced from '../../hooks/useDebounced';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDateTime, titleCase } from '../../lib/format';

const STATUS_TONE = { sent: 'green', queued: 'amber', failed: 'red' };
const TEMPLATES = [
  'welcome',
  'organizer_pending',
  'organizer_approved',
  'organizer_rejected',
  'booking_confirmed',
  'booking_cancelled',
  'refund_processed',
  'refund_request_resolved',
  'event_reminder',
  'payout_paid',
].map((value) => ({ value, label: titleCase(value) }));

export default function EmailsPage() {
  useDocumentTitle('Email log');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [template, setTemplate] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(to);

  const query = { to: q.trim(), status, template, page, limit: 20 };
  const list = useQuery({ queryKey: adminKeys.emails(query), queryFn: () => adminApi.emails(query), placeholderData: keepPreviousData });

  const columns = [
    { key: 'template', label: 'Email', render: (m) => <span className="block min-w-40"><span className="font-medium text-slate-900">{titleCase(m.template)}</span><span className="block truncate text-xs text-slate-500">{m.subject ?? '-'}</span></span> },
    { key: 'to', label: 'To', render: (m) => <span className="block max-w-48 truncate">{m.to}</span> },
    {
      key: 'status',
      label: 'Status',
      render: (m) => (
        <span className="block">
          <Badge tone={STATUS_TONE[m.status]}>{titleCase(m.status)}</Badge>
          {m.error && <span className="mt-0.5 block max-w-56 text-xs text-slate-500">{m.error}</span>}
        </span>
      ),
    },
    { key: 'attempts', label: 'Attempts', align: 'right', render: (m) => m.attempts },
    { key: 'sentAt', label: 'When', render: (m) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(m.sentAt ?? m.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Email log" description="Every email the platform queued, with delivery status" />

      <Alert tone="info" className="mb-4">
        In development, emails are saved as <code>.eml</code> files in <code>backend/storage/emails</code> instead of being sent. Set SMTP details in the backend <code>.env</code> to send real email.
      </Alert>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchBox value={to} onChange={(v) => { setTo(v); setPage(1); }} placeholder="Search recipient email" />
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} allLabel="All statuses" options={[{ value: 'sent', label: 'Sent' }, { value: 'queued', label: 'Queued' }, { value: 'failed', label: 'Failed or skipped' }]} />
        <FilterSelect label="Email type" value={template} onChange={(v) => { setTemplate(v); setPage(1); }} allLabel="All types" options={TEMPLATES} />
      </div>

      <ListCard query={{ ...list, onPageChange: setPage }} columns={columns} empty="No emails yet." />
    </div>
  );
}
