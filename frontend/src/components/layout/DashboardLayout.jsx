import { ExternalLink, LogOut, Menu, X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import cn from '../../lib/cn';
import { PageLoader } from '../ui/Spinner';
import Logo from './Logo';
import { Avatar } from './UserMenu';

/**
 * Sidebar layout for the organizer dashboard and admin console.
 * `sections` = [{ title?, items: [{ to, label, icon, end? }] }]
 */
export default function DashboardLayout({ sections, title, homePath }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo to={homePath} />
        <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="px-5 pb-2 text-xs font-semibold uppercase tracking-wider text-brand-600">{title}</p>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section, i) => (
          <div key={section.title ?? i} className="mt-4 first:mt-2">
            {section.title && <p className="mb-1 px-3 text-xs font-medium text-slate-400">{section.title}</p>}
            <ul className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <NavLink to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          <ExternalLink className="h-[18px] w-[18px]" />
          View website
        </NavLink>
        <div className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <NavLink to="/account" className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700">
              {user.name}
            </NavLink>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate('/');
            }}
            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-slate-900">{title}</span>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
