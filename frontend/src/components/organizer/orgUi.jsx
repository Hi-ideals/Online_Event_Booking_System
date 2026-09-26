import cn from '../../lib/cn';
import { Badge } from '../ui/Feedback';

const EVENT_STATUS = {
  draft: ['gray', 'Draft'],
  published: ['green', 'On sale'],
  sales_closed: ['amber', 'Sales closed'],
  completed: ['blue', 'Completed'],
  cancelled: ['red', 'Cancelled'],
};

export function EventStatusBadge({ status, blocked }) {
  if (blocked) return <Badge tone="red">Blocked by admin</Badge>;
  const [tone, label] = EVENT_STATUS[status] ?? ['gray', status];
  return <Badge tone={tone}>{label}</Badge>;
}

export const EVENT_STATUS_OPTIONS = Object.entries(EVENT_STATUS).map(([value, [, label]]) => ({ value, label }));

/** KPI tile for dashboards. */
export function StatCard({ label, value, hint, icon: Icon, tone = 'brand', className }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-sky-50 text-sky-600',
    rose: 'bg-rose-50 text-rose-600',
  };
  return (
    <div className={cn('rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Horizontal tabs driven by a value; scrolls sideways on phones. */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <div className="flex min-w-max gap-1 border-b border-slate-200" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={value === tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition',
              value === tab.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {tab.icon && <tab.icon className="h-4 w-4" />}
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-xs', value === tab.value ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500')}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Simple responsive table wrapper: scrolls sideways on small screens. */
export function Table({ columns, rows, rowKey = 'id', empty, onRowClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50/80">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', c.align === 'right' && 'text-right', c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                {empty ?? 'Nothing to show'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row[rowKey]} onClick={onRowClick ? () => onRowClick(row) : undefined} className={cn(onRowClick && 'cursor-pointer hover:bg-slate-50')}>
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 align-middle text-slate-700', c.align === 'right' && 'text-right tabular-nums', c.cellClassName)}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
