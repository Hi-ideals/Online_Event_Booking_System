// Ticket list with QR codes, ticket PDF and invoice PDF for a booking.
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import env from '../../config/env.js';
import { query } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { formatDate, formatDateTime } from '../../utils/dates.js';
import { formatInr } from '../../utils/money.js';
import { createTicketToken } from '../../utils/ticketToken.js';
import { findOrder } from './bookings.repository.js';

const INK = '#1f2937';
const MUTED = '#6b7280';
const ACCENT = '#4f46e5';
const RULE = '#e5e7eb';

export async function listTickets(orderId, { withQr = true } = {}) {
  const { rows } = await query(
    `SELECT t.id, t.ticket_code AS "ticketCode", t.status, t.attendee_name AS "attendeeName", t.event_id AS "eventId",
            tt.name AS "tierName", s.seat_label AS "seatLabel", t.created_at AS "issuedAt",
            t.checked_in_at AS "checkedInAt"
       FROM tickets t
       JOIN ticket_tiers tt ON tt.id = t.tier_id
       LEFT JOIN event_seats s ON s.id = t.event_seat_id
      WHERE t.order_id = $1
      ORDER BY tt.sort_order, s.section_key, s.row_label, s.seat_number, t.ticket_code`,
    [orderId]
  );
  return Promise.all(rows.map(async ({ eventId, ...ticket }) => {
    if (ticket.status !== 'valid') return ticket;
    const qrToken = createTicketToken(ticket.id, eventId);
    return { ...ticket, qrToken, ...(withQr && { qrDataUrl: await QRCode.toDataURL(qrToken, { margin: 1, width: 300 }) }) };
  }));
}

function renderToBuffer(build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    Promise.resolve(build(doc)).then(() => doc.end(), reject);
  });
}

function header(doc, title) {
  doc.rect(0, 0, doc.page.width, 80).fill(ACCENT);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(env.platform.name, 50, 28);
  doc.font('Helvetica').fontSize(11).text(title, 50, 32, { align: 'right' });
  doc.fillColor(INK).moveDown(0);
  doc.y = 110;
}

function labelValue(doc, label, value, x, y, width = 230) {
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { width });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(value ?? '-', x, y + 11, { width });
}

// ---------- tickets PDF ----------
export async function ticketsPdf(orderId) {
  const order = await findOrder(orderId);
  if (order.status !== 'confirmed') throw ApiError.conflict('Tickets are available only for confirmed bookings');
  const tickets = (await listTickets(orderId, { withQr: false })).filter((t) => t.status === 'valid');

  return renderToBuffer(async (doc) => {
    for (const [index, ticket] of tickets.entries()) {
      if (index > 0) doc.addPage();
      header(doc, `E-TICKET ${index + 1} OF ${tickets.length}`);

      doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(order.event.title, 50, 110, { width: 495 });
      const top = doc.y + 16;
      labelValue(doc, 'Date & time', formatDateTime(order.event.startAt), 50, top);
      labelValue(doc, 'Venue', `${order.event.venue.name}, ${order.event.venue.city}`, 50, top + 42);
      labelValue(doc, 'Attendee', ticket.attendeeName, 50, top + 84);
      labelValue(doc, 'Ticket type', ticket.tierName, 50, top + 126);
      labelValue(doc, 'Seat', ticket.seatLabel ?? 'General admission', 50, top + 168);
      labelValue(doc, 'Ticket code', ticket.ticketCode, 50, top + 210);
      labelValue(doc, 'Booking', order.orderNumber, 50, top + 252);

      const qr = await QRCode.toBuffer(ticket.qrToken, { margin: 1, width: 440 });
      doc.roundedRect(320, top - 6, 225, 225, 8).lineWidth(1).stroke(RULE);
      doc.image(qr, 332, top + 6, { width: 200 });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Show this QR code at the entry gate', 320, top + 228, { width: 225, align: 'center' });

      doc.moveTo(50, top + 310).lineTo(545, top + 310).lineWidth(0.5).stroke(RULE);
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(
        'Each QR code admits one person and can be scanned only once. Do not share your ticket. '
        + `For help contact ${env.platform.supportEmail}.`,
        50, top + 322, { width: 495 }
      );
    }
  });
}

