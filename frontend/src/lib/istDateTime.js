// <input type="datetime-local"> works in the browser's time zone; events are always entered in India time.

/** ISO timestamp -> "YYYY-MM-DDTHH:mm" in India time. */
export function toIstInput(iso) {
  if (!iso) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** "YYYY-MM-DDTHH:mm" in India time -> ISO string with +05:30 offset. */
export function fromIstInput(value) {
  return value ? `${value}:00+05:30` : undefined;
}
