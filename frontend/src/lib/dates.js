// Date helpers working in India time with YYYY-MM-DD strings (the format the API expects).
const IST = 'Asia/Kolkata';

export const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());

export function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const weekday = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = Sunday

/** Quick date filters shown on the search page. */
export const DATE_PRESETS = [
  { value: 'today', label: 'Today', range: () => [todayIst(), todayIst()] },
  { value: 'tomorrow', label: 'Tomorrow', range: () => [addDays(todayIst(), 1), addDays(todayIst(), 1)] },
  {
    value: 'weekend',
    label: 'This weekend',
    range: () => {
      const today = todayIst();
      const day = weekday(today);
      if (day === 0) return [today, today];
      const saturday = addDays(today, 6 - day);
      return [day === 6 ? today : saturday, addDays(saturday, 1)];
    },
  },
  { value: 'week', label: 'Next 7 days', range: () => [todayIst(), addDays(todayIst(), 6)] },
  { value: 'month', label: 'Next 30 days', range: () => [todayIst(), addDays(todayIst(), 29)] },
];
