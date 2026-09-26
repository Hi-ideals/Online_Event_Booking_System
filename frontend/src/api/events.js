import api, { unwrap } from './client';

/** Drops empty values so URLs stay clean. */
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const eventsApi = {
  search: (params) => unwrap(api.get('/events', { params: clean(params) })),
  cities: () => unwrap(api.get('/events/cities')).then((d) => d.items),
  categories: (params) => unwrap(api.get('/categories', { params: clean(params ?? {}) })).then((d) => d.items),
  get: (idOrSlug) => unwrap(api.get(`/events/${idOrSlug}`)).then((d) => d.event),
  seatMap: (idOrSlug) => unwrap(api.get(`/events/${idOrSlug}/seats`)).then((d) => d.seatMap),
};

/** Shared query keys so pages reuse cached data. */
export const eventKeys = {
  search: (params) => ['events', 'search', clean(params)],
  cities: ['events', 'cities'],
  categories: ['categories'],
  detail: (idOrSlug) => ['events', 'detail', idOrSlug],
  seatMap: (idOrSlug) => ['events', 'seats', idOrSlug],
};
