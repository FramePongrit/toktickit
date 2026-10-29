const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Format a server timestamp for a datetime-local field in Asia/Bangkok, regardless of browser timezone. */
export function toBangkokDateTimeLocal(iso: string): string {
  const date = new Date(new Date(iso).getTime() + BANGKOK_OFFSET_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Interpret a datetime-local value as Bangkok time instead of the browser's local timezone. */
export function fromBangkokDateTimeLocal(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(`${value}:00+07:00`);
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  const roundTrip = toBangkokDateTimeLocal(date.toISOString());
  return roundTrip === value ? date.toISOString() : null;
}

/** Advance a server timestamp with a monotonic browser clock so an open page does not freeze its future-date limit. */
export function estimateServerTime(serverTime: string, receivedAt: number, monotonicNow: number): string {
  return new Date(Date.parse(serverTime) + Math.max(0, monotonicNow - receivedAt)).toISOString();
}
