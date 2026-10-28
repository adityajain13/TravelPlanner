import type { Bookend } from "../components/DayCompare";
import type { Pin, Route } from "../components/TripMap";
import { stopTime, type SectionInfo } from "../components/Section";
import { dayColor, LIST_COLOR } from "./colors";
import { daysBetween } from "./dates";
import { flightAirports, flightArc, flightInstant, type Airport, type AirportDb } from "./airports";
import { departureTime, legKey, type LegRequest, type LegState, type TravelMode } from "./routing";
import { RES_GLYPH } from "./pinArt";
import { autoTimes, DEFAULT_DAY_START, DEFAULT_STAY } from "./autoTime";
import { draftSection, isDraftSection, mainPlanName, sectionsFor, type Item, type Reservation, type TripState } from "./trips";

export const ORPHAN = "orphan";

export function groupItems(state: TripState) {
  const order = sectionsFor(state);
  const days = daysBetween(state.meta.startDate, state.meta.endDate);
  const bySection = new Map<string, Item[]>(order.map((s) => [s, []]));
  const orphans: Item[] = [];
  const draftItems = new Map<string, Item[]>();
  for (const it of state.items)
    if (isDraftSection(it.section)) (draftItems.get(it.section) ?? draftItems.set(it.section, []).get(it.section)!).push(it);
    else (bySection.get(it.section) ?? orphans).push(it);
  return { order, days, bySection, orphans, draftItems };
}

export function buildSections(state: TripState, grouped: ReturnType<typeof groupItems>, dayDraft: Record<string, string>): SectionInfo[] {
  const { order, days, bySection, orphans, draftItems } = grouped;
  const sections: SectionInfo[] = order.map((key) => {
    if (key.startsWith("list:")) {
      const l = state.lists.find((x) => `list:${x.id}` === key)!;
      return { key, kind: "list", title: l.title, listId: l.id, color: LIST_COLOR, items: bySection.get(key)! };
    }
    const date = key.slice(4);
    const i = days.indexOf(date);
    const drafts = state.drafts.filter((d) => d.date === date);
    const shown = drafts.find((d) => d.id === dayDraft[date]);
    return {
      key,
      kind: "day",
      date,
      dayNumber: i + 1,
      color: dayColor(i, date, state.meta.dayColors),
      items: shown ? (draftItems.get(draftSection(shown.id)) ?? []) : bySection.get(key)!,
      writeKey: shown ? draftSection(shown.id) : key,
      versions: drafts.length ? [{ name: mainPlanName(state.meta, date), id: undefined }, ...drafts.map((d) => ({ id: d.id, name: d.name }))] : undefined,
      draftId: shown?.id,
    };
  });
  if (orphans.length)
    sections.push({ key: ORPHAN, kind: "list", title: "Outside trip dates", color: LIST_COLOR, items: orphans, readonlyTitle: true });
  return sections;
}

/* ---- Routing a day: pins, legs (stop to stop, hotel, airports), and where each day starts/ends ---- */

type Flight = { r: Reservation; dep: Airport; arr: Airport; arrDate: string };
type Leg = { section: string; ver: string; ghost?: boolean; who?: string[]; toId: string; color: string; req: LegRequest; label?: string };

/** What every day's routing needs to know about the whole trip. */
function tripContext(state: TripState, airportDb: AirportDb | null) {
  // Where you slept / sleep: lodging bookings with a pin, for legs from and back to the hotel
  const hotels = state.reservations.filter((r) => r.type === "lodging" && r.lat != null && r.lng != null && r.startDate);
  // Flights by day, so days start at the arrival airport and end at the departure airport
  const flightsOn: Flight[] = [];
  if (airportDb)
    for (const r of state.reservations) {
      const ends = flightAirports(r, airportDb);
      if (ends && r.startDate && !flightsOn.some((f) => f.r.startDate === r.startDate && f.r.startTime === r.startTime && f.dep.code === ends[0].code))
        flightsOn.push({ r, dep: ends[0], arr: ends[1], arrDate: r.endDate ?? r.startDate });
    }
  return {
    state,
    defaultMode: (state.meta.travelMode ?? "drive") as TravelMode,
    morningHotel: (d: string) => hotels.find((h) => h.startDate! < d && (h.endDate ?? h.startDate!) >= d),
    eveningHotel: (d: string) => hotels.find((h) => h.startDate! <= d && (h.endDate ?? h.startDate!) > d),
    flightsOn,
  };
}
type Ctx = ReturnType<typeof tripContext>;

const timeOf = (t?: string) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.padStart(5, "0") : undefined);
const ll = (p: { lat: number; lng: number }): [number, number] => [p.lng, p.lat];
const samePoint = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 0.0005;

