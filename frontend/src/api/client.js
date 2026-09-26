import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

/*
 * The access token lives only in memory (never localStorage), so scripts injected into the page
 * cannot steal a long-lived credential. The refresh token is an httpOnly cookie the browser sends
 * to /auth/refresh; on page load and whenever the access token expires we trade it for a new one.
 */
let accessToken = null;
let onSessionExpired = () => {};

export const setAccessToken = (token) => {
  accessToken = token;
};
export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
};

const api = axios.create({ baseURL: API_URL, withCredentials: true });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise = null;

/** Gets a new access token. Concurrent callers share one request. */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh`, null, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.data.accessToken);
        return res.data.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

const NO_RETRY = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const retryable = response?.status === 401 && config && !config._retried && !NO_RETRY.some((p) => config.url?.endsWith(p));
    if (!retryable || !accessToken) return Promise.reject(error);

    config._retried = true;
    try {
      await refreshSession();
      return api(config);
    } catch (refreshError) {
      setAccessToken(null);
      onSessionExpired();
      return Promise.reject(refreshError);
    }
  }
);

/** Unwraps `{ success, data }` responses. */
export const unwrap = (promise) => promise.then((res) => res.data.data);

/** Absolute URL for files served by the API (e.g. /uploads/events/x.jpg). */
export function assetUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const origin = /^https?:\/\//.test(API_URL) ? new URL(API_URL).origin : '';
  return `${origin}${path}`;
}

/** Downloads a protected file (PDF/CSV) with the auth header and saves it. */
export async function downloadFile(url, filename) {
  const res = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export default api;
