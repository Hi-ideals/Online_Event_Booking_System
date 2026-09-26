import api, { downloadFile, unwrap } from './client';

const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const venuesApi = {
  list: (params) => unwrap(api.get('/organizer/venues', { params: clean(params) })),
  get: (id) => unwrap(api.get(`/organizer/venues/${id}`)).then((d) => d.venue),
  create: (data) => unwrap(api.post('/organizer/venues', data)).then((d) => d.venue),
  update: (id, data) => unwrap(api.patch(`/organizer/venues/${id}`, data)).then((d) => d.venue),
  remove: (id) => api.delete(`/organizer/venues/${id}`),
  layouts: (venueId) => unwrap(api.get(`/organizer/venues/${venueId}/layouts`)).then((d) => d.items),
  getLayout: (id) => unwrap(api.get(`/organizer/layouts/${id}`)).then((d) => d.layout),
  createLayout: (venueId, data) => unwrap(api.post(`/organizer/venues/${venueId}/layouts`, data)).then((d) => d.layout),
  updateLayout: (id, data) => unwrap(api.patch(`/organizer/layouts/${id}`, data)).then((d) => d.layout),
  removeLayout: (id) => api.delete(`/organizer/layouts/${id}`),
};

const eventResult = (d) => d.event;

export const orgEventsApi = {
  list: (params) => unwrap(api.get('/organizer/events', { params: clean(params) })),
  get: (id) => unwrap(api.get(`/organizer/events/${id}`)).then(eventResult),
  create: (data) => unwrap(api.post('/organizer/events', data)).then(eventResult),
  update: (id, data) => unwrap(api.patch(`/organizer/events/${id}`, data)).then(eventResult),
  remove: (id) => api.delete(`/organizer/events/${id}`),
  uploadBanner: (id, file) => {
    const form = new FormData();
    form.append('banner', file);
    return unwrap(api.post(`/organizer/events/${id}/banner`, form)).then(eventResult);
  },
  publish: (id) => unwrap(api.post(`/organizer/events/${id}/publish`)).then(eventResult),
  closeSales: (id) => unwrap(api.post(`/organizer/events/${id}/close-sales`)).then(eventResult),
  reopenSales: (id) => unwrap(api.post(`/organizer/events/${id}/reopen-sales`)).then(eventResult),
  cancel: (id, reason) => unwrap(api.post(`/organizer/events/${id}/cancel`, { reason })).then(eventResult),
  createTier: (id, data) => unwrap(api.post(`/organizer/events/${id}/tiers`, data)).then(eventResult),
  updateTier: (id, tierId, data) => unwrap(api.patch(`/organizer/events/${id}/tiers/${tierId}`, data)).then(eventResult),
  removeTier: (id, tierId) => unwrap(api.delete(`/organizer/events/${id}/tiers/${tierId}`)).then(eventResult),
  bookings: (id, params) => unwrap(api.get(`/organizer/events/${id}/bookings`, { params: clean(params) })),
  attendees: (id, params) => unwrap(api.get(`/organizer/events/${id}/attendees`, { params: clean(params) })),
  downloadAttendees: (id, title) => downloadFile(`/organizer/events/${id}/attendees?format=csv`, `attendees-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`),
  salesSummary: (id) => unwrap(api.get(`/organizer/events/${id}/sales-summary`)).then((d) => d.summary),
};

export const organizerApi = {
  earnings: () => unwrap(api.get('/organizer/earnings')).then((d) => d.earnings),
  analytics: (params) => unwrap(api.get('/organizer/analytics/overview', { params: clean(params) })).then((d) => d.analytics),
  payouts: (params) => unwrap(api.get('/organizer/payouts', { params: clean(params) })),
};

export const checkinApi = {
  scan: (eventId, payload) => unwrap(api.post(`/organizer/events/${eventId}/check-in`, payload)),
  sync: (eventId, payload) => unwrap(api.post(`/organizer/events/${eventId}/check-in/sync`, payload)),
  manifest: (eventId) => unwrap(api.get(`/organizer/events/${eventId}/check-in/manifest`)),
  stats: (eventId) => unwrap(api.get(`/organizer/events/${eventId}/check-in/stats`)).then((d) => d.stats),
  logs: (eventId, params) => unwrap(api.get(`/organizer/events/${eventId}/check-in/logs`, { params: clean(params) })),
  undo: (eventId, ticketId, reason) => unwrap(api.post(`/organizer/events/${eventId}/check-in/${ticketId}/undo`, { reason })).then((d) => d.ticket),
};

export const orgKeys = {
  venues: (params) => ['organizer', 'venues', clean(params)],
  venue: (id) => ['organizer', 'venue', id],
  layouts: (venueId) => ['organizer', 'layouts', venueId],
  layout: (id) => ['organizer', 'layout', id],
  events: (params) => ['organizer', 'events', clean(params)],
  event: (id) => ['organizer', 'event', id],
  bookings: (id, params) => ['organizer', 'event', id, 'bookings', clean(params)],
  attendees: (id, params) => ['organizer', 'event', id, 'attendees', clean(params)],
  sales: (id) => ['organizer', 'event', id, 'sales'],
  earnings: ['organizer', 'earnings'],
  analytics: (params) => ['organizer', 'analytics', clean(params)],
  payouts: (params) => ['organizer', 'payouts', clean(params)],
  checkinStats: (eventId) => ['organizer', 'checkin', eventId, 'stats'],
  checkinLogs: (eventId, params) => ['organizer', 'checkin', eventId, 'logs', clean(params)],
};
