import type { Item, Reservation, TripState } from "./trips";
import { sortReservations } from "./trips";
import { daysBetween, formatShort, parseISODate } from "./dates";
import { dtf } from "./intl";
import type { Line } from "./budget";
import type { LegState, TravelMode } from "./routing";
import type { SectionInfo } from "../components/Section";

/* Pure trip-overview logic: readiness, nudges, budget pace and day summaries. No React here. */

export type Phase = "before" | "during" | "after";
export type OverviewTarget =
  | { kind: "addRes"; res: Partial<Reservation> }
  | { kind: "section"; key: string }
  | { kind: "item"; id: string }
  | { kind: "tab"; tab: "bookings" | "budget" };
export interface LookItem {
  id: string;
  ok: boolean;
  text: string;
  action?: { label: string; go: OverviewTarget };
}
export type Overview = ReturnType<typeof overviewOf>;

type Leg = { mode: TravelMode; state?: LegState };

/** Local calendar date as YYYY-MM-DD (matches how the trip's days are named). */
export const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Navigation points (waypoints) aren't stops: they don't count or show up in the day's plan. */
export const placesOf = (s: SectionInfo) => s.items.filter((i) => i.kind === "place" && !i.waypoint);

export function overviewOf(state: TripState, sections: SectionInfo[], today: string) {
  const { meta } = state;
  const days = daysBetween(meta.startDate, meta.endDate);
  const phase: Phase = today < meta.startDate ? "before" : today > meta.endDate ? "after" : "during";
  const dayIdx = days.indexOf(today);
  const until = Math.round((parseISODate(meta.startDate).getTime() - parseISODate(today).getTime()) / 86400000);
  const countdown =
    phase === "before" ? (until === 1 ? "Tomorrow" : `${until} days to go`) : phase === "during" ? `Day ${dayIdx + 1} of ${days.length}` : `Ended ${formatShort(meta.endDate)}`;
  const look = lookOf(state, sections, days);
  const readyCount = look.filter((l) => l.ok).length;
  return {
    phase,
    countdown,
    look: [...look.filter((l) => !l.ok), ...look.filter((l) => l.ok)],
    readyCount,
    pct: look.length ? readyCount / look.length : 0,
    attention: look.length - readyCount,
    travelers: meta.travelers?.length || 1,
    dayIdx,
    dayCount: days.length,
  };
}

/** Every "to look at" row: nights, flights, empty days, unscheduled places, overlaps, unpinned stops. */
function lookOf(state: TripState, sections: SectionInfo[], days: string[]): LookItem[] {
  const { meta, reservations, items } = state;
  const out: LookItem[] = [];

  // Stays: a night on an overnight flight or train counts as covered
  const nights = days.slice(0, -1);
  const lodging = reservations.filter((r) => r.type === "lodging" && r.startDate);
  const overnight = (d: string) => reservations.some((r) => (r.type === "flight" || r.type === "train") && r.startDate === d && (r.endDate ?? r.startDate) > d);
  const unbooked = nights.filter((d) => !overnight(d) && !lodging.some((h) => h.startDate! <= d && (h.endDate ?? h.startDate!) > d));
  if (nights.length)
    out.push(
      unbooked.length === 0
        ? { id: "stay", ok: true, text: "Every night has a place to stay" }
        : {
            id: "stay",
            ok: false,
            text: unbooked.length === nights.length ? "No accommodation booked yet" : `No stay for ${unbooked.length === 1 ? "the night of" : "the nights of"} ${listDates(unbooked)}`,
            action: { label: "Add", go: { kind: "addRes", res: { type: "lodging", startDate: unbooked[0] } } },
          },
    );

  // Flights
  const flightCount = new Set(reservations.filter((r) => r.type === "flight").map((f) => `${f.title}|${f.startDate}`)).size;
  out.push(
    flightCount
      ? { id: "flights", ok: true, text: `${flightCount} flight${flightCount > 1 ? "s" : ""} booked` }
      : { id: "flights", ok: false, text: "No flights added", action: { label: "Add", go: { kind: "addRes", res: { type: "flight", startDate: meta.startDate } } } },
  );

  // Days with no stops (a flight or train touching the day counts as something planned)
  const daySecs = sections.filter((s) => s.kind === "day");
  const empty = daySecs.filter((s) => placesOf(s).length === 0 && !reservations.some((r) => (r.type === "flight" || r.type === "train") && (r.startDate === s.date || r.endDate === s.date)));
  out.push(
    empty.length === 0
      ? { id: "days", ok: true, text: "Every day has something planned" }
      : {
          id: "days",
          ok: false,
          text: empty.length === 1 ? `Day ${empty[0].dayNumber} has nothing planned` : `${empty.length} days have nothing planned`,
          action: { label: "Plan", go: { kind: "section", key: empty[0].key } },
        },
  );

  // Saved places that aren't on a day yet
  const lists = sections.filter((s) => s.kind === "list");
  const unscheduled = lists.reduce((n, s) => n + placesOf(s).length, 0);
  const firstList = lists.find((s) => placesOf(s).length);
  out.push(
    unscheduled === 0
      ? { id: "saved", ok: true, text: "Every saved place has a day" }
      : {
          id: "saved",
          ok: false,
          text: `${unscheduled} saved place${unscheduled > 1 ? "s" : ""} not on a day`,
          action: firstList ? { label: "Plan", go: { kind: "section", key: firstList.key } } : undefined,
        },
  );

  // Overlapping timed stops (first two only)
  for (const c of conflictsOf(daySecs).slice(0, 2))
    out.push({
      id: `overlap-${c.b.id}`,
      ok: false,
      text: `${formatShort(c.day.date!)}: ${c.a.name} overlaps ${c.b.name}`,
      action: { label: "Show", go: { kind: "item", id: c.b.id } },
    });

  // Stops without a pin
  const unpinned = items.filter((i) => i.kind === "place" && (i.lat == null || i.lng == null)).length;
  out.push(
    unpinned === 0
      ? { id: "pins", ok: true, text: "Every stop is on the map" }
      : { id: "pins", ok: false, text: `${unpinned} stop${unpinned > 1 ? "s aren't" : " isn't"} on the map yet` },
  );
  return out;
}

