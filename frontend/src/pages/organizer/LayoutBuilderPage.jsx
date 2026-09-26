import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Plus, Rows3, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router';
import { orgKeys, venuesApi } from '../../api/organizer';
import Button from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Feedback';
import { Field, Input } from '../../components/ui/Form';
import { PageLoader } from '../../components/ui/Spinner';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import cn from '../../lib/cn';
import { getErrorMessage } from '../../lib/errors';
import { formatNumber } from '../../lib/format';

const MAX_SEATS = 10000;
const SECTION_COLORS = ['bg-violet-100 ring-violet-400', 'bg-sky-100 ring-sky-400', 'bg-emerald-100 ring-emerald-400', 'bg-amber-100 ring-amber-400', 'bg-rose-100 ring-rose-400', 'bg-teal-100 ring-teal-400'];

let uidCounter = 0;
const uid = () => `u${(uidCounter += 1)}`;

/** A, B, ... Z, AA, AB ... */
function labelAt(index) {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function nextRowLabel(sections) {
  const used = new Set(sections.flatMap((s) => s.rows.map((r) => r.label.toUpperCase())));
  for (let i = 0; i < 1000; i += 1) if (!used.has(labelAt(i))) return labelAt(i);
  return '';
}

const toKey = (name) => name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'SECTION';

function fromDefinition(definition) {
  return definition.sections.map((s) => ({
    uid: uid(),
    key: s.key,
    name: s.name,
    rows: s.rows.map((r) => ({ uid: uid(), label: r.label, seats: r.seats, blocked: r.blocked ?? [] })),
  }));
}

function newSection(sections, name) {
  const start = sections.reduce((n, s) => n + s.rows.length, 0);
  return {
    uid: uid(),
    key: null,
    name,
    rows: Array.from({ length: 3 }, (_, i) => ({ uid: uid(), label: labelAt(start + i), seats: 12, blocked: [] })),
  };
}

/** Assigns stable unique keys; existing keys are kept because ticket tiers refer to them. */
function toDefinition(sections) {
  const used = new Set(sections.filter((s) => s.key).map((s) => s.key));
  return {
    sections: sections.map((s) => {
      let key = s.key;
      if (!key) {
        const base = toKey(s.name);
        key = base;
        for (let i = 2; used.has(key); i += 1) key = `${base}_${i}`;
        used.add(key);
      }
      return {
        key,
        name: s.name.trim(),
        rows: s.rows.map((r) => ({ label: r.label.trim(), seats: Number(r.seats), blocked: r.blocked.filter((n) => n <= Number(r.seats)) })),
      };
    }),
  };
}

function validate(name, sections) {
  if (name.trim().length < 2) return 'Give the layout a name (at least 2 characters).';
  if (!sections.length) return 'Add at least one section.';
  for (const s of sections) {
    if (!s.name.trim()) return 'Every section needs a name.';
    if (!s.rows.length) return `Section "${s.name}" has no rows.`;
    const labels = new Set();
    for (const r of s.rows) {
      if (!/^[A-Za-z0-9]{1,10}$/.test(r.label.trim())) return `Row labels in "${s.name}" must be 1-10 letters or digits.`;
      if (labels.has(r.label.trim().toUpperCase())) return `Row "${r.label}" appears twice in "${s.name}".`;
      labels.add(r.label.trim().toUpperCase());
      const seats = Number(r.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 200) return `Row ${r.label} in "${s.name}" must have 1-200 seats.`;
    }
  }
  return null;
}

export default function LayoutBuilderPage() {
  const { venueId: venueIdParam, id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const layoutQuery = useQuery({ queryKey: orgKeys.layout(id), queryFn: () => venuesApi.getLayout(id), enabled: editing });
  const venueId = venueIdParam ?? layoutQuery.data?.venueId;
  const venueQuery = useQuery({ queryKey: orgKeys.venue(venueId), queryFn: () => venuesApi.get(venueId), enabled: Boolean(venueId) });

  const [name, setName] = useState('');
  const [sections, setSections] = useState(() => (editing ? [] : [newSection([], 'Stalls')]));
  const [loaded, setLoaded] = useState(!editing);
  useDocumentTitle(editing ? 'Edit seat layout' : 'New seat layout');

  useEffect(() => {
    if (editing && layoutQuery.data && !loaded) {
      setName(layoutQuery.data.name);
      setSections(fromDefinition(layoutQuery.data.definition));
      setLoaded(true);
    }
  }, [editing, layoutQuery.data, loaded]);

  const locked = Boolean(layoutQuery.data?.inUse);
  const totalSeats = useMemo(
    () => sections.reduce((sum, s) => sum + s.rows.reduce((n, r) => n + Math.max(0, (Number(r.seats) || 0) - r.blocked.filter((b) => b <= Number(r.seats)).length), 0), 0),
    [sections]
  );

  const save = useMutation({
    mutationFn: () => {
      const payload = locked ? { name: name.trim() } : { name: name.trim(), definition: toDefinition(sections) };
      return editing ? venuesApi.updateLayout(id, payload) : venuesApi.createLayout(venueId, payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Seat layout saved' : 'Seat layout created');
      queryClient.invalidateQueries({ queryKey: ['organizer'] });
      navigate(`/organizer/venues/${venueId}`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (editing && (layoutQuery.isLoading || !loaded)) return layoutQuery.isError ? <Alert tone="error">{getErrorMessage(layoutQuery.error)}</Alert> : <PageLoader />;

  const updateSection = (sUid, patch) => setSections((all) => all.map((s) => (s.uid === sUid ? { ...s, ...patch } : s)));
  const updateRow = (sUid, rUid, patch) =>
    setSections((all) => all.map((s) => (s.uid === sUid ? { ...s, rows: s.rows.map((r) => (r.uid === rUid ? { ...r, ...patch } : r)) } : s)));
  const addRow = (sUid) =>
    setSections((all) =>
      all.map((s) => {
        if (s.uid !== sUid) return s;
        const last = s.rows.at(-1);
        return { ...s, rows: [...s.rows, { uid: uid(), label: nextRowLabel(all), seats: last?.seats ?? 12, blocked: [...(last?.blocked ?? [])] }] };
      })
    );
  const toggleSeat = (sUid, rUid, seat) => {
    if (locked) return;
    setSections((all) =>
      all.map((s) =>
        s.uid !== sUid
          ? s
          : { ...s, rows: s.rows.map((r) => (r.uid !== rUid ? r : { ...r, blocked: r.blocked.includes(seat) ? r.blocked.filter((b) => b !== seat) : [...r.blocked, seat].sort((a, b) => a - b) })) }
      )
    );
  };

  const error = locked ? (name.trim().length < 2 ? 'Give the layout a name.' : null) : validate(name, sections) ?? (totalSeats > MAX_SEATS ? `A layout can have at most ${formatNumber(MAX_SEATS)} seats.` : null);

  return (
    <div className="pb-24">
      <Link to={venueId ? `/organizer/venues/${venueId}` : '/organizer/venues'} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {venueQuery.data?.name ?? 'Venue'}
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{editing ? 'Edit seat layout' : 'New seat layout'}</h1>
      <p className="mt-1 text-sm text-slate-500">Add sections and rows, then click seats in the preview to mark aisles or seats that cannot be sold.</p>

      {locked && (
        <Alert tone="warning" title="Seats are locked" className="mt-4">
          A published event uses this layout, so only the name can be changed. Create a new layout for a different seat map.
        </Alert>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        {/* Editor */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardBody>
              <Field label="Layout name" required>
                {({ id: inputId }) => <Input id={inputId} value={name} onChange={(e) => setName(e.target.value)} placeholder="Main auditorium" maxLength={120} />}
              </Field>
            </CardBody>
          </Card>

          {sections.map((section, sIndex) => (
            <Card key={section.uid}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span className={cn('h-3 w-3 rounded-sm ring-1', SECTION_COLORS[sIndex % SECTION_COLORS.length])} />
                    Section {sIndex + 1}
                    {section.key && <span className="font-mono text-xs font-normal text-slate-400">{section.key}</span>}
                  </span>
                }
                action={
                  !locked && (
                    <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => setSections((all) => all.filter((s) => s.uid !== section.uid))} aria-label={`Remove section ${section.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )
                }
              />
              <CardBody className="space-y-3">
                <Field label="Section name">
                  {({ id: inputId }) => (
                    <Input id={inputId} value={section.name} disabled={locked} maxLength={60} onChange={(e) => updateSection(section.uid, { name: e.target.value })} placeholder="VIP, Balcony, Stalls..." />
                  )}
                </Field>
                <div>
                  <div className="mb-1.5 grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-slate-500">
                    <span>Row label</span>
                    <span>Seats</span>
                    <span className="w-9" />
                  </div>
                  <ul className="space-y-2">
                    {section.rows.map((row) => (
                      <li key={row.uid} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                        <Input aria-label="Row label" value={row.label} disabled={locked} maxLength={10} onChange={(e) => updateRow(section.uid, row.uid, { label: e.target.value.toUpperCase() })} />
                        <Input aria-label={`Seats in row ${row.label}`} type="number" min="1" max="200" value={row.seats} disabled={locked} onChange={(e) => updateRow(section.uid, row.uid, { seats: e.target.value })} />
                        <button
                          type="button"
                          disabled={locked || section.rows.length === 1}
                          onClick={() => updateSection(section.uid, { rows: section.rows.filter((r) => r.uid !== row.uid) })}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                          aria-label={`Remove row ${row.label}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!locked && (
                    <Button variant="soft" size="sm" icon={Rows3} className="mt-3" onClick={() => addRow(section.uid)}>
                      Add row
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}

          {!locked && (
            <Button variant="secondary" icon={Plus} className="w-full" onClick={() => setSections((all) => [...all, newSection(all, `Section ${all.length + 1}`)])}>
              Add section
            </Button>
          )}
        </div>

        {/* Preview */}
        <div className="min-w-0">
          <Card className="xl:sticky xl:top-6">
            <CardHeader title="Preview" description={`${formatNumber(totalSeats)} sellable seats`} />
            <div className="overflow-x-auto py-5">
              <div className="mx-auto w-max min-w-full px-4">
                <div className="mx-auto mb-6 w-3/4 max-w-md rounded-b-[50%] bg-gradient-to-b from-slate-300 to-slate-100 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Stage
                </div>
                <div className="space-y-6">
                  {sections.map((section, sIndex) => (
                    <div key={section.uid}>
                      <p className="mb-2 text-center text-xs font-semibold text-slate-600">{section.name || 'Untitled section'}</p>
                      <div className="space-y-1">
                        {section.rows.map((row) => {
                          const count = Math.min(200, Math.max(0, Number(row.seats) || 0));
                          return (
                            <div key={row.uid} className="flex items-center justify-center gap-1">
                              <span className="w-6 text-center text-[10px] font-medium text-slate-400">{row.label}</span>
                              {Array.from({ length: count }, (_, i) => {
                                const seat = i + 1;
                                const blocked = row.blocked.includes(seat);
                                return (
                                  <button
                                    key={seat}
                                    type="button"
                                    onClick={() => toggleSeat(section.uid, row.uid, seat)}
                                    disabled={locked}
                                    title={`${row.label}${seat}${blocked ? ' (not sellable)' : ''}`}
                                    aria-label={`Row ${row.label} seat ${seat}${blocked ? ', marked as gap' : ''}`}
                                    className={cn(
                                      'h-5 w-5 shrink-0 rounded-t-md rounded-b-sm text-[8px] ring-1 ring-inset transition',
                                      blocked ? 'bg-transparent ring-slate-200 ring-dashed' : SECTION_COLORS[sIndex % SECTION_COLORS.length],
                                      !locked && 'hover:scale-110'
                                    )}
                                  />
                                );
                              })}
                              <span className="w-6 text-center text-[10px] font-medium text-slate-400">{row.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {!locked && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Tip: click a seat to turn it into a gap (aisle, pillar or camera position). Click again to restore it.</p>}
          </Card>
        </div>
      </div>

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className={cn('text-sm', error ? 'text-rose-600' : 'text-slate-500')}>
            {error ?? (
              <>
                {locked && <Lock className="mr-1 inline h-3.5 w-3.5" />}
                {formatNumber(totalSeats)} seats in {sections.length} section{sections.length === 1 ? '' : 's'}
              </>
            )}
          </p>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={Boolean(error) || !venueId}>
            {editing ? 'Save layout' : 'Create layout'}
          </Button>
        </div>
      </div>
    </div>
  );
}
