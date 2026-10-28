import { addDays, daysBetween } from "./dates";
import { plain } from "./richtext";
import { daySection, type Item, type Reservation, type TripState } from "./trips";

/*
 * .ics export (RFC 5545): days, timed stops and bookings. Times are floating (no zone), since a
 * trip's clock times are local to wherever you are. UIDs are stable, so re-importing updates events.
 */

const CRLF = "\r\n";
const enc = new TextEncoder();

/** A local date and "HH:MM" time. */
interface When {
  date: string;
  time: string;
}

const compact = (d: string) => d.replace(/-/g, "");
const pad = (n: number) => String(n).padStart(2, "0");
const minutesOf = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** `w` plus some minutes, rolling into the next day(s) past midnight. */
function shift(w: When, mins: number): When {
  const total = minutesOf(w.time) + mins;
  const days = Math.floor(total / 1440);
  const rem = total - days * 1440;
  return { date: days ? addDays(w.date, days) : w.date, time: `${pad(Math.floor(rem / 60))}:${pad(rem % 60)}` };
}

/** YYYYMMDDTHHMMSS (floating local time). */
const stamp = (w: When) => `${compact(w.date)}T${w.time.replace(":", "")}00`;

/** Start → end. The end is `end` when it's after the start, else start + `mins`. */
function span(start: When, end: When | undefined, mins: number): [When, When] {
  return [start, end && stamp(end) > stamp(start) ? end : shift(start, mins)];
}

/** TEXT value escaping (RFC 5545 §3.3.11). */
const esc = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

/** Fold to 75 octets per line (continuations start with a space). Never splits a UTF-8 character. */
function fold(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let max = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > max) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      max = 74; // the leading space of a continuation line takes one of the 75
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join(`${CRLF} `);
}

const unique = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

export function tripToIcs(state: TripState): string {
  const { meta, items, reservations } = state;
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const days = daysBetween(meta.startDate, meta.endDate);
  const dayOf = new Map(days.map((d) => [daySection(d), d]));
  const out: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Atlas Journeys//Trip export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(meta.title || "Trip")}`,
  ];
  const event = (uid: string, when: string[], body: string[]) => out.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${now}`, ...when, ...body, "END:VEVENT");
  const allDay = (d: string, e = addDays(d, 1)) => [`DTSTART;VALUE=DATE:${compact(d)}`, `DTEND;VALUE=DATE:${compact(e)}`];
  const timed = ([s, e]: [When, When]) => [`DTSTART:${stamp(s)}`, `DTEND:${stamp(e)}`];
  const geo = (lat?: number, lng?: number) => (lat != null && lng != null ? [`GEO:${lat};${lng}`] : []);
  const desc = (text?: string) => (text?.trim() ? [`DESCRIPTION:${esc(plain(text.trim()))}`] : []);

  // 1. One all-day event per day that has any items; the place stops are listed in the description
  days.forEach((date, i) => {
    const section = daySection(date);
    const dayItems = items.filter((it) => it.section === section);
    if (!dayItems.length) return;
    const stops = dayItems.filter((it) => it.kind === "place");
    const sub = meta.subtitles?.[section];
    const list = stops.map((it, n) => `${n + 1}. ${it.startTime ? `${it.startTime} ` : ""}${it.name}`).join("\n");
    event(`day-${date}@atlas-journeys`, [...allDay(date), "TRANSP:TRANSPARENT"], [`SUMMARY:${esc(`Day ${i + 1}${sub ? ` · ${sub}` : ""}`)}`, ...(list ? [`DESCRIPTION:${esc(list)}`] : [])]);
  });

  // 2. Each timed place stop
  for (const it of items as Item[]) {
    const date = dayOf.get(it.section);
    if (!date || it.kind !== "place" || !it.startTime) continue;
    const start: When = { date, time: it.startTime };
    const end = it.endTime ? { date, time: it.endTime } : undefined;
    event(`stop-${it.id}@atlas-journeys`, timed(span(start, end, it.stay ?? 60)), [
      `SUMMARY:${esc(it.name)}`,
      `LOCATION:${esc(it.address || it.name)}`,
      ...geo(it.lat, it.lng),
      ...desc(it.notes),
    ]);
  }

  // 3. Bookings: one copy per traveller, so group them back into one event
  const groups = new Map<string, Reservation[]>();
  for (const r of reservations) {
    if (!r.startDate) continue;
    const k = `${r.type}|${r.title}|${r.startDate}|${r.startTime ?? ""}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  for (const rs of groups.values()) {
    const r = rs[0];
    const sd = r.startDate!;
    const confirmations = unique(rs.map((x) => x.confirmation));
    const travellers = unique(rs.map((x) => x.traveler));
    const notes = rs.find((x) => x.notes?.trim())?.notes;
    const coords = rs.find((x) => x.lat != null && x.lng != null);
    const lines = [
      confirmations.length ? `Confirmation: ${confirmations.join(", ")}` : "",
      travellers.length ? `Travellers: ${travellers.join(", ")}` : "",
      notes?.trim() ? plain(notes.trim()) : "",
    ].filter(Boolean);
    const body = [
      `SUMMARY:${esc(r.type === "lodging" ? `Stay: ${r.title}` : r.title)}`,
      ...(lines.length ? [`DESCRIPTION:${esc(lines.join("\n"))}`] : []),
      ...geo(coords?.lat, coords?.lng),
    ];
    const uid = `booking-${r.id}@atlas-journeys`;

    if (r.type === "lodging") {
      // Check-out date is the exclusive end, so the stay covers the nights
      const end = r.endDate && r.endDate > sd ? r.endDate : addDays(sd, 1);
      event(uid, allDay(sd, end), [...body, ...(r.address ? [`LOCATION:${esc(r.address)}`] : [])]);
    } else if (r.type === "flight" || r.type === "train" || r.type === "car") {
      const location = r.from || r.to ? [r.from || "?", r.to || "?"].join(" → ") : r.address;
      const loc = location ? [`LOCATION:${esc(location)}`] : [];
      if (r.startTime) {
        const end = r.endTime ? { date: r.endDate ?? sd, time: r.endTime } : undefined;
        event(uid, timed(span({ date: sd, time: r.startTime }, end, 60)), [...body, ...loc]);
      } else event(uid, allDay(sd), [...body, ...loc]);
    } else {
      // restaurant / other
      const loc = r.address ? [`LOCATION:${esc(r.address)}`] : [];
      if (r.startTime) {
        const end = r.endTime ? { date: sd, time: r.endTime } : undefined;
        event(uid, timed(span({ date: sd, time: r.startTime }, end, 90)), [...body, ...loc]);
      } else event(uid, allDay(sd), [...body, ...loc]);
    }
  }

  out.push("END:VCALENDAR");
  return out.map(fold).join(CRLF) + CRLF;
}

/** Download the trip as a calendar file (named after the trip). */
export function downloadIcs(state: TripState) {
  const blob = new Blob([tripToIcs(state)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const slug = (state.meta.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug || "trip"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
