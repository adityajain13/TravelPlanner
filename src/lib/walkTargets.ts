import type { Item, Reservation, TripState } from "./trips";

/*
 * Which "how far can I walk" areas show on the trip map. Nothing shows until a stop or booking is
 * switched on with its eye button. With a day focused on the map, only that day's stops and the
 * hotels whose stay covers that day.
 */

export interface WalkSection {
  key: string;
  date?: string;
  color: string;
  items: Item[];
}

export interface WalkTarget {
  id: string;
  center: [number, number]; // [lng, lat]
  color: string;
}

export interface WalkPlan {
  /** Areas to draw now (after the day filter). */
  targets: WalkTarget[];
  /** Ids switched on: stops, and every copy of a booking. Drives the eye buttons. */
  on: Set<string>;
  /** Every copy's id for a booking, so one toggle sets them all together. */
  copies: Map<string, string[]>;
}

/** The booking pin colour; bookings and hotels are drawn in it. */
export const BOOKING_COLOR = "#e8ece9";

/** Bookings that can have an area: a hotel, restaurant or other booking with a pin. */
export const walkable = (r: Reservation) => (r.type === "lodging" || r.type === "restaurant" || r.type === "other") && r.lat != null && r.lng != null;

/** Shared bookings have one copy per traveller; they share this key and one toggle. */
const groupKey = (r: Reservation) => `${r.type}|${r.title}|${r.startDate ?? ""}|${r.startTime ?? ""}`;

export function walkPlan(state: TripState | null, sections: WalkSection[], focus: string | null, toggles: Record<string, boolean>): WalkPlan {
  const plan: WalkPlan = { targets: [], on: new Set(), copies: new Map() };
  if (!state) return plan;
  const date = focus ? sections.find((s) => s.key === focus)?.date : undefined;

  // Stops switched on; with a day focused, only that day's (or list's) stops are drawn
  for (const s of sections) {
    for (const it of s.items) {
      if (it.kind !== "place" || it.waypoint || it.lat == null || it.lng == null || !toggles[it.id]) continue;
      plan.on.add(it.id);
      if (!focus || s.key === focus) plan.targets.push({ id: it.id, center: [it.lng, it.lat], color: s.color });
    }
  }

  // Bookings: one entry per shared booking (its copies travel together)
  const groups = new Map<string, Reservation[]>();
  for (const r of state.reservations) if (walkable(r)) groups.set(groupKey(r), [...(groups.get(groupKey(r)) ?? []), r]);
  for (const list of groups.values()) {
    const ids = list.map((r) => `res:${r.id}`);
    for (const id of ids) plan.copies.set(id, ids);
    if (!list.some((r) => toggles[`res:${r.id}`])) continue;
    ids.forEach((id) => plan.on.add(id));
    const rep = list[0];
    // A hotel's stay covers the nights from check-in up to (not including) check-out
    const here = !focus || (!!date && (rep.type === "lodging" ? !!rep.startDate && rep.startDate <= date && date <= (rep.endDate ?? rep.startDate) : rep.startDate === date));
    if (here) plan.targets.push({ id: ids[0], center: [rep.lng!, rep.lat!], color: BOOKING_COLOR });
  }
  return plan;
}
