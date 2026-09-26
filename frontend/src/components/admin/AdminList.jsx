import { Search } from 'lucide-react';
import cn from '../../lib/cn';
import { Card } from '../ui/Card';
import { Alert } from '../ui/Feedback';
import { Input, Select } from '../ui/Form';
import Pagination from '../ui/Pagination';
import { Table } from '../organizer/orgUi';

export function SearchBox({ value, onChange, placeholder = 'Search', className }) {
  return (
    <label className={cn('relative block w-full sm:max-w-xs', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </label>
  );
}

export function FilterSelect({ label, value, onChange, options, allLabel = 'All', className }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn('sm:w-44', className)}>
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/** Card + table + pagination with loading, error and empty states - used by every admin list. */
export function ListCard({ query, columns, empty, onRowClick, footer, children }) {
  const { data, isLoading, isError, error, isFetching } = query;
  return (
    <Card className={cn('overflow-hidden transition-opacity', isFetching && !isLoading && 'opacity-60')}>
      {children}
      {isError ? (
        <div className="p-5">
          <Alert tone="error">{error?.response?.data?.message ?? 'Could not load this list'}</Alert>
        </div>
      ) : isLoading ? (
        <div className="h-48 animate-pulse bg-slate-50" />
      ) : (
        <>
          <Table columns={columns} rows={data.items} empty={empty} onRowClick={onRowClick} />
          {(data.pagination.totalPages > 1 || footer) && (
            <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              {footer}
              <Pagination pagination={data.pagination} onChange={query.onPageChange} className="flex-1" />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
