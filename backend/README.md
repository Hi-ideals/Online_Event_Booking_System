# Event Booking & Smart Ticketing - Backend API

Node.js + Express 5 + PostgreSQL REST API.

## Setup

1. Copy `.env.example` to `.env` and set `DB_PASSWORD` (plus a strong `JWT_ACCESS_SECRET`).
2. Install packages and prepare the database:

```bash
npm install
npm run setup
```

`npm run setup` creates the database, applies the SQL migrations in `src/db/migrations`, and seeds the first admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`).

3. Start the API (auto-restarts on file changes):

```bash
npm run dev
```

The API runs on `http://localhost:5000/api/v1`.

## Project structure

```
src/
  config/        env + PostgreSQL pool (query, withTransaction)
  db/            createDatabase, migrate, seed, migrations/*.sql
  middleware/    authenticate/authorize, validate (zod), error handling
  modules/       one folder per domain: routes, service, validation
  jobs/          in-process scheduled jobs: complete ended events, expire unpaid bookings,
                 retry refunds, send emails, event reminders, create payouts
  utils/         ApiError, response helpers, JWT/refresh tokens, audit log, shared schemas
  app.js         Express app (security, CORS, rate limits, routes)
  server.js      HTTP server entry point
```

## Response format

```json
{ "success": true, "message": "optional", "data": { } }
{ "success": false, "message": "Validation failed", "errors": [{ "field": "body.email", "message": "..." }] }
```

## Authentication

- `POST /auth/login` returns `data.accessToken` (15 min JWT) and sets an httpOnly `refresh_token` cookie.
- Send `Authorization: Bearer <accessToken>` on protected requests.
- When the access token expires (401), call `POST /auth/refresh` with cookies included to get a new one. Refresh tokens are rotated; reusing an old one signs out every session.
- Organizers register as `pending_approval` and can log in and edit their profile, but organizer features stay locked until an admin approves them.

## Build phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Foundation: setup, migrations, auth, roles, organizer approval, user management, audit log | Done |
| 2 | Event management: categories, venues, seat layouts, events, ticket tiers, search | Done |
| 3 | Booking engine: seat holds, orders, expiry job, cancellation | Done |
| 4 | Payments & invoicing: gateway, webhooks, tickets + QR, invoice PDF, refunds, commission | Done |
| 5 | QR check-in: ticket verification, entry logs, live stats, offline sync | Done |
| 6 | Analytics, admin oversight (disputes, payouts, settings) & notifications | Done |

## API - Phase 1

Base URL: `/api/v1`

### Health
| Method | Path | Access |
|--------|------|--------|
| GET | `/health` | Public |

### Auth
| Method | Path | Access | Notes |
|--------|------|--------|-------|
| POST | `/auth/register` | Public | `role`: `attendee` or `organizer` (organizer also needs `organizer.organizationName`) |
| POST | `/auth/login` | Public | Rate limited |
| POST | `/auth/refresh` | Refresh cookie | Rotates the refresh token |
| POST | `/auth/logout` | Refresh cookie | Revokes the current session |
| POST | `/auth/logout-all` | Logged in | Revokes all sessions |
| GET | `/auth/me` | Logged in | Current user + organizer profile |

### Profile
| Method | Path | Access |
|--------|------|--------|
| PATCH | `/users/me` | Logged in (organizers can update `organizer` and `payoutDetails`) |
| PATCH | `/users/me/password` | Logged in (signs out all sessions) |

