// Dashboards for organizers (their own events) and admins (whole platform).
// Dates are grouped by day in India time; `from`/`to` are inclusive YYYY-MM-DD dates.
import { query } from '../../config/db.js';
import { ORDER_FINANCIALS } from './orderFinancials.js';

const IST_DAY = (column) => `(${column} AT TIME ZONE 'Asia/Kolkata')::date`;
const IN_RANGE = (column) => `${IST_DAY(column)} BETWEEN $1::date AND $2::date`;

export function defaultRange({ from, to }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const end = to ?? today;
  const start = from ?? new Date(new Date(`${end}T00:00:00Z`).getTime() - 29 * 864e5).toISOString().slice(0, 10);
  return { from: start, to: end };
}

/** Daily series with zero-filled gaps. `valuesSql` selects from `f` (ORDER_FINANCIALS) grouped by day. */
async function dailySeries(range, valuesSql, extraWhere = '', extraParams = []) {
  const { rows } = await query(
    `WITH days AS (SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS day),
          data AS (
            SELECT ${IST_DAY('f.confirmed_at')} AS day, ${valuesSql}
              FROM (${ORDER_FINANCIALS}) f JOIN events e ON e.id = f.event_id
             WHERE ${IN_RANGE('f.confirmed_at')} ${extraWhere}
             GROUP BY 1
          )
     SELECT to_char(days.day, 'YYYY-MM-DD') AS date, data.*
       FROM days LEFT JOIN data ON data.day = days.day
      ORDER BY days.day`,
    [range.from, range.to, ...extraParams]
  );
  return rows.map(({ day: _day, ...row }) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? 0])));
}

// ================= Organizer =================
export async function organizerOverview(organizerId, input) {
  const range = defaultRange(input);
  const own = 'AND e.organizer_id = $3';
  const params = [range.from, range.to, organizerId];

  const [totals, events, attendance, salesOverTime, topEvents] = await Promise.all([
    query(
      `SELECT COUNT(*) FILTER (WHERE f.status = 'confirmed')::int AS "bookings",
              COALESCE(SUM(f.ticket_count) FILTER (WHERE f.status = 'confirmed'), 0)::int AS "ticketsSold",
              COALESCE(SUM(f.subtotal), 0) AS "grossSales",
              COALESCE(SUM(f.refund_amount), 0) AS "refunded",
              COALESCE(SUM(f.commission), 0) AS "platformCommission",
              COALESCE(SUM(f.organizer_earning), 0) AS "netEarnings"
         FROM (${ORDER_FINANCIALS}) f JOIN events e ON e.id = f.event_id
        WHERE ${IN_RANGE('f.confirmed_at')} ${own}`,
      params
    ),
    query(`SELECT status, COUNT(*)::int AS count FROM events WHERE organizer_id = $1 GROUP BY status`, [organizerId]),
    query(
      `SELECT COUNT(*) FILTER (WHERE t.status = 'valid')::int AS tickets, COUNT(t.checked_in_at)::int AS "checkedIn"
         FROM tickets t JOIN events e ON e.id = t.event_id
        WHERE e.organizer_id = $1 AND e.start_at < NOW() AND t.status = 'valid'`,
      [organizerId]
    ),
    dailySeries(range, `COALESCE(SUM(f.ticket_count), 0)::int AS tickets, COALESCE(SUM(f.subtotal), 0) AS "grossSales", COALESCE(SUM(f.organizer_earning), 0) AS "netEarnings"`, own, [organizerId]),
    query(
      `SELECT e.id, e.title, e.start_at AS "startAt", e.status,
              COALESCE(SUM(f.ticket_count) FILTER (WHERE f.status = 'confirmed'), 0)::int AS "ticketsSold",
              COALESCE(SUM(f.organizer_earning), 0) AS "netEarnings",
              (SELECT COUNT(t.checked_in_at)::int FROM tickets t WHERE t.event_id = e.id AND t.status = 'valid') AS "checkedIn"
         FROM events e JOIN (${ORDER_FINANCIALS}) f ON f.event_id = e.id
        WHERE e.organizer_id = $1
        GROUP BY e.id
        ORDER BY "netEarnings" DESC, "ticketsSold" DESC
        LIMIT 5`,
      [organizerId]
    ),
  ]);

  const { tickets, checkedIn } = attendance.rows[0];
  return {
    range,
    totals: totals.rows[0],
    eventsByStatus: Object.fromEntries(events.rows.map((r) => [r.status, r.count])),
    attendance: { tickets, checkedIn, rate: tickets ? Math.round((checkedIn / tickets) * 1000) / 10 : 0 },
    salesOverTime,
    topEvents: topEvents.rows,
  };
}

