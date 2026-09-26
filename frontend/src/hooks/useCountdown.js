import { useEffect, useState } from 'react';

/** Seconds left until `target` (a date), ticking every second. Returns { seconds, label, expired }. */
export default function useCountdown(target) {
  const end = target ? new Date(target).getTime() : null;
  const compute = () => (end ? Math.max(0, Math.round((end - Date.now()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(compute);

  useEffect(() => {
    if (!end) return undefined;
    setSeconds(compute());
    const timer = setInterval(() => setSeconds(compute()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return { seconds, label: `${mm}:${ss}`, expired: Boolean(end) && seconds === 0 };
}
