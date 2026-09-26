import api, { downloadFile, unwrap } from './client';

export const bookingsApi = {
  create: (payload) => unwrap(api.post('/bookings', payload)).then((d) => d.booking),
  list: (params) => unwrap(api.get('/bookings', { params })),
  get: (id) => unwrap(api.get(`/bookings/${id}`)).then((d) => d.booking),
  tickets: (id) => unwrap(api.get(`/bookings/${id}/tickets`)),
  cancel: (id, reason) => unwrap(api.post(`/bookings/${id}/cancel`, reason ? { reason } : {})).then((d) => d.booking),
  refundRequests: (id) => unwrap(api.get(`/bookings/${id}/refund-requests`)).then((d) => d.items),
  requestRefund: (id, reason) => unwrap(api.post(`/bookings/${id}/refund-requests`, { reason })).then((d) => d.request),
  downloadTickets: (booking) => downloadFile(`/bookings/${booking.id}/tickets.pdf`, `tickets-${booking.orderNumber}.pdf`),
  downloadInvoice: (booking) => downloadFile(`/bookings/${booking.id}/invoice.pdf`, `invoice-${booking.orderNumber}.pdf`),
};

export const paymentsApi = {
  checkout: (orderId) => unwrap(api.post('/payments/checkout', { orderId })).then((d) => d.checkout),
  verify: (payload) => unwrap(api.post('/payments/verify', payload)).then((d) => d.booking),
  completeMock: (paymentId, outcome) => unwrap(api.post(`/payments/mock/${paymentId}/complete`, { outcome })),
};

export const bookingKeys = {
  all: ['bookings'],
  list: (params) => ['bookings', 'list', params],
  detail: (id) => ['bookings', 'detail', id],
  tickets: (id) => ['bookings', 'tickets', id],
  refundRequests: (id) => ['bookings', 'refund-requests', id],
};
