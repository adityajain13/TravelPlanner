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
 *
 * Stops only some people go to (each person's own home…) run on that person's own clock from
 * the day's start; a stop they go to together starts once the last of them gets there.
 */
export function autoTimes(
  items: Item[],
  legs: Map<string, { state?: LegState; who?: string[] }> | undefined,
  start: string,
  landed?: string,
  people: string[] = [],
) {
  const out = new Map<string, { start: string; end: string; nextDay: boolean }>();
  let day = toMin(start);
  if (landed && /^\d{1,2}:\d{2}/.test(landed)) day = Math.max(day, toMin(landed));
  const split = people.length > 1 && items.some((i) => i.kind === "place" && i.who?.length);
  const lanes = split ? people : ["*"];
  const clock = new Map(lanes.map((p) => [p, day]));
  const legMin = (id: string, person: string) => {
    // The stop's legs: "<id>" and, when people come separately, "<id>#1"…; a leg with no names is everyone's
    for (const [k, l] of legs ?? []) {
      if (k !== id && !k.startsWith(`${id}#`)) continue;
      if (person !== "*" && l.who && !l.who.includes(person)) continue;
      const st = l.state;
      return typeof st === "object" && st.mode !== "flight" && st.duration ? st.duration / 60 : 0;
    }
    return 0;
  };
  for (const it of items) {
    if (it.kind !== "place") continue;
    const own = split && it.who?.length ? it.who.filter((p) => clock.has(p)) : [];
    const going = own.length ? own : lanes;
    const arrive = up5(Math.max(...going.map((p) => clock.get(p)! + legMin(it.id, p))));
    const end = arrive + (it.stay ?? DEFAULT_STAY);
    out.set(it.id, { start: toHHMM(arrive), end: toHHMM(end), nextDay: end >= 1440 });
    for (const p of going) clock.set(p, end);
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
