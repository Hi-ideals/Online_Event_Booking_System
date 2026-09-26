import { CalendarCheck2, QrCode, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { PageLoader } from '../ui/Spinner';
import Footer from './Footer';
import Logo from './Logo';
import Navbar from './Navbar';

export function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </>
  );
}

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

const HIGHLIGHTS = [
  { icon: CalendarCheck2, text: 'Thousands of events across India' },
  { icon: QrCode, text: 'Instant QR tickets on your phone' },
  { icon: ShieldCheck, text: 'Secure payments and easy refunds' },
];

export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand-700 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <Logo light className="relative" />
        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight text-white">
            Live the moment.
            <br />
            We handle the tickets.
          </h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-brand-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-5 w-5" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-200">&copy; {new Date().getFullYear()} EventBooking</p>
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-6 lg:px-12">
        <Logo className="mb-10 lg:hidden" />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