/**
 * The day's flights. A landing followed by another flight out of the same airport is a
 * connection, not where the day continues; likewise that onward flight isn't "leaving" from a stop.
 */
function dayFlights(ctx: Ctx, s: SectionInfo) {
  const todayOut = s.kind === "day" ? ctx.flightsOn.filter((f) => f.r.startDate === s.date) : [];
  const todayIn = s.kind === "day" ? ctx.flightsOn.filter((f) => f.arrDate === s.date) : [];
  const connects = (inb: Flight, out: Flight) => inb !== out && out.dep.code === inb.arr.code && (flightInstant(out.r, "dep") ?? 0) >= (flightInstant(inb.r, "arr") ?? 0);
  const landing = todayIn
    .filter((f) => !todayOut.some((o) => connects(f, o)))
    .sort((a, b) => (flightInstant(a.r, "arr") ?? 0) - (flightInstant(b.r, "arr") ?? 0))
    .at(-1);
  const leaving = todayOut
    .filter((o) => !todayIn.some((f) => connects(f, o)))
    .sort((a, b) => (flightInstant(a.r, "dep") ?? 0) - (flightInstant(b.r, "dep") ?? 0))[0];
  return { landing, leaving, landed: landing ? timeOf(landing.r.endTime) : undefined };
}
type DayFlights = ReturnType<typeof dayFlights>;

/** Where the day starts and ends (Compare's Start/End rows): any hotel booking counts here, pinned or not. */
function dayBookends(state: TripState, s: SectionInfo, f: DayFlights): { start?: Bookend; end?: Bookend } {
  const stays = state.reservations.filter((r) => r.type === "lodging" && r.startDate);
  const mh = stays.find((h) => h.startDate! < s.date! && (h.endDate ?? h.startDate!) >= s.date!);
  const eh = stays.find((h) => h.startDate! <= s.date! && (h.endDate ?? h.startDate!) > s.date!);
  return {
    start: f.landing ? { name: `${f.landing.arr.name} (${f.landing.arr.code})`, kind: "airport", time: f.landed } : mh ? { name: mh.title, kind: "hotel" } : undefined,
    end: f.leaving ? { name: `${f.leaving.dep.name} (${f.leaving.dep.code})`, kind: "airport", time: timeOf(f.leaving.r.startTime) } : eh ? { name: eh.title, kind: "hotel" } : undefined,
  };
}

/**
 * Adds legs for one day, one plan and one person's route (`lane`; undefined = everyone).
 * `skipSamePoint`: airport and night-hotel legs are dropped when they'd go nowhere; the morning
 * hotel leg and stop-to-stop legs never are (as before the split).
 */
function legAdder(s: SectionInfo, out: Leg[], ghost: boolean, lane: string | undefined) {
  return (toId: string, from: [number, number], to: [number, number], o: { mode: TravelMode; at?: string; label?: string; skipSamePoint?: boolean }) => {
    if (o.skipSamePoint && samePoint(from, to)) return;
    const when = o.mode === "transit" ? departureTime(s.date!, o.at, to[0]) : undefined;
    out.push({ section: s.key, ver: s.writeKey ?? s.key, ghost, who: lane ? [lane] : undefined, toId, color: s.color, ...(o.label ? { label: o.label } : {}), req: { key: legKey(o.mode, from, to, when), mode: o.mode, from, to, when } });
  };
}
type AddLeg = ReturnType<typeof legAdder>;

/** To the departure airport: from the last stop before take-off, else from where you slept. */
function departureLeg(ctx: Ctx, s: SectionInfo, items: Item[], f: DayFlights, add: AddLeg) {
  const { leaving, landing } = f;
  if (!leaving || s.kind !== "day") return;
  const depAt = timeOf(leaving.r.startTime);
  const placed = items.filter((i) => i.kind === "place" && i.lat != null);
  const timed = placed.some((i) => stopTime(i));
  // Untimed stops on a day you fly out (and don't also land): the flight comes after them
  const before = timed || leaving === landing ? placed.filter((i) => depAt && stopTime(i) && stopTime(i)! < depAt).at(-1) : placed.at(-1);
  const mh = ctx.morningHotel(s.date!);
  const from = before ? ([before.lng!, before.lat!] as [number, number]) : mh ? ll({ lat: mh.lat!, lng: mh.lng! }) : undefined;
  if (!from) return;
  // Leave about 3 hours before take-off (transit timetables)
  const at = depAt ? `${String(Math.max(0, +depAt.slice(0, 2) - 3)).padStart(2, "0")}${depAt.slice(2)}` : undefined;
  add(`dep:${leaving.r.title}|${leaving.r.startDate}`, from, ll(leaving.dep), { mode: ctx.state.meta.hotelLegModes?.[`${s.key}|dep`] ?? ctx.defaultMode, at, label: `To ${leaving.dep.name} (${leaving.dep.code})`, skipSamePoint: true });
}

