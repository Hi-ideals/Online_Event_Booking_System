# Event Booking & Smart Ticketing - Frontend

React 19 + Vite + Tailwind CSS 4. No Redux: server data uses TanStack Query, the logged-in user lives in React Context.

## Run

Start the backend first (`npm run dev` in `../backend`), then:

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173.

For sample events, run `npm run seed:demo` in the backend once. It creates 12 events and two demo accounts:

| Role | Email | Password |
|------|-------|----------|
| Organizer | organizer@demo.com | Demo@12345 |
| Attendee | attendee@demo.com | Demo@12345 |
| Admin | admin@eventbooking.com | Admin@12345 (from backend `.env`) |

Vite proxies `/api` and `/uploads` to the backend (`BACKEND_URL`), so the app and API share one origin in development.

## Structure

```
src/
  api/          axios client (token refresh, downloads) + one file per API area
  components/
    layout/     Navbar, Footer, public/auth layouts, dashboard sidebar layout
    routing/    RequireAuth (login + role + organizer approval), GuestOnly
    ui/         Button, form controls, Card, Badge, Alert, EmptyState, Modal, Spinner
  context/      AuthContext (session restore, login, register, logout)
  hooks/        small reusable hooks
  lib/          formatting, error helpers, shared zod rules
  pages/        route pages, grouped by area (auth, account, organizer, admin, ...)
  router.jsx    all routes, lazy-loaded per page
```

## Authentication

- The access token is kept in memory only; the refresh token is an httpOnly cookie set by the API.
- On page load the app calls `/auth/refresh` to restore the session.
- When a request gets 401, the client refreshes once and retries; concurrent requests share one refresh.
- `RequireAuth` redirects guests to `/login?redirect=...`, sends users of the wrong role to their home page, and sends unapproved organizers to `/organizer/pending`.
- After logging in, `redirectAfterLogin` returns the user to the page that asked for the login when that page is open to their role, otherwise to their own home page.

## Build phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Setup, API client, auth context, layouts, login/register, account settings, organizer approval page | Done |
| 2 | Public site: home, event search & filters, event details, ticket selection, seat map | Done |
| 3 | Attendee: checkout + mock payment, my bookings, tickets & QR, PDFs, cancellation, refund requests | Done |
| 4 | Organizer dashboard: venues & seat layout builder, events & tiers, bookings, attendees, sales | Done |
| 5 | Organizer check-in scanner (camera + offline), live stats, earnings, payouts, analytics | Done |
| 6 | Admin console: approvals, users, events, bookings, payments, disputes, payouts, settings, analytics, emails | Done |

## Admin console notes

- Organizer applications arrive on `/admin/organizers` (the "Awaiting approval" tab). Rejecting one needs a reason, which is emailed to the applicant.
- Commission: `/admin/settings` holds the platform rate; a per-organizer rate on the Organizers page overrides it. Both apply to bookings confirmed from then on, because each order stores the rate it was confirmed with.
- Payouts are generated for events that have already finished, so `/admin/payouts` stays empty until an event ends. "Generate payouts" runs the same job the scheduler runs hourly.
- Refund requests are the cases outside the automatic cancellation policy. An approval can refund part of the amount and can leave the booking active.
- Blocking an event hides it from attendees immediately but keeps existing tickets valid.
- Every admin action is written to the activity log at the bottom of `/admin/settings`.

## Check-in scanner notes

- Browsers allow camera access only on `https://` or `http://localhost`. On a phone over your LAN (`http://192.168.x.x:5173`) the camera is blocked, so use a tunnel (e.g. `ngrok`) or type ticket codes instead. Camera scanning is otherwise automatic.
- Offline mode stores the event's ticket list and queued scans in the device's localStorage, then uploads them with `POST /check-in/sync`. The server re-checks every scan, so the earliest scan wins if two gates admit the same ticket.
