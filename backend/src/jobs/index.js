import { query } from '../config/db.js';
import { expireStaleOrders } from '../modules/bookings/bookings.service.js';
import { generatePayouts } from '../modules/finance/payouts.service.js';
import { queueEventReminders, sendQueuedEmails } from '../modules/notifications/notifications.service.js';
import { processPendingRefunds } from '../modules/payments/refunds.service.js';

// Marks events whose end time has passed as completed.
async function completeEndedEvents() {
  const { rowCount } = await query(
    `UPDATE events SET status = 'completed' WHERE status IN ('published', 'sales_closed') AND end_at < NOW()`
  );
  if (rowCount) console.log(`[jobs] ${rowCount} event(s) marked completed`);
}

// Returns held seats/tickets of unpaid bookings whose hold time is over.
async function releaseExpiredBookings() {
  const count = await expireStaleOrders();
  if (count) console.log(`[jobs] ${count} unpaid booking(s) expired`);
}

// Retries refunds that have not reached the gateway yet (e.g. after a network error or restart).
async function retryPendingRefunds() {
  const count = await processPendingRefunds();
  if (count) console.log(`[jobs] ${count} refund(s) sent to the gateway`);
}

async function sendEmails() {
  await sendQueuedEmails();
}

async function eventReminders() {
  const count = await queueEventReminders();
  if (count) console.log(`[jobs] ${count} event reminder(s) queued`);
}

// Creates pending payouts for events that have finished.
async function createPayouts() {
  const { created } = await generatePayouts();
  if (created) console.log(`[jobs] ${created} payout(s) created`);
}

const JOBS = [
  { name: 'completeEndedEvents', run: completeEndedEvents, everyMs: 60 * 1000 },
  { name: 'releaseExpiredBookings', run: releaseExpiredBookings, everyMs: 30 * 1000 },
  { name: 'retryPendingRefunds', run: retryPendingRefunds, everyMs: 60 * 1000 },
  { name: 'sendEmails', run: sendEmails, everyMs: 15 * 1000 },
  { name: 'eventReminders', run: eventReminders, everyMs: 15 * 60 * 1000 },
  { name: 'createPayouts', run: createPayouts, everyMs: 60 * 60 * 1000 },
];

/** Lightweight in-process scheduler. Returns a function that stops all jobs. */
export function startJobs() {
  const timers = JOBS.map((job) => {
    const tick = () => job.run().catch((err) => console.error(`[jobs] ${job.name} failed:`, err.message));
    tick();
    return setInterval(tick, job.everyMs);
  });
  return () => timers.forEach(clearInterval);
}
