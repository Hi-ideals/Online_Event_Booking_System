import { useId, useMemo, useState } from 'react';
import cn from '../../lib/cn';

/** Rounds the axis maximum up to a clean number: 1, 2, 5 x 10^n. */
function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value);
  return step * magnitude;
}

/**
 * Single-series column chart (one colour, one axis).
 * data: [{ label, value, tooltip? }]. Hover or focus a column for its value; a table view is always available.
 */
export default function ColumnChart({ data, formatValue = String, height = 200, labelEvery, title, className }) {
  const [active, setActive] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.value))), [data]);
  const ticks = [0, max / 2, max];
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 8));
  const empty = data.every((d) => !d.value);

  return (
    <div className={className}>
      <div className="flex">
        {/* Y axis */}
        <div className="relative mr-2 w-12 shrink-0 text-right text-[11px] tabular-nums text-slate-400" style={{ height }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>
              {formatValue(t)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative min-w-0 flex-1">
          <div className="relative" style={{ height }} role="img" aria-label={`${title ?? 'Chart'}. Use the table view for exact values.`}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-slate-100" style={{ top: `${(1 - t / max) * 100}%` }} aria-hidden="true" />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {data.map((d, i) => {
                const pct = (d.value / max) * 100;
                return (
                  <div
                    key={`${d.label}-${i}`}
                    className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    tabIndex={0}
                    aria-label={`${d.label}: ${formatValue(d.value)}`}
                  >
                    <div
                      className={cn('w-full max-w-6 rounded-t transition-colors', active === i ? 'bg-brand-700' : 'bg-brand-500')}
                      style={{ height: d.value > 0 ? `max(${pct}%, 2px)` : 0 }}
                    />
                    {active === i && (
                      <div
                        className={cn(
                          'pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg',
                          i < data.length / 3 ? 'left-0' : i > (data.length * 2) / 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                        )}
                        style={{ bottom: `${Math.min(pct, 85)}%` }}
                      >
                        <p className="text-slate-300">{d.tooltipLabel ?? d.label}</p>
                        <p className="font-semibold">{formatValue(d.value)}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {empty && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">No data in this period</p>}
          </div>
          {/* X labels */}
          <div className="mt-2 flex gap-[2px] text-[11px] text-slate-400" aria-hidden="true">
            {data.map((d, i) => (
              <span key={`${d.label}-${i}`} className="flex-1 truncate text-center">
                {i % every === 0 ? d.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} aria-controls={tableId} className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700">
        {showTable ? 'Hide table' : 'View as table'}
      </button>
      {showTable && (
        <div id={tableId} className="mt-2 max-h-60 overflow-auto rounded-lg ring-1 ring-slate-200">
          <table className="min-w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {data.map((d, i) => (
                <tr key={`${d.label}-${i}`}>
                  <td className="px-3 py-1.5 text-slate-600">{d.tooltipLabel ?? d.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{formatValue(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
