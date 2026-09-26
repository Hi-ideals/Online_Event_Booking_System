const IST = 'Asia/Kolkata';

export const formatDateTime = (date) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));

export const formatDate = (date) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST, dateStyle: 'medium' }).format(new Date(date));

/** Indian financial year (April-March) for a date, e.g. "2026-27". */
export function financialYear(date = new Date()) {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit' })
    .format(new Date(date))
    .split('-')
    .map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
