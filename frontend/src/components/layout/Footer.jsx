import { Link } from 'react-router';
import Logo from './Logo';

const COLUMNS = [
  { title: 'Discover', links: [['Explore events', '/events'], ['Music', '/events?category=music'], ['Comedy', '/events?category=comedy'], ['Workshops', '/events?category=workshops']] },
  { title: 'Organizers', links: [['Sell tickets', '/register?role=organizer'], ['Organizer dashboard', '/organizer']] },
  { title: 'Account', links: [['Log in', '/login'], ['Sign up', '/register'], ['My bookings', '/bookings']] },
];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-slate-500">
            Discover concerts, comedy, workshops and more. Book in seconds and walk in with a QR ticket.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold text-slate-900">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="text-sm text-slate-500 hover:text-brand-700">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100">
        <p className="container-page py-5 text-xs text-slate-400">&copy; {new Date().getFullYear()} EventBooking. All rights reserved.</p>
      </div>
    </footer>
  );
}