/** Days with overlapping timed stops. */
export function conflictsOf(daySections: SectionInfo[]) {
  const conflicts: { day: SectionInfo; a: Item; b: Item }[] = [];
  for (const s of daySections) {
    const timed = placesOf(s)
      .filter((i) => i.startTime && i.endTime)
      .sort((x, y) => x.startTime!.localeCompare(y.startTime!));
    for (let i = 1; i < timed.length; i++) if (timed[i].startTime! < timed[i - 1].endTime!) conflicts.push({ day: s, a: timed[i - 1], b: timed[i] });
  }
  return conflicts;
}

/** Cumulative spend by day for the sparkline. Lines outside the trip count on the nearest day. */
export function spendSeries(lines: Line[], start: string, end: string, budget?: number, today?: string) {
  const days = daysBetween(start, end);
  const byDay = new Map<string, number>();
  for (const l of lines) {
    const d = !l.date || l.date < start ? days[0] : l.date > end ? days.at(-1)! : l.date;
    byDay.set(d, (byDay.get(d) ?? 0) + (l.converted ?? 0));
  }
  // Only up to today (or the end of the trip, when no day is given)
  const shown = today ? Math.max(1, days.filter((d) => d <= today).length) : days.length;
  let run = 0;
  const actual = days.slice(0, shown).map((d) => (run += byDay.get(d) ?? 0));
  const plan = budget ? days.map((_, i) => (days.length > 1 ? (budget * i) / (days.length - 1) : budget)) : null;
  return { days, actual, plan };
}

/** Spending against the budget; during the trip, only warn once you're clearly ahead of pace. */
export function budgetPace(budget: number | undefined, spent: number, phase: Phase, dayIdx: number, dayCount: number) {
  const elapsed = phase === "before" ? 0 : phase === "after" ? 1 : (dayIdx + 1) / dayCount;
  const pct = budget ? spent / budget : 0;
  // Bookings are paid up front, so only warn once you're clearly ahead of pace
  const trendingOver = !!budget && (pct > 1 || (phase === "during" && pct > Math.min(1, elapsed + 0.25)));
  return { pct, trendingOver };
}

/** Key bookings (upcoming first when before/during), one row per booking. */
export function keyBookingsOf(reservations: Reservation[], phase: Phase, today: string, limit = 4) {
  const seen = new Set<string>();
  return sortReservations(reservations.filter((r) => r.type === "flight" || r.type === "lodging" || r.type === "train"))
    .filter((r) => (phase === "after" ? true : (r.endDate ?? r.startDate ?? "9999") >= today))
    .filter((r) => (seen.has(`${r.title}|${r.startDate}`) ? false : (seen.add(`${r.title}|${r.startDate}`), true)))
    .slice(0, limit);
}

/** One day card: title, stop count, route length and the pinned stops' [lng, lat] in order. */
export function dayCardOf(s: SectionInfo, legs: Map<string, Leg> | undefined, subtitle?: string) {
  const stops = placesOf(s);
  const named = stops
    .slice(0, 2)
    .map((i) => i.name)
    .join(" & ");
  let meters = 0;
  const modes = new Map<TravelMode, number>();
  for (const l of legs?.values() ?? []) {
    modes.set(l.mode, (modes.get(l.mode) ?? 0) + 1);
    if (typeof l.state === "object") meters += l.state.distance;
  }
  const mode = [...modes].sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    title: subtitle ?? (named || "Nothing yet"),
    empty: stops.length === 0,
    stops: stops.length,
    distanceKm: meters / 1000,
    mode,
    points: stops.filter((i) => i.lat != null && i.lng != null).map((i) => [i.lng!, i.lat!] as [number, number]),
  };
}

/** "2.1 km walk", "12 km drive", "5.6 km by transit". */
export function distanceText(km: number, mode?: TravelMode) {
  const n = km < 10 ? km.toFixed(1) : String(Math.round(km));
  const word = { walk: "walk", bike: "bike", drive: "drive", transit: "by transit" }[mode ?? "drive"] ?? "";
  return mode ? `${n} km ${word}` : `${n} km`;
}

/** "Fri, Nov 14" */
export const formatDayShort = (s: string) => dtf(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(parseISODate(s));

/** "Nov 30, Dec 2 and Dec 5" (first four, then "+N more"). */
export function listDates(ds: string[]) {
  const f = ds.slice(0, 4).map(formatShort);
  const more = ds.length > 4 ? ` +${ds.length - 4} more` : "";
  return f.length > 1 ? `${f.slice(0, -1).join(", ")} and ${f.at(-1)}${more}` : `${f[0]}${more}`;
}
