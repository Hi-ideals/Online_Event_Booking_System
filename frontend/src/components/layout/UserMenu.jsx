import { ChevronDown, LayoutDashboard, LogOut, Shield, Ticket, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { initials } from '../../lib/format';

export function Avatar({ name, className = 'h-8 w-8 text-xs' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ${className}`}>
      {initials(name) || '?'}
    </span>
  );
}

/** Role-specific links shown in the user menu and the mobile drawer. */
export function accountLinks(user) {
  const links = [];
  if (user.role === 'attendee') links.push({ to: '/bookings', label: 'My bookings', icon: Ticket });
  if (user.role === 'organizer') links.push({ to: '/organizer', label: 'Organizer dashboard', icon: LayoutDashboard });
  if (user.role === 'admin') links.push({ to: '/admin', label: 'Admin console', icon: Shield });
  links.push({ to: '/account', label: 'Account settings', icon: UserRound });
  return links;
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={user.name} />
        <span className="hidden max-w-32 truncate text-sm font-medium text-slate-700 md:block">{user.name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <div className="py-1">
            {accountLinks(user).map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <Icon className="h-4 w-4 text-slate-400" />
                {label}
              </Link>
            ))}
          </div>
          <button onClick={handleLogout} role="menuitem" className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50">
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