### Admin
| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/organizers?status=pending_approval&search=&page=&limit=` | Organizer list |
| PATCH | `/admin/organizers/:id/approve` | Approve organizer |
| PATCH | `/admin/organizers/:id/reject` | Body: `{ "reason": "..." }` |
| GET | `/admin/users?role=&status=&search=&page=&limit=` | All users |
| GET | `/admin/users/:id` | User details |
| PATCH | `/admin/users/:id/status` | Body: `{ "status": "suspended" or "active", "reason": "..." }` |
| POST | `/admin/admins` | Create another admin |
| GET | `/admin/audit-logs?entityType=&entityId=&actorId=` | Audit trail |

### Example: register an attendee

```json
POST /api/v1/auth/register
{
  "role": "attendee",
  "name": "Asha Rao",
  "email": "asha@example.com",
  "password": "Secret123",
  "phone": "9876543210"
}
```

### Example: register an organizer

```json
POST /api/v1/auth/register
{
  "role": "organizer",
  "name": "Ravi Kumar",
  "email": "ravi@events.com",
  "password": "Secret123",
  "organizer": { "organizationName": "Bengaluru Live Events", "city": "Bengaluru" }
}
```


## API - Phase 2 (Event Management)

### Public
| Method | Path | Notes |
|--------|------|-------|
| GET | `/categories` | Active categories with upcoming event counts |
| GET | `/events?q=&category=&city=&dateFrom=&dateTo=&minPrice=&maxPrice=&featured=&sort=&page=&limit=` | Search upcoming events. `sort`: `date`, `price_asc`, `price_desc`, `popular`, `newest`, `relevance`. Dates are `YYYY-MM-DD` |
| GET | `/events/cities` | Cities that have upcoming events |
| GET | `/events/:idOrSlug` | Event details with active ticket tiers and a `bookable` flag |
| GET | `/events/:idOrSlug/seats` | Seat map for seated events (`available`, `unavailable`, or `gap`) |

Uploaded images are served from `/uploads/...` (for example `http://localhost:5000/uploads/events/xyz.jpg`).

### Organizer (approved organizers only)
| Method | Path | Notes |
|--------|------|-------|
| GET / POST | `/organizer/venues` | List / create venues |
| GET / PATCH / DELETE | `/organizer/venues/:id` | A venue used by events cannot be deleted |
| GET / POST | `/organizer/venues/:venueId/layouts` | Seat layouts of a venue |
| GET / PATCH / DELETE | `/organizer/layouts/:id` | Seats cannot change once a published event uses the layout |
| GET / POST | `/organizer/events` | List own events (`?status=&search=`) / create a draft |
| GET / PATCH / DELETE | `/organizer/events/:id` | Only drafts can be deleted. Venue, seating type and layout are locked after publishing |
| POST | `/organizer/events/:id/banner` | `multipart/form-data`, field `banner` (JPG/PNG/WEBP, 5 MB max) |
| POST | `/organizer/events/:id/publish` | Checks tiers and generates the seat inventory for seated events |
| POST | `/organizer/events/:id/close-sales` | published -> sales_closed |
| POST | `/organizer/events/:id/reopen-sales` | sales_closed -> published |
| POST | `/organizer/events/:id/cancel` | Body: `{ "reason": "..." }` |
| POST | `/organizer/events/:id/tiers` | Add a ticket tier |
| PATCH / DELETE | `/organizer/events/:id/tiers/:tierId` | Tiers with sales cannot be deleted (deactivate them instead) |

Event statuses: `draft` -> `published` <-> `sales_closed` -> `completed` (set automatically when the event ends), or `cancelled`.

### Admin
| Method | Path | Notes |
|--------|------|-------|
| POST | `/admin/categories` | Create a category |
| PATCH / DELETE | `/admin/categories/:id` | A category with events cannot be deleted (set `isActive: false` instead) |
| GET | `/admin/events?status=&organizerId=&categoryId=&blocked=&featured=&search=` | All events on the platform |
| GET | `/admin/events/:id` | Event details |
| PATCH | `/admin/events/:id/feature` | Body: `{ "isFeatured": true }` |
| PATCH | `/admin/events/:id/block` | Body: `{ "reason": "..." }`. Hides the event from the public |
| PATCH | `/admin/events/:id/unblock` | |

### Example: seat layout

`blocked` lists seat numbers that do not exist in that row (aisles, pillars). This layout has 11 VIP seats and 20 General seats.

```json
POST /api/v1/organizer/venues/:venueId/layouts
{
  "name": "Main Hall",
  "definition": {
    "sections": [
      { "key": "VIP", "name": "VIP", "rows": [ { "label": "A", "seats": 6, "blocked": [3] }, { "label": "B", "seats": 6 } ] },
      { "key": "GEN", "name": "General", "rows": [ { "label": "C", "seats": 10 }, { "label": "D", "seats": 10 } ] }
    ]
  }
}
```

### Example: create an event and its tiers

```json
POST /api/v1/organizer/events
{
  "title": "Comedy Special",
  "categoryId": 2,
  "venueId": "<venue id>",
  "seatingType": "seated",
  "seatLayoutId": "<layout id>",
  "startAt": "2026-12-20T19:00:00+05:30",
  "endAt": "2026-12-20T21:00:00+05:30",
  "refundCutoffHours": 48,
  "refundPercent": 80
}

POST /api/v1/organizer/events/:id/tiers
{ "name": "Premium", "price": 1500, "sectionKeys": ["VIP"] }

POST /api/v1/organizer/events/:id/tiers      (general admission event)
{ "name": "Early Bird", "price": 499, "quantity": 200, "saleEndAt": "2026-12-01T23:59:00+05:30" }
```