/** Into each pinned stop: from the arrival airport or the hotel for the first, then stop to stop. Returns the last stop. */
function stopLegs(ctx: Ctx, s: SectionInfo, items: Item[], f: DayFlights, add: AddLeg): Item | null {
  const { landing, landed } = f;
  let prev: Item | null = null;
  let first = true;
  for (const it of items) {
    if (it.kind !== "place" || it.lat == null || it.lng == null) continue;
    const to: [number, number] = [it.lng, it.lat];
    const mode = it.travelMode ?? ctx.defaultMode;
    if (s.kind === "day" && first && landing && !(landed && stopTime(it) && stopTime(it)! < landed)) {
      // First stop after landing: from the arrival airport instead of a hotel
      first = false;
      add(it.id, ll(landing.arr), to, { mode, at: landed, label: `From ${landing.arr.name} (${landing.arr.code})`, skipSamePoint: true });
    }
    if (s.kind === "day" && first) {
      first = false;
      const h = ctx.morningHotel(s.date!);
      if (h) add(it.id, [h.lng!, h.lat!], to, { mode, at: it.startTime, label: `From ${h.title}` });
    }
    if (s.kind === "day" && prev) add(it.id, [prev.lng!, prev.lat!], to, { mode, at: prev.endTime ?? prev.startTime ?? it.startTime });
    prev = it;
  }
  return prev;
}

/** Ending the day: straight from the airport to tonight's hotel if nothing follows the landing, else back from the last stop. */
function eveningLegs(ctx: Ctx, s: SectionInfo, f: DayFlights, prev: Item | null, add: AddLeg) {
  if (s.kind !== "day") return;
  const { landing, landed } = f;
  const mode = ctx.state.meta.hotelLegModes?.[s.key] ?? ctx.defaultMode;
  const landedLast = !!(landed && prev && stopTime(prev) && stopTime(prev)! < landed);
  if (landing && (!prev || landedLast)) {
    const h = ctx.eveningHotel(s.date!);
    if (h) add("end", ll(landing.arr), [h.lng!, h.lat!], { mode, at: landed, label: `${landing.arr.code} to ${h.title}`, skipSamePoint: true });
  }
  const night = prev && !(landing && landedLast) ? ctx.eveningHotel(s.date!) : undefined;
  if (night && prev) add("end", [prev.lng!, prev.lat!], [night.lng!, night.lat!], { mode, at: prev.endTime ?? prev.startTime ?? "18:00", label: `To ${night.title}`, skipSamePoint: true });
}

/** One route through a day (everyone's, or one person's when they go separately). */
function walkLane(ctx: Ctx, out: ItineraryParts, s: SectionInfo, items: Item[], ghost: boolean, lane?: string) {
  const f = dayFlights(ctx, s);
  if (f.landed) out.landings.set(s.writeKey ?? s.key, f.landed);
  if (s.kind === "day") out.bookends.set(s.writeKey ?? s.key, dayBookends(ctx.state, s, f));
  const add = legAdder(s, out.legs, ghost, lane);
  departureLeg(ctx, s, items, f, add);
  const last = stopLegs(ctx, s, items, f, add);
  eveningLegs(ctx, s, f, last, add);
}

/**
 * People going separately: the same leg on several routes becomes one leg (theirs together);
 * different legs into the same place get one chip per person, keyed "<id>#1", "<id>#2"…
 */
function mergeLanes(mine: Leg[]): Leg[] {
  const merged: Leg[] = [];
  for (const l of mine) {
    const same = merged.find((m) => m.toId === l.toId && m.req.key === l.req.key);
    if (same) same.who = [...(same.who ?? []), ...(l.who ?? [])];
    else merged.push({ ...l });
  }
  const byTo = new Map<string, Leg[]>();
  for (const l of merged) byTo.set(l.toId, [...(byTo.get(l.toId) ?? []), l]);
  for (const group of byTo.values()) {
    if (group.length > 1)
      group.forEach((l, i) => {
        l.label = `${(l.who ?? []).join(" & ")}${l.label ? ` · ${l.label}` : ""}`;
        if (i) l.toId = `${l.toId}#${i}`;
      });
    else group[0].who = undefined; // everyone's leg: no name
  }
  return merged;
}

