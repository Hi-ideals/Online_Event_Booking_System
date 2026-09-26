import { LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import cn from '../../lib/cn';
import Button from '../ui/Button';
import Logo from './Logo';
import UserMenu, { accountLinks, Avatar } from './UserMenu';

const NAV = [
  { to: '/events', label: 'Explore events' },
  { to: '/events?sort=popular', label: 'Trending' },
];

const navLinkClass = ({ isActive }) =>
  cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'text-brand-700' : 'text-slate-600 hover:text-slate-900');

export default function Navbar() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setMobileOpen(false), [location.pathname, location.search]);

  const loginLink = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <nav className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Logo />
          <div className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink key={item.label} to={item.to} end className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <UserMenu />
          ) : (
            <>
              <Button to={loginLink} variant="ghost">
                Log in
              </Button>
              <Button to="/register">Sign up</Button>
            </>
          )}
        </div>

        <button
          className="-mr-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {NAV.map((item) => (
              <Link key={item.label} to={item.to} className="rounded-lg px-3 py-2.5 text-base font-medium text-slate-700 hover:bg-slate-50">
                {item.label}
              </Link>
            ))}
            <div className="my-2 border-t border-slate-100" />
            {user ? (
              <>
                <div className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={user.name} className="h-10 w-10 text-sm" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{user.name}</p>
                    <p className="truncate text-sm text-slate-500">{user.email}</p>
                  </div>
                </div>
                {accountLinks(user).map(({ to, label, icon: Icon }) => (
                  <Link key={to} to={to} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base text-slate-700 hover:bg-slate-50">
                    <Icon className="h-5 w-5 text-slate-400" />
                    {label}
                  </Link>
                ))}
                <button
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-base text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="h-5 w-5" />
                  Log out
                </button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button to={loginLink} variant="secondary">
                  Log in
                </Button>
                <Button to="/register">Sign up</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
