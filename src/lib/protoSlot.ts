// PROTOTYPE (proto/trip-focus): where an idea would slot into a day's route, in straight-line km.
// Pure and cheap: runs in the browser for every card on every change (no routing calls).
export type LatLng = [number, number];
export type Stop = { id: string; name: string; at: LatLng; /** "HH:MM", when set on the day */ start?: string; /** minutes there */ mins?: number };
export type Slot = { kind: "start" | "between" | "end"; i: number; detour: number; near: number };

const toRad = (d: number) => (d * Math.PI) / 180;
export function kmBetween(a: LatLng, b: LatLng) {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
export const kmText = (k: number) => (k < 1 ? "under 1 km" : `${Math.round(k)} km`);

/** The cheapest place to add a point to a route: before the first stop, between two, or after the last */
export function bestSlot(at: LatLng, stops: Stop[]): Slot {
  const n = stops.length;
  let best: Slot = { kind: "start", i: 0, detour: kmBetween(at, stops[0].at), near: 0 };
  const end = kmBetween(stops[n - 1].at, at);
  if (end < best.detour) best = { kind: "end", i: n - 1, detour: end, near: n - 1 };
  for (let i = 0; i < n - 1; i++) {
    const d = kmBetween(stops[i].at, at) + kmBetween(at, stops[i + 1].at) - kmBetween(stops[i].at, stops[i + 1].at);
    if (d < best.detour) best = { kind: "between", i, detour: d, near: kmBetween(stops[i].at, at) < kmBetween(stops[i + 1].at, at) ? i : i + 1 };
  }
  return best;
}

/** One line for a slot: "Fits between 1 X and 2 Y · +2 km detour" / "Start Mon 14 here…" / "End Mon 14 here…" */
export function slotText(day: string, s: Slot, stops: Stop[]): string {
  if (s.kind === "between") return `Fits between ${s.i + 1} ${stops[s.i].name} and ${s.i + 2} ${stops[s.i + 1].name} · ${s.detour < 1 ? "barely a detour" : `+${kmText(s.detour)} detour`}`;
  if (s.kind === "start") return `Start ${day} here · ${kmText(s.detour)} before ${stops[0].name}`;
  return `End ${day} here · ${kmText(s.detour)} after ${stops[stops.length - 1].name}`;
}

/** A day whose consecutive stops are more than 100 km apart is a travel day (a shinkansen or a long drive) */
export const isTravelDay = (stops: Stop[]) => stops.some((x, i) => i > 0 && kmBetween(stops[i - 1].at, x.at) > 100);
