import { Link } from 'react-router';
import cn from '../../lib/cn';

export default function Logo({ to = '/', light = false, className }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2 font-bold tracking-tight', light ? 'text-white' : 'text-slate-900', className)}>
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', light ? 'bg-white/15' : 'bg-brand-600')}>
        <svg viewBox="0 0 64 64" className="h-5 w-5" aria-hidden="true">
          <path d="M12 20a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v6a6 6 0 0 0 0 12v6a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4v-6a6 6 0 0 0 0-12z" fill="#fff" />
          <path d="M40 16v32" stroke={light ? '#6366f1' : '#4f46e5'} strokeWidth="3" strokeDasharray="4 4" />
        </svg>
      </span>
      <span className="text-lg">
        Event<span className={light ? 'text-brand-200' : 'text-brand-600'}>Booking</span>
      </span>
    </Link>
  );
}
