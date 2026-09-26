const IST = 'Asia/Kolkata';

export const formatCurrency = (amount, { free = true } = {}) => {
  const value = Number(amount ?? 0);
  if (free && value === 0) return 'Free';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
};

export const formatNumber = (n) => new Intl.NumberFormat('en-IN').format(Number(n ?? 0));

export const formatDate = (date, options = { dateStyle: 'medium' }) =>
  date ? new Intl.DateTimeFormat('en-IN', { timeZone: IST, ...options }).format(new Date(date)) : '';

export const formatDateTime = (date) => formatDate(date, { dateStyle: 'medium', timeStyle: 'short' });

export const formatTime = (date) => formatDate(date, { timeStyle: 'short' });

/** "Sat, 20 Dec" style label for event cards. */
export const formatEventDay = (date) => formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' });

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

export const titleCase = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