/** A day's legs: one route, or one per person when some stops are only theirs. */
function walkDay(ctx: Ctx, out: ItineraryParts, s: SectionInfo, ghost: boolean) {
  const people = ctx.state.meta.travelers ?? [];
  const split = s.kind === "day" && people.length > 1 && s.items.some((i) => i.kind === "place" && i.who?.length);
  if (!split) return walkLane(ctx, out, s, s.items, ghost);
  const startAt = out.legs.length;
  for (const person of people) walkLane(ctx, out, s, s.items.filter((i) => i.kind !== "place" || !i.who?.length || i.who.includes(person)), ghost, person);
  out.legs.push(...mergeLanes(out.legs.splice(startAt)));
}

/** Numbered pins for a day's (or list's) stops. */
function stopPins(s: SectionInfo, focus: string | null): Pin[] {
  const pins: Pin[] = [];
  let n = 0;
  for (const it of s.items) {
    if (it.kind !== "place") continue;
    n++;
    if (it.lat != null && it.lng != null && (!focus || s.key === focus))
      pins.push({ id: it.id, lat: it.lat, lng: it.lng, color: s.color, label: String(n), name: it.name, image: it.image?.thumb, unsplash: it.image?.source === "unsplash" ? { name: it.image.authorName ?? "Unknown", author: it.image.author } : undefined });
  }
  return pins;
}

/** Lodging and restaurant bookings with a location get their own pins (one per booking, with its type's symbol). */
function bookingPins(state: TripState, pins: Pin[]): Pin[] {
  const out: Pin[] = [];
  for (const r of state.reservations)
    if (r.lat != null && r.lng != null && r.type !== "flight" && ![...pins, ...out].some((p) => p.id === `res:${r.id}` || (p.id.startsWith("res:") && p.name === r.title)))
      out.push({ id: `res:${r.id}`, lat: r.lat, lng: r.lng, color: "#e8ece9", label: "", glyph: RES_GLYPH[r.type], name: r.title });
  return out;
}

interface ItineraryParts {
  legs: Leg[];
  landings: Map<string, string>; // plan → when that day's flight lands (auto times start then)
  bookends: Map<string, { start?: Bookend; end?: Bookend }>; // plan → where the day starts/ends
}

export function buildItinerary(state: TripState, opts: { focus: string | null; airportDb: AirportDb | null; dayDraft: Record<string, string> }) {
  const { focus, airportDb } = opts;
  const grouped = groupItems(state);
  const sections = buildSections(state, grouped, opts.dayDraft);
  const ctx = tripContext(state, airportDb);
  // ver: which plan a leg belongs to (the day's key or a draft section); ghost legs are for plans
  // not shown, routed only so Compare can total their travel
  const out: ItineraryParts = { legs: [], landings: new Map(), bookends: new Map() };
  const pins: Pin[] = [];
  for (const s of sections) {
    pins.push(...stopPins(s, focus));
    walkDay(ctx, out, s, false);
  }
  // The plans not shown (the day's plan while a draft is up, other drafts)
  for (const s of sections)
    for (const v of s.versions ?? []) {
      const ver = v.id ? draftSection(v.id) : s.key;
      if (ver !== s.writeKey) walkDay(ctx, out, { ...s, writeKey: ver, items: v.id ? (grouped.draftItems.get(ver) ?? []) : grouped.bySection.get(s.key)! }, true);
    }
  if (!focus) pins.push(...bookingPins(state, pins));
  return { sections, pins, legs: out.legs, landings: out.landings, bookends: out.bookends };
}

export type Itinerary = ReturnType<typeof buildItinerary>;

export function airportPins(state: TripState | null, view: Itinerary | null, airportDb: AirportDb | null, focus: string | null): { pins: Pin[]; arcs: Route[] } {
  const pins: Pin[] = [];
  const arcs: Route[] = [];
  if (!airportDb || !state || !view || focus) return { pins, arcs };
  const seenArc = new Set<string>();
  const dayColorOf = new Map(view.sections.filter((s) => s.kind === "day").map((s) => [s.date!, s.color]));
  for (const r of state.reservations) {
    const ends = flightAirports(r, airportDb);
    if (!ends) continue;
    for (const a of ends)
      if (!pins.some((p) => p.id === `apt:${a.code}`)) pins.push({ id: `apt:${a.code}`, lat: a.lat, lng: a.lng, color: "#e8ece9", label: a.code, glyph: "plane", name: `${a.name} (${a.code})` });
    const key = `${ends[0].code}-${ends[1].code}-${r.startDate ?? ""}`; // one arc per flight, not per passenger
    if (seenArc.has(key)) continue;
    seenArc.add(key);
    arcs.push({ color: dayColorOf.get(r.startDate ?? "") ?? "#9aa59f", coords: flightArc(ends[0], ends[1]), style: "arc" });
  }
  return { pins, arcs };
}

