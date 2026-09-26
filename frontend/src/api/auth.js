import api, { unwrap } from './client';

export const authApi = {
  login: (credentials) => unwrap(api.post('/auth/login', credentials)),
  register: (data) => unwrap(api.post('/auth/register', data)),
  logout: () => api.post('/auth/logout'),
  logoutAll: () => api.post('/auth/logout-all'),
  me: () => unwrap(api.get('/auth/me')),
  updateProfile: (data) => unwrap(api.patch('/users/me', data)),
  changePassword: (data) => api.patch('/users/me/password', data),
};