## API - Phase 3 (Booking)

### How booking works

1. The attendee creates a booking. The tickets (or exact seats) are **held** for `BOOKING_HOLD_MINUTES` (default 10) and the booking is `pending_payment`.
2. Payment (Phase 4) confirms the booking: held tickets become sold.
3. If payment does not happen in time, a background job marks the booking `expired` and puts the tickets back on sale.
4. Free bookings (total 0) are confirmed immediately.

Starting a new checkout for the same event replaces the attendee's previous unpaid booking. Tickets can never be oversold: availability checks and seat locks run inside database transactions.

Booking statuses: `pending_payment`, `confirmed`, `expired`, `failed`, `cancelled`.

### Attendee
| Method | Path | Notes |
|--------|------|-------|
| POST | `/bookings` | Create a booking (see examples below) |
| GET | `/bookings?status=&when=upcoming\|past&page=&limit=` | My bookings |
| GET | `/bookings/:id` | Booking details, items, seats and a `cancellation` quote |
| GET | `/bookings/:id/cancellation-quote` | Whether it can be cancelled now and the refund amount |
| POST | `/bookings/:id/cancel` | Body: `{ "reason": "..." }` (optional). Releases unpaid bookings; cancels paid ones within the event refund policy |

Refund rule for paid bookings: allowed when the event has `refundAllowed`, it is more than `refundCutoffHours` before the start, and the refund is `refundPercent`% of the ticket subtotal (the convenience fee is not refunded).

### Organizer
| Method | Path | Notes |
|--------|------|-------|
| GET | `/organizer/events/:eventId/bookings?status=&search=` | Bookings for an own event (search by order number, name, email) |
| GET | `/organizer/events/:eventId/attendees?search=&tierId=&format=json\|csv` | Confirmed ticket holders; `format=csv` downloads a spreadsheet |

When an organizer cancels an event, unpaid bookings are released immediately.

### Admin
| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/bookings?status=&eventId=&userId=&search=` | All bookings |
| GET | `/admin/bookings/:id` | Booking details |

### Example: general admission booking

```json
POST /api/v1/bookings
{
  "eventId": "<event id>",
  "items": [ { "tierId": "<tier id>", "quantity": 2 } ],
  "contact": { "name": "Asha Rao", "email": "asha@example.com", "phone": "9876543210" }
}
```

`contact` is optional and defaults to the logged-in user.

### Example: reserved seating booking

Get seat ids from `GET /events/:id/seats`, then:

```json
POST /api/v1/bookings
{ "eventId": "<event id>", "seatIds": ["<seat id>", "<seat id>"] }
```

## API - Phase 4 (Payments, Tickets, Invoices, Refunds)

### Payment flow

```
POST /bookings                      -> booking is pending_payment (tickets held)
POST /payments/checkout             -> gateway order for the booking
   Browser pays on the gateway
   Gateway -> POST /payments/webhook/:provider (payment.captured)   } either or both,
   Browser -> POST /payments/verify (signature from checkout)       } processed once
Booking confirmed -> tickets with QR codes + invoice number are issued
```

- `PAYMENT_PROVIDER=mock` (default) simulates the gateway. Instead of opening Razorpay, the frontend calls `POST /payments/mock/:paymentId/complete` with `{ "outcome": "success" }` or `{ "outcome": "failure" }`. This sends a signed webhook in the same format Razorpay uses, so the rest of the flow is identical.
- `PAYMENT_PROVIDER=razorpay` uses the Razorpay API. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, enable automatic capture, and add a webhook to `https://<your-api>/api/v1/payments/webhook/razorpay` for `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`.
- A failed payment keeps the booking pending, so the attendee can retry until the hold expires.
- A payment that arrives after the booking expired is refunded automatically.
- Webhooks are verified with an HMAC signature and stored, so duplicates are ignored.

