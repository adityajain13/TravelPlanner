import { dtf } from "./intl";
// Dates are stored as plain "YYYY-MM-DD" strings and handled in UTC so a trip's days
// never shift with the device's time zone (important when you land in Japan).

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

export function daysBetween(start: string, end: string): string[] {
  if (!start || !end) return [];
  const out: string[] = [];
  let cur = start;
  // Guard against reversed or absurd ranges
  for (let i = 0; cur <= end && i < 120; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  dtf(undefined, { ...opts, timeZone: "UTC" });

export const formatDayHeading = (s: string) =>
  fmt({ weekday: "long", month: "long", day: "numeric" }).format(parseISODate(s));

export const formatShort = (s: string) => fmt({ month: "short", day: "numeric" }).format(parseISODate(s));

export function formatRange(start?: string, end?: string): string {
  if (!start) return "No dates";
  if (!end || end === start) return formatShort(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const endFmt = fmt({ month: "short", day: "numeric", year: "numeric" }).format(parseISODate(end));
  const startFmt = sameYear ? formatShort(start) : fmt({ month: "short", day: "numeric", year: "numeric" }).format(parseISODate(start));
  return `${startFmt} – ${endFmt}`;
}

export const todayISO = () => {
  const n = new Date();
  return toISODate(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
};
