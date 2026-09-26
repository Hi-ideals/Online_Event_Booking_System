// Platform commission settings, organizer earnings and payouts.
import { query, withTransaction } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { toPaise, toRupees } from '../../utils/money.js';
import { queueEmail } from '../notifications/notifications.service.js';
import { ORDER_FINANCIALS } from './orderFinancials.js';

// ---------- settings ----------
export async function getSettings() {
  const { rows } = await query(`SELECT key, value FROM platform_settings`);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { commissionPercent: Number(map.commission_percent ?? 0) };
}

export async function updateSettings(adminId, { commissionPercent }, ip) {
  await query(
    `INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES ('commission_percent', $1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [JSON.stringify(commissionPercent), adminId]
  );
  await audit({ actorId: adminId, action: 'settings.commission_updated', entityType: 'settings', entityId: 'commission_percent',
    metadata: { commissionPercent }, ip });
  return getSettings();
}

/** Sets or clears (null) an organizer-specific commission rate. Applies to bookings confirmed from now on. */
export async function setOrganizerCommission(adminId, organizerId, commissionPercent, ip) {
  const { rowCount } = await query(
    'UPDATE organizer_profiles SET commission_percent = $1 WHERE user_id = $2',
    [commissionPercent, organizerId]
  );
  if (!rowCount) throw ApiError.notFound('Organizer not found');
  await audit({ actorId: adminId, action: 'organizer.commission_updated', entityType: 'user', entityId: organizerId,
    metadata: { commissionPercent }, ip });
  const settings = await getSettings();
  return { organizerId, commissionPercent, effectivePercent: commissionPercent ?? settings.commissionPercent };
}

// ---------- payouts ----------
const PAYOUT_SELECT = `
  SELECT p.id, p.gross_sales AS "grossSales", p.refunds, p.commission, p.amount, p.status, p.payout_details AS "payoutDetails",
         p.reference, p.notes, p.paid_at AS "paidAt", p.created_at AS "createdAt",
         json_build_object('id', e.id, 'title', e.title, 'startAt', e.start_at) AS event,
         json_build_object('id', u.id, 'name', COALESCE(op.organization_name, u.name), 'email', u.email) AS organizer
    FROM payouts p
    JOIN events e ON e.id = p.event_id
    JOIN users u ON u.id = p.organizer_id
    LEFT JOIN organizer_profiles op ON op.user_id = u.id`;

/** Creates a pending payout for every completed event that has earnings and no payout yet. */
export async function generatePayouts(actorId, ip) {
  const { rows } = await query(
    `INSERT INTO payouts (organizer_id, event_id, gross_sales, refunds, commission, amount, payout_details)
     SELECT e.organizer_id, e.id, SUM(f.subtotal), SUM(LEAST(f.refund_amount, f.subtotal)), SUM(f.commission),
            SUM(f.organizer_earning), COALESCE(op.payout_details, '{}'::jsonb)
       FROM events e
       JOIN (${ORDER_FINANCIALS}) f ON f.event_id = e.id
       LEFT JOIN organizer_profiles op ON op.user_id = e.organizer_id
      WHERE e.status = 'completed' AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.event_id = e.id)
      GROUP BY e.id, op.payout_details
     HAVING SUM(f.organizer_earning) > 0
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id, amount`
  );
  if (rows.length && actorId) {
    await audit({ actorId, action: 'payouts.generated', entityType: 'payout', metadata: { count: rows.length }, ip });
  }
  return { created: rows.length, totalAmount: toRupees(rows.reduce((sum, r) => sum + toPaise(r.amount), 0)) };
}

export async function listPayouts({ status, organizerId, page, limit }) {
  const where = [];
  const params = [];
  for (const [column, value] of [['p.status', status], ['p.organizer_id', organizerId]]) {
    if (!value) continue;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(
    `SELECT COUNT(*)::int AS total, COALESCE(SUM(p.amount), 0) AS amount FROM payouts p ${whereSql}`,
    params
  );
  const { rows } = await query(
    `${PAYOUT_SELECT} ${whereSql} ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows, total: count.rows[0].total, totalAmount: count.rows[0].amount };
}

export async function markPayoutPaid(adminId, payoutId, { reference, notes }, ip) {
  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `UPDATE payouts SET status = 'paid', reference = $2, notes = $3, paid_by = $4, paid_at = NOW()
        WHERE id = $1 AND status = 'pending' RETURNING organizer_id`,
      [payoutId, reference, notes ?? null, adminId]
    );
    if (!rows[0]) throw ApiError.conflict('Payout not found or already paid');
    await audit({ actorId: adminId, action: 'payout.paid', entityType: 'payout', entityId: payoutId, metadata: { reference }, ip }, db);
    const { rows: [organizer] } = await db.query('SELECT email FROM users WHERE id = $1', [rows[0].organizer_id]);
    await queueEmail(db, { template: 'payout_paid', to: organizer.email, payload: { payoutId }, dedupeKey: `payout:${payoutId}` });
    const { rows: [payout] } = await db.query(`${PAYOUT_SELECT} WHERE p.id = $1`, [payoutId]);
    return payout;
  });
}

/** Organizer money overview across all their events. */
export async function organizerEarnings(organizerId) {
  const { rows: [totals] } = await query(
    `SELECT COALESCE(SUM(f.subtotal), 0) AS "grossTicketSales",
            COALESCE(SUM(f.refund_amount), 0) AS "refunded",
            COALESCE(SUM(f.commission), 0) AS "platformCommission",
            COALESCE(SUM(f.organizer_earning), 0) AS "totalEarnings",
            COALESCE(SUM(f.organizer_earning) FILTER (WHERE e.status <> 'completed'), 0) AS "upcomingEarnings"
       FROM (${ORDER_FINANCIALS}) f JOIN events e ON e.id = f.event_id
      WHERE e.organizer_id = $1`,
    [organizerId]
  );
  const { rows: [payouts] } = await query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS "paidOut",
            COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS "pendingPayout"
       FROM payouts WHERE organizer_id = $1`,
    [organizerId]
  );
  const { rows: [{ commission_percent: override }] } = await query(
    'SELECT commission_percent FROM organizer_profiles WHERE user_id = $1',
    [organizerId]
  );
  const { commissionPercent } = await getSettings();
  return { ...totals, ...payouts, commissionPercent: override ?? commissionPercent, currency: 'INR' };
}