### Attendee
| Method | Path | Notes |
|--------|------|-------|
| POST | `/payments/checkout` | Body: `{ "orderId": "..." }`. Returns `provider`, `key`, `providerOrderId`, `amount` (paise), `prefill` |
| POST | `/payments/verify` | Body: `{ orderId, providerOrderId, providerPaymentId, signature }` from the Razorpay checkout handler |
| POST | `/payments/mock/:paymentId/complete` | Mock mode only. Body: `{ "outcome": "success" \| "failure" }` |
| GET | `/bookings/:id/tickets` | Tickets with `ticketCode`, `qrToken` and a `qrDataUrl` image |
| GET | `/bookings/:id/tickets.pdf` | Download e-tickets (one page per ticket with QR code) |
| GET | `/bookings/:id/invoice.pdf` | Download the invoice |

`GET /bookings/:id` now also returns `invoiceNumber`, `validTickets`, `payment` and `refunds`.

### Refunds
- Attendee cancellation: refund of `refundPercent`% of the ticket subtotal (see Phase 3 rules).
- Organizer cancels the event: every paid booking is refunded in full, including the convenience fee.
- Refunds are sent to the gateway in the background right away, and a job retries failed attempts every minute (up to 5 attempts).

### Organizer
| Method | Path | Notes |
|--------|------|-------|
| GET | `/organizer/events/:eventId/sales-summary` | Gross sales, refunds, platform commission, organizer earnings, and per-tier numbers |

Commission: the platform keeps `commission_percent` (default 10%, stored in `platform_settings`, optional per-organizer override) of ticket revenue that was not refunded. The rate is locked in when each booking is confirmed.