// ================= Admin =================
export async function adminOverview(input) {
  const range = defaultRange(input);
  const params = [range.from, range.to];

  const [totals, refunds, users, events, revenueOverTime, topEvents, topCategories, topOrganizers, attendance, pending] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS "bookings",
              COALESCE(SUM(f.ticket_count) FILTER (WHERE f.status = 'confirmed'), 0)::int AS "ticketsSold",
              COALESCE(SUM(f.total_amount), 0) AS "grossBookingValue",
              COALESCE(SUM(f.commission), 0) AS "commissionEarned",
              COALESCE(SUM(f.fee_net), 0) AS "convenienceFees",
              COALESCE(SUM(f.commission + f.fee_net), 0) AS "platformRevenue",
              COALESCE(SUM(f.organizer_earning), 0) AS "organizerEarnings"
         FROM (${ORDER_FINANCIALS}) f
        WHERE ${IN_RANGE('f.confirmed_at')}`,
      params
    ),
    query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS amount
         FROM refunds WHERE status = 'processed' AND ${IN_RANGE('processed_at')}`,
      params
    ),
    query(
      `SELECT role, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ${IN_RANGE('created_at')})::int AS "newInRange"
         FROM users GROUP BY role`,
      params
    ),
    query(
      `SELECT status, COUNT(*)::int AS count FROM events GROUP BY status`
    ),
    dailySeries(range, `COUNT(*)::int AS bookings, COALESCE(SUM(f.total_amount), 0) AS "grossBookingValue", COALESCE(SUM(f.commission + f.fee_net), 0) AS "platformRevenue"`),
    query(
      `SELECT e.id, e.title, e.start_at AS "startAt", COALESCE(op.organization_name, u.name) AS organizer,
              COALESCE(SUM(f.ticket_count) FILTER (WHERE f.status = 'confirmed'), 0)::int AS "ticketsSold",
              COALESCE(SUM(f.total_amount), 0) AS "grossBookingValue"
         FROM (${ORDER_FINANCIALS}) f JOIN events e ON e.id = f.event_id
         JOIN users u ON u.id = e.organizer_id LEFT JOIN organizer_profiles op ON op.user_id = u.id
        WHERE ${IN_RANGE('f.confirmed_at')}
        GROUP BY e.id, op.organization_name, u.name
        ORDER BY "ticketsSold" DESC, "grossBookingValue" DESC LIMIT 5`,
      params
    ),
    query(
      `SELECT c.id, c.name, COALESCE(SUM(f.ticket_count) FILTER (WHERE f.status = 'confirmed'), 0)::int AS "ticketsSold",
              COALESCE(SUM(f.total_amount), 0) AS "grossBookingValue", COUNT(DISTINCT e.id)::int AS events
         FROM (${ORDER_FINANCIALS}) f JOIN events e ON e.id = f.event_id JOIN categories c ON c.id = e.category_id
        WHERE ${IN_RANGE('f.confirmed_at')}
        GROUP BY c.id ORDER BY "ticketsSold" DESC LIMIT 5`,
      params
    ),
    query(
      `SELECT u.id, COALESCE(op.organization_name, u.name) AS name, COUNT(DISTINCT e.id)::int AS events,
              COALESCE(SUM(f.total_amount), 0) AS "grossBookingValue", COALESCE(SUM(f.commission), 0) AS "commissionEarned"
         FROM (${ORDER_FINANCIALS}) f JOIN events e ON e.id = f.event_id
         JOIN users u ON u.id = e.organizer_id LEFT JOIN organizer_profiles op ON op.user_id = u.id
        WHERE ${IN_RANGE('f.confirmed_at')}
        GROUP BY u.id, op.organization_name ORDER BY "grossBookingValue" DESC LIMIT 5`,
      params
    ),
    query(
      `SELECT e.id, e.title, e.start_at AS "startAt",
              COUNT(t.id)::int AS tickets, COUNT(t.checked_in_at)::int AS "checkedIn"
         FROM events e JOIN tickets t ON t.event_id = e.id AND t.status = 'valid'
        WHERE e.start_at < NOW() AND ${IN_RANGE('e.start_at')}
        GROUP BY e.id ORDER BY e.start_at`,
      params
    ),
    query(
      `SELECT (SELECT COUNT(*)::int FROM users WHERE role = 'organizer' AND status = 'pending_approval') AS "organizerApprovals",
              (SELECT COUNT(*)::int FROM refund_requests WHERE status = 'open') AS "refundRequests",
              (SELECT COUNT(*)::int FROM payouts WHERE status = 'pending') AS "payouts",
              (SELECT COUNT(*)::int FROM refunds WHERE status = 'failed') AS "failedRefunds"`
    ),
  ]);

  const t = totals.rows[0];
  const attendanceRows = attendance.rows.map((r) => ({ ...r, rate: r.tickets ? Math.round((r.checkedIn / r.tickets) * 1000) / 10 : 0 }));
  const attendedTickets = attendanceRows.reduce((s, r) => s + r.tickets, 0);
  const attendedCheckins = attendanceRows.reduce((s, r) => s + r.checkedIn, 0);

  return {
    range,
    totals: {
      ...t,
      refundsProcessed: refunds.rows[0].count,
      refundedAmount: refunds.rows[0].amount,
      refundRate: t.grossBookingValue ? Math.round((refunds.rows[0].amount / t.grossBookingValue) * 1000) / 10 : 0,
    },
    users: Object.fromEntries(users.rows.map((r) => [r.role, { total: r.total, newInRange: r.newInRange }])),
    eventsByStatus: Object.fromEntries(events.rows.map((r) => [r.status, r.count])),
    revenueOverTime,
    topEvents: topEvents.rows,
    topCategories: topCategories.rows,
    topOrganizers: topOrganizers.rows,
    attendance: {
      overallRate: attendedTickets ? Math.round((attendedCheckins / attendedTickets) * 1000) / 10 : 0,
      events: attendanceRows,
    },
    pendingActions: pending.rows[0],
  };
}