export function mapRoutes(legs: Itinerary["legs"], legResults: Map<string, LegState>, focus: string | null): Route[] {
  return legs
    .filter((l) => !l.ghost && (!focus || l.section === focus))
    .map((l) => {
      const r = legResults.get(l.req.key);
      if (typeof r === "object") {
        // Estimates follow the road on the map but stay dashed, so they read as approximate
        const style: Route["style"] = r.mode === "flight" || r.rough ? "dashed" : r.mode === "walk" ? "dotted" : "solid";
        return { color: l.color, coords: r.coords, style };
      }
      return { color: l.color, coords: [l.req.from, l.req.to], style: "dashed" as const };
    });
}

export function legsByPlan(legs: Itinerary["legs"], legResults: Map<string, LegState>) {
  const m = new Map<string, Map<string, { mode: TravelMode; state?: LegState | undefined; from: [number, number]; to: [number, number]; label?: string; who?: string[] }>>();
  for (const l of legs) {
    if (!m.has(l.ver)) m.set(l.ver, new Map());
    m.get(l.ver)!.set(l.toId, { mode: l.req.mode, state: legResults.get(l.req.key), from: l.req.from, to: l.req.to, label: l.label, who: l.who });
  }
  return m;
}

export type PlanLegs = ReturnType<typeof legsByPlan>;

export function withAutoTimes(view: Itinerary | null, state: TripState | null, autoOn: boolean, legsBySection: PlanLegs) {
  const info = new Map<string, { stay: number; isDefault: boolean; nextDay: boolean }>();
  if (!view || !state || !autoOn) return { sections: view?.sections ?? [], info };
  const sections = view.sections.map((s) => {
    if (s.kind !== "day") return s;
    const ver = s.writeKey ?? s.key;
    const t = autoTimes(s.items, legsBySection.get(ver), state.meta.dayStarts?.[s.date!] ?? DEFAULT_DAY_START, view.landings.get(ver), state.meta.travelers);
    return {
      ...s,
      items: s.items.map((it) => {
        const x = t.get(it.id);
        if (!x) return it;
        info.set(it.id, { stay: it.stay ?? DEFAULT_STAY, isDefault: it.stay == null, nextDay: x.nextDay });
        return { ...it, startTime: x.start, endTime: x.end };
      }),
    };
  });
  return { sections, info };
}

/** Pins (numbered stops + the hotel/airport its legs touch) and routes for one plan of a day. */
export function planMapData(view: Itinerary, extraPins: Pin[], legResults: Map<string, LegState>, ver: string, items: Item[], color: string, opts: { includeGhost: boolean; numberedPins: boolean }) {
  const legs = view.legs.filter((l) => l.ver === ver && (opts.includeGhost || !l.ghost));
  const routes = legs.map((l): Route => {
    const r = legResults.get(l.req.key);
    if (typeof r === "object") return { color: l.color, coords: r.coords, style: r.mode === "flight" || r.rough ? "dashed" : r.mode === "walk" ? "dotted" : "solid" };
    return { color: l.color, coords: [l.req.from, l.req.to], style: "dashed" };
  });
  // A hotel or airport pin that a leg starts or ends at
  const ends = legs.flatMap((l) => [l.req.from, l.req.to]);
  const atEnd = (x: Pin) => (x.id.startsWith("res:") || x.id.startsWith("apt:")) && ends.some(([lng, lat]) => Math.abs(lng - x.lng) + Math.abs(lat - x.lat) < 0.002);
  const pins: Pin[] = [];
  if (opts.numberedPins) {
    // Compare: the plan's stops numbered in order, then the hotel / airport its legs touch
    let n = 0;
    for (const it of items) {
      if (it.kind !== "place") continue;
      n++;
      if (it.lat != null && it.lng != null) pins.push({ id: it.id, lat: it.lat, lng: it.lng, color, label: String(n), name: it.name });
    }
    for (const x of [...view.pins, ...extraPins]) if (atEnd(x) && !pins.some((q) => q.id === x.id)) pins.push(x);
  } else {
    // Travel mode: the day's existing pins (stops, hotel / airport pins at its legs)
    const ids = new Set(items.map((i) => i.id));
    pins.push(...[...view.pins, ...extraPins].filter((x) => ids.has(x.id) || atEnd(x)));
  }
  return { legs, pins, routes };
}
