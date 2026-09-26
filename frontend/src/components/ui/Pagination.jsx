import { ChevronLeft, ChevronRight } from 'lucide-react';
import cn from '../../lib/cn';

/** Page numbers with ellipses: 1 ... 4 5 6 ... 12 */
function pageList(page, totalPages) {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ['gap', p] : [p]));
}

export default function Pagination({ pagination, onChange, className }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total, limit } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const btn = 'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium';

  return (
    <nav className={cn('flex flex-col items-center justify-between gap-3 sm:flex-row', className)} aria-label="Pagination">
      <p className="text-sm text-slate-500">
        Showing <span className="font-medium text-slate-700">{from}</span>-<span className="font-medium text-slate-700">{to}</span> of{' '}
        <span className="font-medium text-slate-700">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button className={cn(btn, 'text-slate-600 hover:bg-slate-100 disabled:opacity-40')} onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageList(page, totalPages).map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(btn, p === page ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              {p}
            </button>
          )
        )}
        <button className={cn(btn, 'text-slate-600 hover:bg-slate-100 disabled:opacity-40')} onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
