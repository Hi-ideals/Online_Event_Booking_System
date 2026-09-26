import api, { downloadFile, unwrap } from './client';

const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const get = (path, params) => unwrap(api.get(path, { params: clean(params) }));

export const adminApi = {
  // organizers & users
  organizers: (params) => get('/admin/organizers', params),
  approveOrganizer: (id) => unwrap(api.patch(`/admin/organizers/${id}/approve`)).then((d) => d.user),
  rejectOrganizer: (id, reason) => unwrap(api.patch(`/admin/organizers/${id}/reject`, { reason })).then((d) => d.user),
  setCommission: (id, commissionPercent) => unwrap(api.patch(`/admin/organizers/${id}/commission`, { commissionPercent })),
  users: (params) => get('/admin/users', params),
  user: (id) => unwrap(api.get(`/admin/users/${id}`)).then((d) => d.user),
  setUserStatus: (id, status, reason) => unwrap(api.patch(`/admin/users/${id}/status`, { status, reason })).then((d) => d.user),
  createAdmin: (data) => unwrap(api.post('/admin/admins', data)).then((d) => d.user),

  // events & categories
  events: (params) => get('/admin/events', params),
  event: (id) => unwrap(api.get(`/admin/events/${id}`)).then((d) => d.event),
  featureEvent: (id, isFeatured) => unwrap(api.patch(`/admin/events/${id}/feature`, { isFeatured })).then((d) => d.event),
  blockEvent: (id, reason) => unwrap(api.patch(`/admin/events/${id}/block`, { reason })).then((d) => d.event),
  unblockEvent: (id) => unwrap(api.patch(`/admin/events/${id}/unblock`)).then((d) => d.event),
  eventSales: (id) => unwrap(api.get(`/admin/events/${id}/sales-summary`)).then((d) => d.summary),
  createCategory: (data) => unwrap(api.post('/admin/categories', data)).then((d) => d.category),
  updateCategory: (id, data) => unwrap(api.patch(`/admin/categories/${id}`, data)).then((d) => d.category),
  deleteCategory: (id) => api.delete(`/admin/categories/${id}`),

  // bookings & money
  bookings: (params) => get('/admin/bookings', params),
  booking: (id) => unwrap(api.get(`/admin/bookings/${id}`)).then((d) => d.booking),
  downloadInvoice: (booking) => downloadFile(`/admin/bookings/${booking.id}/invoice.pdf`, `invoice-${booking.orderNumber}.pdf`),
  payments: (params) => get('/admin/payments', params),
  refunds: (params) => get('/admin/refunds', params),
  retryRefund: (id) => api.post(`/admin/refunds/${id}/retry`),
  refundRequests: (params) => get('/admin/refund-requests', params),
  refundRequest: (id) => unwrap(api.get(`/admin/refund-requests/${id}`)).then((d) => d.request),
  approveRefundRequest: (id, data) => unwrap(api.post(`/admin/refund-requests/${id}/approve`, data)).then((d) => d.request),
  rejectRefundRequest: (id, note) => unwrap(api.post(`/admin/refund-requests/${id}/reject`, { note })).then((d) => d.request),
  payouts: (params) => get('/admin/payouts', params),
  generatePayouts: () => unwrap(api.post('/admin/payouts/generate')),
  markPayoutPaid: (id, data) => unwrap(api.patch(`/admin/payouts/${id}/mark-paid`, data)).then((d) => d.payout),

  // platform
  settings: () => unwrap(api.get('/admin/settings')).then((d) => d.settings),
  updateSettings: (data) => unwrap(api.patch('/admin/settings', data)).then((d) => d.settings),
  analytics: (params) => get('/admin/analytics/overview', params).then((d) => d.analytics),
  emails: (params) => get('/admin/emails', params),
  auditLogs: (params) => get('/admin/audit-logs', params),
};

export const adminKeys = {
  all: ['admin'],
  organizers: (params) => ['admin', 'organizers', clean(params)],
  users: (params) => ['admin', 'users', clean(params)],
  events: (params) => ['admin', 'events', clean(params)],
  event: (id) => ['admin', 'event', id],
  eventSales: (id) => ['admin', 'event', id, 'sales'],
  categories: ['admin', 'categories'],
  bookings: (params) => ['admin', 'bookings', clean(params)],
  booking: (id) => ['admin', 'booking', id],
  payments: (params) => ['admin', 'payments', clean(params)],
  refunds: (params) => ['admin', 'refunds', clean(params)],
  refundRequests: (params) => ['admin', 'refund-requests', clean(params)],
  refundRequest: (id) => ['admin', 'refund-request', id],
  payouts: (params) => ['admin', 'payouts', clean(params)],
  settings: ['admin', 'settings'],
  analytics: (params) => ['admin', 'analytics', clean(params)],
  emails: (params) => ['admin', 'emails', clean(params)],
  auditLogs: (params) => ['admin', 'audit-logs', clean(params)],
};
