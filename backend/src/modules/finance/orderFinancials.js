/*
 * One row per booking that was ever confirmed, with the money split used by sales summaries,
 * payouts and analytics:
 *
 *   ticket_net         ticket revenue kept after refunds
 *   commission         platform share of ticket_net (rate locked in at confirmation)
 *   organizer_earning  ticket_net - commission
 *   fee_net            convenience fee kept after refunds (refunds beyond the ticket subtotal come out of the fee)
 *
 * Use it as a subquery: FROM (${ORDER_FINANCIALS}) f
 */
export const ORDER_FINANCIALS = `
  SELECT o.id AS order_id, o.event_id, o.user_id, o.status, o.confirmed_at, o.ticket_count,
         o.subtotal, o.fee_amount, o.total_amount, o.refund_amount,
         x.ticket_net,
         x.commission,
         x.ticket_net - x.commission AS organizer_earning,
         o.fee_amount - LEAST(GREATEST(o.refund_amount - o.subtotal, 0), o.fee_amount) AS fee_net
    FROM orders o
   CROSS JOIN LATERAL (
     SELECT o.subtotal - LEAST(o.refund_amount, o.subtotal) AS ticket_net,
            ROUND((o.subtotal - LEAST(o.refund_amount, o.subtotal)) * COALESCE(o.commission_percent, 0) / 100, 2) AS commission
   ) x
   WHERE o.confirmed_at IS NOT NULL`;