### Admin
| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/payments?status=created\|captured\|failed` | All payments |
| GET | `/admin/refunds?status=&type=` | All refunds |
| POST | `/admin/refunds/:id/retry` | Retry a failed refund |
| GET | `/admin/bookings/:id/invoice.pdf` | Download any invoice |

### QR codes
Each ticket's QR code contains `EBT1.<ticketId>.<eventId>.<signature>`, signed with `TICKET_QR_SECRET`. It cannot be forged or edited. It is verified at the gate in Phase 5.

## API - Phase 5 (QR Check-in)

### Scan results

Every scan returns HTTP 200 with a `result`. Show green only when `allowed` is `true`.

| `result` | `allowed` | Meaning |
|----------|-----------|---------|
| `checked_in` | true | Valid ticket, entry recorded |
| `already_checked_in` | false | Used before; `message` says when and at which gate |
| `cancelled` | false | The booking was cancelled or refunded |
| `wrong_event` | false | Genuine ticket for another event |
| `invalid` | false | Forged, damaged or unknown QR code / ticket code |
| `not_open` | false | Outside the check-in window or the event was cancelled |

Check-in opens `CHECKIN_OPENS_HOURS_BEFORE` hours (default 24) before the event starts and closes `CHECKIN_CLOSES_HOURS_AFTER` hours (default 6) after it ends. A ticket can be checked in only once, even if two gates scan it at the same moment. Every scan attempt is logged. Attendees cannot cancel a booking once any of its tickets has been used.

### Organizer (own events)
| Method | Path | Notes |
|--------|------|-------|
| POST | `/organizer/events/:eventId/check-in` | Body: `{ "qrToken": "EBT1...", "gate": "Gate A" }` or `{ "ticketCode": "TKT-7KQ2-M9XD" }` (dashes and case do not matter) |
| POST | `/organizer/events/:eventId/check-in/:ticketId/undo` | Body: `{ "reason": "..." }` |
| GET | `/organizer/events/:eventId/check-in/stats` | Checked in vs total, attendance rate, by tier, by gate, arrivals per 15 minutes, scan result counts, last 10 scans |
| GET | `/organizer/events/:eventId/check-in/logs?result=&gate=` | Full scan log |
| GET | `/organizer/events/:eventId/check-in/manifest` | All tickets of the event, for scanners that must work offline |
| POST | `/organizer/events/:eventId/check-in/sync` | Upload offline scans (see below) |

### Offline scanning

1. While online, download `/check-in/manifest` to the scanner device.
2. Offline, read the ticket id from the QR code (`EBT1.<ticketId>.<eventId>.<signature>`) and look it up in the manifest to decide entry.
3. When back online, upload the scans. They are applied in the order they happened, so if two devices admitted the same ticket, the earlier scan wins and the later one is reported as `already_checked_in`.

```json
POST /api/v1/organizer/events/:eventId/check-in/sync
{
  "gate": "Gate D",
  "scans": [
    { "qrToken": "EBT1....", "scannedAt": "2026-12-20T18:05:00+05:30" },
    { "ticketCode": "TKT-7KQ2-M9XD", "scannedAt": "2026-12-20T18:06:10+05:30" }
  ]
}
```

### Admin
| Method | Path |
|--------|------|
| GET | `/admin/events/:eventId/check-in/stats` |
| GET | `/admin/events/:eventId/check-in/logs` |

`GET /bookings/:id/tickets` now includes `checkedInAt` for each ticket.

## API - Phase 6 (Analytics, Payouts, Disputes, Notifications)

### Money model

For every confirmed booking:

- **Ticket revenue kept** = ticket subtotal - refunds (up to the subtotal)
- **Platform commission** = kept ticket revenue x commission rate (locked in when the booking was confirmed)
- **Organizer earnings** = kept ticket revenue - commission
- **Platform revenue** = commission + convenience fees kept

### Analytics
| Method | Path | Notes |
|--------|------|-------|
| GET | `/organizer/analytics/overview?from=&to=` | Organizer: tickets, gross sales, net earnings, events by status, attendance rate, daily sales series, top 5 events |
| GET | `/admin/analytics/overview?from=&to=` | Admin: gross booking value, commission, platform revenue, refunds and refund rate, users by role, events by status, daily revenue series, top events/categories/organizers, attendance per event, pending actions |

Dates are `YYYY-MM-DD` in India time (default: last 30 days, maximum one year). Daily series include days with zero sales.

### Commission settings (admin)
| Method | Path | Notes |
|--------|------|-------|
| GET / PATCH | `/admin/settings` | Body: `{ "commissionPercent": 12.5 }` |
| PATCH | `/admin/organizers/:id/commission` | Body: `{ "commissionPercent": 5 }`, or `null` to use the platform rate |
| GET | `/admin/events/:id/sales-summary` | Money summary of any event |

Rate changes apply to bookings confirmed afterwards.

### Earnings and payouts
| Method | Path | Notes |
|--------|------|-------|
| GET | `/organizer/earnings` | Total earnings, earnings from upcoming events, paid out, pending payout, current commission rate |
| GET | `/organizer/payouts?status=` | Own payouts |
| GET | `/admin/payouts?status=&organizerId=` | All payouts with total amount |
| POST | `/admin/payouts/generate` | Creates a pending payout for each completed event with earnings (also runs hourly) |
| PATCH | `/admin/payouts/:id/mark-paid` | Body: `{ "reference": "UTR...", "notes": "..." }` after transferring the money |

The payout stores a copy of the organizer's bank/UPI details at the time it was created.

### Refund requests (disputes)
| Method | Path | Notes |
|--------|------|-------|
| POST | `/bookings/:id/refund-requests` | Attendee. Body: `{ "reason": "..." }`. For paid bookings with an amount still refundable; one open request at a time |
| GET | `/bookings/:id/refund-requests` | Attendee's request history for the booking |
| GET | `/admin/refund-requests?status=open\|approved\|rejected` | Open requests first |
| GET | `/admin/refund-requests/:id` | Includes `refundableAmount` |
| POST | `/admin/refund-requests/:id/approve` | Body: `{ "amount": 400, "cancelBooking": false, "note": "..." }`. Omit `amount` to refund everything left. `cancelBooking: true` voids the tickets and puts them back on sale |
| POST | `/admin/refund-requests/:id/reject` | Body: `{ "note": "..." }` |

### Email notifications

Emails are queued in the same database transaction as the change that triggers them (an "outbox"), then sent by a background job, so an email is never sent for a change that failed and is never lost if sending fails (up to 5 attempts).

| Template | Sent when |
|----------|-----------|
| `welcome` | Attendee registers |
| `organizer_pending` / `organizer_approved` / `organizer_rejected` | Organizer registers / is approved / is rejected |
| `booking_confirmed` | Booking confirmed (e-tickets PDF attached) |
| `booking_cancelled` | Attendee cancels a paid booking, or the organizer cancels the event |
| `refund_processed` | A refund reaches the gateway |
| `refund_request_resolved` | Admin approves or rejects a refund request |
| `event_reminder` | Within 24 hours before the event (once per booking) |
| `payout_paid` | Admin marks a payout as paid |

**Development:** leave `SMTP_HOST` empty and every email is saved as an `.eml` file in `backend/storage/emails` (open it with Outlook, Thunderbird or any mail app).
**Production:** set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/emails?status=&template=&to=` | Email log with delivery status and errors |