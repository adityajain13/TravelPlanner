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

export function buildItinerary(state: TripState, opts: { focus: string | null; airportDb: AirportDb | null; dayDraft: Record<string, string> }) {
  const { focus, airportDb } = opts;
  const grouped = groupItems(state);
  const sections = buildSections(state, grouped, opts.dayDraft);
  const { bySection, draftItems } = grouped;
  const pins: Pin[] = [];
  // Legs between consecutive pinned stops of each day; routed in useLegs below
  // ver: which plan the leg belongs to (the day's key or a draft section); ghost legs are for plans
  // not shown, routed only so Compare can total their travel
  const legs: { section: string; ver: string; ghost?: boolean; who?: string[]; toId: string; color: string; req: LegRequest; label?: string }[] = [];
  const defaultMode: TravelMode = state.meta.travelMode ?? "drive";
  // Where you slept / sleep: lodging bookings with a pin, for legs from and back to the hotel
  const hotels = state.reservations.filter((r) => r.type === "lodging" && r.lat != null && r.lng != null && r.startDate);
  const morningHotel = (d: string) => hotels.find((h) => h.startDate! < d && (h.endDate ?? h.startDate!) >= d);
  const eveningHotel = (d: string) => hotels.find((h) => h.startDate! <= d && (h.endDate ?? h.startDate!) > d);
  // Flights by day, so days start at the arrival airport and end at the departure airport
  type Flight = { r: Reservation; dep: Airport; arr: Airport; arrDate: string };
  const flightsOn: Flight[] = [];
  if (airportDb)
    for (const r of state.reservations) {
      const ends = flightAirports(r, airportDb);
      if (ends && r.startDate && !flightsOn.some((f) => f.r.startDate === r.startDate && f.r.startTime === r.startTime && f.dep.code === ends[0].code))
        flightsOn.push({ r, dep: ends[0], arr: ends[1], arrDate: r.endDate ?? r.startDate });
    }
  const timeOf = (t?: string) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.padStart(5, "0") : undefined);
  const ll = (p: { lat: number; lng: number }): [number, number] => [p.lng, p.lat];
  const landings = new Map<string, string>();
  const bookends = new Map<string, { start?: Bookend; end?: Bookend }>(); // plan → where the day starts/ends // plan → when that day's flight lands (auto times start then)
  let ghost = false; // set by walk() below: legs of a plan that isn't shown
  const pushLeg = (s: SectionInfo, toId: string, label: string, from: [number, number], to: [number, number], at?: string, modeOverride?: TravelMode) => {
    if (Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) < 0.0005) return;
    const mode = modeOverride ?? defaultMode;
    const when = mode === "transit" ? departureTime(s.date!, at, to[0]) : undefined;
    legs.push({ section: s.key, ver: s.writeKey ?? s.key, ghost, who: lane ? [lane] : undefined, toId, color: s.color, label, req: { key: legKey(mode, from, to, when), mode, from, to, when } });
  };

  // One route per person when some stops are only theirs (each from their own home to the
  // airport…); `lane` is whose route is being walked, undefined = everyone together
  let lane: string | undefined;
  const walkLane = (s: SectionInfo, asGhost: boolean, items: Item[]) => {
    ghost = asGhost;
    let prev: Item | null = null;
    let first = true;
    // Today's flights. A landing followed by another flight out of the same airport is a
    // connection, not where the day continues; likewise that onward flight isn't "leaving" from a stop.
    const todayOut = s.kind === "day" ? flightsOn.filter((f) => f.r.startDate === s.date) : [];
    const todayIn = s.kind === "day" ? flightsOn.filter((f) => f.arrDate === s.date) : [];
    const connects = (inb: Flight, out: Flight) => inb !== out && out.dep.code === inb.arr.code && (flightInstant(out.r, "dep") ?? 0) >= (flightInstant(inb.r, "arr") ?? 0);
    const landing = todayIn
      .filter((f) => !todayOut.some((o) => connects(f, o)))
      .sort((a, b) => (flightInstant(a.r, "arr") ?? 0) - (flightInstant(b.r, "arr") ?? 0))
      .at(-1);
    const leaving = todayOut
      .filter((o) => !todayIn.some((f) => connects(f, o)))
      .sort((a, b) => (flightInstant(a.r, "dep") ?? 0) - (flightInstant(b.r, "dep") ?? 0))[0];
    const landed = landing ? timeOf(landing.r.endTime) : undefined;
    if (landed) landings.set(s.writeKey ?? s.key, landed);
    if (s.kind === "day") {
      // Any hotel booking counts here, pinned or not (the legs need a pin; the label doesn't)
      const stays = state.reservations.filter((r) => r.type === "lodging" && r.startDate);
      const mh = stays.find((h) => h.startDate! < s.date! && (h.endDate ?? h.startDate!) >= s.date!);
      const eh = stays.find((h) => h.startDate! <= s.date! && (h.endDate ?? h.startDate!) > s.date!);
      bookends.set(s.writeKey ?? s.key, {
        start: landing ? { name: `${landing.arr.name} (${landing.arr.code})`, kind: "airport", time: landed } : mh ? { name: mh.title, kind: "hotel" } : undefined,
        end: leaving ? { name: `${leaving.dep.name} (${leaving.dep.code})`, kind: "airport", time: timeOf(leaving.r.startTime) } : eh ? { name: eh.title, kind: "hotel" } : undefined,
      });
    }
    if (leaving && s.kind === "day") {
      // To the departure airport: from the last stop before take-off, else from where you slept
      const depAt = timeOf(leaving.r.startTime);
      const placed = items.filter((i) => i.kind === "place" && i.lat != null);
      const timed = placed.some((i) => stopTime(i));
      // Untimed stops on a day you fly out (and don't also land): the flight comes after them
      const before = timed || leaving === landing ? placed.filter((i) => depAt && stopTime(i) && stopTime(i)! < depAt).at(-1) : placed.at(-1);
      const from = before ? ([before.lng!, before.lat!] as [number, number]) : morningHotel(s.date!) ? ll({ lat: morningHotel(s.date!)!.lat!, lng: morningHotel(s.date!)!.lng! }) : undefined;
      if (from) pushLeg(s, `dep:${leaving.r.title}|${leaving.r.startDate}`, `To ${leaving.dep.name} (${leaving.dep.code})`, from, ll(leaving.dep), depAt ? `${String(Math.max(0, +depAt.slice(0, 2) - 3)).padStart(2, "0")}${depAt.slice(2)}` : undefined, state.meta.hotelLegModes?.[`${s.key}|dep`]);
    }
    for (const it of items) {
      if (it.kind !== "place") continue;
      if (it.lat == null || it.lng == null) continue;
      if (s.kind === "day" && first && landing && !(landed && stopTime(it) && stopTime(it)! < landed)) {
        // First stop after landing: from the arrival airport instead of a hotel
        first = false;
        pushLeg(s, it.id, `From ${landing.arr.name} (${landing.arr.code})`, ll(landing.arr), [it.lng, it.lat], landed, it.travelMode);
      }
      if (s.kind === "day" && first) {
        first = false;
        const h = morningHotel(s.date!);
        if (h) {
          const mode = it.travelMode ?? defaultMode;
          const from: [number, number] = [h.lng!, h.lat!];
          const to: [number, number] = [it.lng, it.lat];
          const when = mode === "transit" ? departureTime(s.date!, it.startTime, it.lng) : undefined;
          legs.push({ section: s.key, ver: s.writeKey ?? s.key, ghost, who: lane ? [lane] : undefined, toId: it.id, color: s.color, label: `From ${h.title}`, req: { key: legKey(mode, from, to, when), mode, from, to, when } });
        }
      }
      if (s.kind === "day" && prev) {
        const mode = it.travelMode ?? defaultMode;
        const from: [number, number] = [prev.lng!, prev.lat!];
        const to: [number, number] = [it.lng, it.lat];
        const when = mode === "transit" ? departureTime(s.date!, prev.endTime ?? prev.startTime ?? it.startTime, it.lng) : undefined;
        legs.push({ section: s.key, ver: s.writeKey ?? s.key, ghost, who: lane ? [lane] : undefined, toId: it.id, color: s.color, req: { key: legKey(mode, from, to, when), mode, from, to, when } });
      }
      prev = it;
    }
    // Landed with no stops after: straight from the airport to tonight's hotel
    if (s.kind === "day" && landing && (!prev || (landed && stopTime(prev) && stopTime(prev)! < landed))) {
      const h = eveningHotel(s.date!);
      if (h) pushLeg(s, "end", `${landing.arr.code} to ${h.title}`, ll(landing.arr), [h.lng!, h.lat!], landed, state.meta.hotelLegModes?.[s.key]);
    }
    // …and back to tonight's hotel after the last stop
    const night = s.kind === "day" && prev && !(landing && landed && stopTime(prev) && stopTime(prev)! < landed) ? eveningHotel(s.date!) : undefined;
    if (night && prev) {
      const mode = state.meta.hotelLegModes?.[s.key] ?? defaultMode;
      const from: [number, number] = [prev.lng!, prev.lat!];
      const to: [number, number] = [night.lng!, night.lat!];
      if (Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) > 0.0005) {
        const when = mode === "transit" ? departureTime(s.date!, prev.endTime ?? prev.startTime ?? "18:00", to[0]) : undefined;
        legs.push({ section: s.key, ver: s.writeKey ?? s.key, ghost, who: lane ? [lane] : undefined, toId: "end", color: s.color, label: `To ${night.title}`, req: { key: legKey(mode, from, to, when), mode, from, to, when } });
      }
    }
  };
  const walk = (s: SectionInfo, asGhost: boolean) => {
    if (!asGhost) {
      let n = 0;
      for (const it of s.items) {
        if (it.kind !== "place") continue;
        n++;
        if (it.lat != null && it.lng != null && (!focus || s.key === focus))
          pins.push({ id: it.id, lat: it.lat, lng: it.lng, color: s.color, label: String(n), name: it.name, image: it.image?.thumb, unsplash: it.image?.source === "unsplash" ? { name: it.image.authorName ?? "Unknown", author: it.image.author } : undefined });
      }
    }
    const people = state.meta.travelers ?? [];
    const split = s.kind === "day" && people.length > 1 && s.items.some((i) => i.kind === "place" && i.who?.length);
    lane = undefined;
    if (!split) return walkLane(s, asGhost, s.items);
    const startAt = legs.length;
    for (const person of people) {
      lane = person;
      walkLane(s, asGhost, s.items.filter((i) => i.kind !== "place" || !i.who?.length || i.who.includes(person)));
    }
    lane = undefined;
    // The same leg on several people's routes is one leg (theirs together)
    const mine = legs.splice(startAt);
    const merged: typeof mine = [];
    for (const l of mine) {
      const same = merged.find((m) => m.toId === l.toId && m.req.key === l.req.key);
      if (same) same.who = [...(same.who ?? []), ...(l.who ?? [])];
      else merged.push({ ...l });
    }
    // Different legs into the same place (each from their own home): one chip per person, keyed
    // "<id>#1", "<id>#2"… after the first
    const byTo = new Map<string, typeof merged>();
    for (const l of merged) byTo.set(l.toId, [...(byTo.get(l.toId) ?? []), l]);
    for (const group of byTo.values()) {
      if (group.length > 1)
        group.forEach((l, i) => {
          l.label = `${(l.who ?? []).join(" & ")}${l.label ? ` · ${l.label}` : ""}`;
          if (i) l.toId = `${l.toId}#${i}`;
        });
      else group[0].who = undefined; // everyone's leg: no name
    }
    legs.push(...merged);
  };
  for (const s of sections) walk(s, false);
  // The plans not shown (the day's plan while a draft is up, other drafts)
  for (const s of sections)
    for (const v of s.versions ?? []) {
      const ver = v.id ? draftSection(v.id) : s.key;
      if (ver !== s.writeKey) walk({ ...s, writeKey: ver, items: v.id ? (draftItems.get(ver) ?? []) : bySection.get(s.key)! }, true);
    }
  // Lodging and restaurant bookings with a location get their own pins
  if (!focus)
    for (const r of state.reservations)
      if (r.lat != null && r.lng != null && r.type !== "flight" && !pins.some((p) => p.id === `res:${r.id}` || (p.id.startsWith("res:") && p.name === r.title)))
        // One pin per booking (several travellers' copies share it), with its type's symbol
        pins.push({ id: `res:${r.id}`, lat: r.lat, lng: r.lng, color: "#e8ece9", label: "", glyph: RES_GLYPH[r.type], name: r.title });
  return { sections, pins, legs, landings, bookends };
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
