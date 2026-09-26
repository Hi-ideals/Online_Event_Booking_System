import {
  BadgeIndianRupee, BarChart3, CalendarDays, ClipboardList, FolderTree, LayoutDashboard, Mail, MapPin,
  MessageSquareWarning, QrCode, Receipt, Settings, Ticket, Users, Wallet,
} from 'lucide-react';
import { createBrowserRouter } from 'react-router';
import DashboardLayout from './components/layout/DashboardLayout';
import { AuthLayout, PublicLayout, RootLayout } from './components/layout/Layouts';
import { GuestOnly, RequireAuth } from './components/routing/guards';
import { PageLoader } from './components/ui/Spinner';
import RouteError from './pages/misc/RouteError';
import { ComingSoonPage, NotFoundPage } from './pages/misc/StatusPages';

/** Route-level code splitting: each page loads only when first visited. */
const page = (load) => async () => ({ Component: (await load()).default });

const ORGANIZER_NAV = [
  { items: [{ to: '/organizer', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Manage',
    items: [
      { to: '/organizer/events', label: 'Events', icon: CalendarDays },
      { to: '/organizer/venues', label: 'Venues & layouts', icon: MapPin },
      { to: '/organizer/check-in', label: 'Check-in', icon: QrCode },
    ],
  },
  {
    title: 'Money',
    items: [
      { to: '/organizer/earnings', label: 'Earnings & payouts', icon: Wallet },
      { to: '/organizer/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
];

const ADMIN_NAV = [
  { items: [{ to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true }] },
  {
    title: 'Marketplace',
    items: [
      { to: '/admin/organizers', label: 'Organizers', icon: ClipboardList },
      { to: '/admin/users', label: 'Users', icon: Users },
      { to: '/admin/events', label: 'Events', icon: CalendarDays },
      { to: '/admin/categories', label: 'Categories', icon: FolderTree },
      { to: '/admin/bookings', label: 'Bookings', icon: Ticket },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/admin/payments', label: 'Payments & refunds', icon: Receipt },
      { to: '/admin/refund-requests', label: 'Refund requests', icon: MessageSquareWarning },
      { to: '/admin/payouts', label: 'Payouts', icon: BadgeIndianRupee },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/admin/settings', label: 'Settings', icon: Settings },
      { to: '/admin/emails', label: 'Email log', icon: Mail },
    ],
  },
];

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    hydrateFallbackElement: <PageLoader />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, lazy: page(() => import('./pages/HomePage')) },
          { path: 'events', lazy: page(() => import('./pages/events/EventsPage')) },
          { path: 'events/:slug', lazy: page(() => import('./pages/events/EventDetailPage')) },
          { path: 'events/:slug/seats', lazy: page(() => import('./pages/events/SeatSelectionPage')) },
          {
            element: <RequireAuth allowInactive />,
            children: [
              { path: 'account', lazy: page(() => import('./pages/account/AccountPage')) },
              { path: 'organizer/pending', element: <RequireAuth roles={['organizer']} allowInactive />, children: [{ index: true, lazy: page(() => import('./pages/organizer/PendingApprovalPage')) }] },
            ],
          },
          {
            element: <RequireAuth roles={['attendee']} />,
            children: [
              { path: 'bookings', lazy: page(() => import('./pages/bookings/MyBookingsPage')) },
              { path: 'bookings/:id', lazy: page(() => import('./pages/bookings/BookingDetailPage')) },
              { path: 'checkout/:id', lazy: page(() => import('./pages/bookings/CheckoutPage')) },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        element: <GuestOnly />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: 'login', lazy: page(() => import('./pages/auth/LoginPage')) },
              { path: 'register', lazy: page(() => import('./pages/auth/RegisterPage')) },
            ],
          },
        ],
      },
      {
        path: 'organizer',
        element: <RequireAuth roles={['organizer']} />,
        children: [
          {
            element: <DashboardLayout sections={ORGANIZER_NAV} title="Organizer" homePath="/organizer" />,
            children: [
              { index: true, lazy: page(() => import('./pages/organizer/DashboardPage')) },
              { path: 'events', lazy: page(() => import('./pages/organizer/EventsListPage')) },
              { path: 'events/new', lazy: page(() => import('./pages/organizer/EventFormPage')) },
              { path: 'events/:id', lazy: page(() => import('./pages/organizer/EventManagePage')) },
              { path: 'events/:id/edit', lazy: page(() => import('./pages/organizer/EventFormPage')) },
              { path: 'venues', lazy: page(() => import('./pages/organizer/VenuesPage')) },
              { path: 'venues/:id', lazy: page(() => import('./pages/organizer/VenueDetailPage')) },
              { path: 'venues/:venueId/layouts/new', lazy: page(() => import('./pages/organizer/LayoutBuilderPage')) },
              { path: 'layouts/:id', lazy: page(() => import('./pages/organizer/LayoutBuilderPage')) },
              { path: 'check-in', lazy: page(() => import('./pages/organizer/CheckInEventsPage')) },
              { path: 'check-in/:eventId', lazy: page(() => import('./pages/organizer/ScannerPage')) },
              { path: 'earnings', lazy: page(() => import('./pages/organizer/EarningsPage')) },
              { path: 'analytics', lazy: page(() => import('./pages/organizer/AnalyticsPage')) },
              { path: '*', element: <ComingSoonPage /> },
            ],
          },
        ],
      },
      {
        path: 'admin',
        element: <RequireAuth roles={['admin']} />,
        children: [
          {
            element: <DashboardLayout sections={ADMIN_NAV} title="Admin console" homePath="/admin" />,
            children: [
              { index: true, lazy: page(() => import('./pages/admin/OverviewPage')) },
              { path: 'organizers', lazy: page(() => import('./pages/admin/OrganizersPage')) },
              { path: 'users', lazy: page(() => import('./pages/admin/UsersPage')) },
              { path: 'events', lazy: page(() => import('./pages/admin/AdminEventsPage')) },
              { path: 'categories', lazy: page(() => import('./pages/admin/CategoriesPage')) },
              { path: 'bookings', lazy: page(() => import('./pages/admin/AdminBookingsPage')) },
              { path: 'payments', lazy: page(() => import('./pages/admin/PaymentsPage')) },
              { path: 'refund-requests', lazy: page(() => import('./pages/admin/RefundRequestsPage')) },
              { path: 'payouts', lazy: page(() => import('./pages/admin/PayoutsPage')) },
              { path: 'settings', lazy: page(() => import('./pages/admin/SettingsPage')) },
              { path: 'analytics', lazy: page(() => import('./pages/admin/AdminAnalyticsPage')) },
              { path: 'emails', lazy: page(() => import('./pages/admin/EmailsPage')) },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
