const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/i;

export function isOffsetDateTime(value: string | null): boolean {
  if (!value || !OFFSET_DATE_TIME.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year!, month! - 1, day!);
  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month! - 1
    && calendarDate.getUTCDate() === day;
}