// ---------- invoice PDF ----------
export async function invoicePdf(orderId) {
  const order = await findOrder(orderId);
  if (!order.invoiceNumber) throw ApiError.conflict('An invoice is issued once the booking is confirmed');
  const { rows: [organizer] } = await query(
    `SELECT COALESCE(op.organization_name, u.name) AS name, op.gst_number AS gstin, op.address, op.city
       FROM events e JOIN users u ON u.id = e.organizer_id LEFT JOIN organizer_profiles op ON op.user_id = u.id
      WHERE e.id = $1`,
    [order.event.id]
  );

  return renderToBuffer((doc) => {
    header(doc, 'INVOICE');

    labelValue(doc, 'Invoice number', order.invoiceNumber, 50, 110);
    labelValue(doc, 'Invoice date', formatDate(order.invoiceIssuedAt), 300, 110);
    labelValue(doc, 'Booking number', order.orderNumber, 50, 152);
    labelValue(doc, 'Payment', order.payment ? `${order.payment.providerPaymentId} (${order.payment.method ?? 'online'})` : 'Free booking', 300, 152);

    doc.moveTo(50, 200).lineTo(545, 200).lineWidth(0.5).stroke(RULE);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Billed to', 50, 215);
    doc.font('Helvetica').fontSize(10).text([order.contactName, order.contactEmail, order.contactPhone].filter(Boolean).join('\n'), 50, 230, { width: 220 });
    doc.font('Helvetica-Bold').text('Issued by', 300, 215);
    doc.font('Helvetica').text(
      [env.platform.name, env.platform.address, env.platform.gstin && `GSTIN: ${env.platform.gstin}`,
        `On behalf of: ${organizer.name}`, organizer.gstin && `Organizer GSTIN: ${organizer.gstin}`].filter(Boolean).join('\n'),
      300, 230, { width: 245 }
    );

    let y = 320;
    doc.font('Helvetica-Bold').fontSize(11).text(order.event.title, 50, y, { width: 495 });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(`${formatDateTime(order.event.startAt)}  |  ${order.event.venue.name}, ${order.event.venue.city}`, 50, doc.y + 2);

    y = doc.y + 14;
    const cols = [50, 280, 390, 440, 545];
    doc.rect(50, y, 495, 22).fill('#eef2ff');
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9);
    doc.text('Description', cols[0] + 8, y + 7);
    doc.text('Seat', cols[1], y + 7);
    doc.text('Qty', cols[2], y + 7, { width: 40, align: 'right' });
    doc.text('Amount', cols[3], y + 7, { width: 97, align: 'right' });
    y += 30;

    doc.font('Helvetica').fontSize(9);
    for (const item of order.items) {
      doc.fillColor(INK).text(`${item.tierName} @ ${formatInr(item.unitPrice)}`, cols[0] + 8, y, { width: 220 });
      doc.text(item.seatLabel ?? '-', cols[1], y, { width: 105 });
      doc.text(String(item.quantity), cols[2], y, { width: 40, align: 'right' });
      doc.text(formatInr(item.lineTotal), cols[3], y, { width: 97, align: 'right' });
      y += 18;
      if (y > 700) {
        doc.addPage();
        y = 60;
      }
    }

    doc.moveTo(50, y + 4).lineTo(545, y + 4).lineWidth(0.5).stroke(RULE);
    y += 14;
    const totalRow = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(INK);
      doc.text(label, 300, y, { width: 140 });
      doc.text(value, cols[3], y, { width: 97, align: 'right' });
      y += bold ? 20 : 16;
    };
    totalRow('Ticket subtotal', formatInr(order.subtotal));
    totalRow('Convenience fee', formatInr(order.feeAmount));
    totalRow('Total paid', formatInr(order.totalAmount), true);
    for (const refund of order.refunds) {
      totalRow(`Refund (${refund.status})`, `- ${formatInr(refund.amount)}`);
    }

    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
      'Ticket prices are inclusive of applicable taxes. This is a computer-generated invoice and does not require a signature.',
      50, Math.max(y + 30, 720), { width: 495 }
    );
  });
}
