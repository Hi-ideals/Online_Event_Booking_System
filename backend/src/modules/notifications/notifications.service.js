import { query, withTransaction } from '../../config/db.js';
import { sendMail } from './mailer.js';
import { renderEmail } from './templates.js';

const MAX_ATTEMPTS = 5;

/**
 * Queues an email. Pass the transaction client as `db` so the email is only sent if the change commits.
 * `dedupeKey` makes the email send at most once (e.g. one reminder per booking).
 */
export async function queueEmail(db, { template, to, payload = {}, dedupeKey }) {
  if (!to) return;
  await (db ?? { query }).query(
    `INSERT INTO email_outbox (template, to_email, payload, dedupe_key) VALUES ($1, $2, $3, $4)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [template, to, payload, dedupeKey ?? null]
  );
  kickSender();
}

let kickTimer;
/** Sends shortly after the current transaction has had time to commit; the job is the fallback. */
function kickSender() {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(() => sendQueuedEmails().catch((err) => console.error('[mail] send failed:', err.message)), 300);
  kickTimer.unref?.();
}

export async function sendQueuedEmails(limit = 50) {
  let sent = 0;
  for (let i = 0; i < limit; i += 1) {
    const handled = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `SELECT * FROM email_outbox WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`
      );
      const email = rows[0];
      if (!email) return false;
      try {
        const message = await renderEmail(email.template, email.payload);
        if (message.skip) {
          await db.query(`UPDATE email_outbox SET status = 'failed', attempts = attempts + 1, error = $2 WHERE id = $1`, [email.id, `Skipped: ${message.skip}`]);
          return true;
        }
        await sendMail({ to: email.to_email, ...message });
        await db.query(
          `UPDATE email_outbox SET status = 'sent', subject = $2, attempts = attempts + 1, error = NULL, sent_at = NOW() WHERE id = $1`,
          [email.id, message.subject]
        );
        sent += 1;
      } catch (err) {
        const attempts = email.attempts + 1;
        await db.query(
          `UPDATE email_outbox SET attempts = $2, error = $3, status = $4 WHERE id = $1`,
          [email.id, attempts, err.message, attempts >= MAX_ATTEMPTS ? 'failed' : 'queued']
        );
        console.error(`[mail] email ${email.id} (${email.template}) attempt ${attempts} failed:`, err.message);
        // Leave the rest for the next run so one broken email does not spin in this loop.
        return false;
      }
      return true;
    });
    if (!handled) break;
  }
  return sent;
}

/** Queues a reminder for every confirmed booking of events starting within the next 24 hours. */
export async function queueEventReminders() {
  const { rows } = await query(
    `SELECT o.id, o.contact_email
       FROM orders o JOIN events e ON e.id = o.event_id
      WHERE o.status = 'confirmed' AND e.status IN ('published', 'sales_closed')
        AND e.start_at BETWEEN NOW() + INTERVAL '1 hour' AND NOW() + INTERVAL '24 hours'
        AND NOT EXISTS (SELECT 1 FROM email_outbox m WHERE m.dedupe_key = 'reminder:' || o.id)`
  );
  for (const order of rows) {
    await queueEmail(null, { template: 'event_reminder', to: order.contact_email, payload: { orderId: order.id }, dedupeKey: `reminder:${order.id}` });
  }
  return rows.length;
}

export async function listEmails({ status, template, to, page, limit }) {
  const where = [];
  const params = [];
  for (const [sql, value] of [['status = $?', status], ['template = $?', template], ['to_email ILIKE $?', to && `%${to}%`]]) {
    if (!value) continue;
    params.push(value);
    where.push(sql.replace('$?', `$${params.length}`));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(`SELECT COUNT(*)::int AS total FROM email_outbox ${whereSql}`, params);
  const { rows } = await query(
    `SELECT id, template, to_email AS "to", subject, status, attempts, error, sent_at AS "sentAt", created_at AS "createdAt"
       FROM email_outbox ${whereSql} ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows, total: count.rows[0].total };
}
