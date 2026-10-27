import type { Item } from "./trips";
import type { LegState } from "./routing";

/** Minutes a stop takes when no "how long" is set yet. */
export const DEFAULT_STAY = 60;
export const DEFAULT_DAY_START = "09:00";

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const up5 = (min: number) => Math.ceil(min / 5 - 1e-9) * 5;

/**
 * Times worked out instead of typed (Settings → Stop times: Auto): the day starts at `start`
 * (or when the flight lands, if later), each stop's incoming route is added, arrival is rounded
 * up to the next 5 minutes, and the stop lasts its `stay`. Routes still loading count as 0 until
 * they arrive. Notes and checklists take no time.
 */
export function autoTimes(items: Item[], legs: Map<string, { state?: LegState }> | undefined, start: string, landed?: string) {
  const out = new Map<string, { start: string; end: string; nextDay: boolean }>();
  let cur = toMin(start);
  if (landed && /^\d{1,2}:\d{2}/.test(landed)) cur = Math.max(cur, toMin(landed));
  for (const it of items) {
    if (it.kind !== "place") continue;
    const leg = legs?.get(it.id)?.state;
    if (typeof leg === "object" && leg.mode !== "flight" && leg.duration) cur += leg.duration / 60;
    const arrive = up5(cur);
    const end = arrive + (it.stay ?? DEFAULT_STAY);
    out.set(it.id, { start: toHHMM(arrive), end: toHHMM(end), nextDay: end >= 1440 });
    cur = end;
  }
  return out;
}

export const STAY_OPTIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];

export function fmtStay(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

/** "1h30", "1.5h", "90", "90m", "2 h 15 min" → minutes (5-minute steps). */
export function parseStay(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  let min: number | null = null;
  const hm = t.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/);
  const hcolon = t.match(/^(\d+):(\d{2})$/);
  const m = t.match(/^(\d+)\s*(?:m|min|mins|minutes?)?$/);
  if (hm) min = parseFloat(hm[1]) * 60 + (hm[2] ? +hm[2] : 0);
  else if (hcolon) min = +hcolon[1] * 60 + +hcolon[2];
  else if (m) min = +m[1];
  if (min == null || !Number.isFinite(min) || min <= 0) return null;
  return Math.min(24 * 60, up5(min));
}
