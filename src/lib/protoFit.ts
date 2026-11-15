// PROTOTYPE (proto/trip-focus): does an idea fit a day? Plain rules over stored facts, run in the
// browser on every change (no lookups, no tokens). Returns a score plus reasons for and against.
import { distanceKm } from "./geocode";
import type { Item } from "./trips";

/** What we know about a place. In the real thing: Google details + one stored AI lookup per place. */
export interface PlaceFacts {
  /** Weekdays it's closed, 0 = Sunday */
  closed?: number[];
  /** Needs tickets or a reservation ahead */
  book?: boolean;
  /** Best time of day */
  best?: "morning" | "sunset" | "evening";
  /** Typical visit, minutes */
  stay?: number;
}

/**
 * Demo facts for the seeded test places (no Google or Anthropic keys locally). Matched by name.
 * Real places' facts are roughly right but not checked.
 */
const DEMO: Record<string, PlaceFacts> = {
  "teamlab planets": { book: true, stay: 120 },
  "nara park": { stay: 180, best: "morning" },
  "hiroshima peace memorial": { stay: 150 },
  "ichiran shibuya": { stay: 45 },
  "afuri ebisu": { stay: 45 },
  "philosopher's path": { stay: 60, best: "morning" },
  "tsukiji outer market": { closed: [0, 3], best: "morning", stay: 90 },
  "ghibli museum": { closed: [2], book: true, stay: 150 },
  "shibuya sky": { book: true, best: "sunset", stay: 75 },
  "nijo castle": { closed: [2], stay: 90 },
  "arashiyama monkey park": { stay: 75 },
  "tokyo skytree": { best: "sunset", stay: 90 },
  "nishiki market": { closed: [3], stay: 60 },
};

export const factsOf = (it: Item): PlaceFacts => ({ stay: it.stay, ...DEMO[it.name.trim().toLowerCase()] });

const WEEKDAY = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const DEFAULT_STAY = 90;
const FULL_DAY = 9 * 60;

export type Note = { text: string; weight: number };
export interface Fit {
  score: number;
  /** Strongest first */
  reasons: Note[];
  blockers: Note[];
  /** Rules out the day outright (closed) */
  out: boolean;
}

const at = (it: Item): [number, number] | null => (it.lat != null && it.lng != null ? [it.lng, it.lat] : null);
const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000 / 50) * 50} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);
/** How far, in the terms that matter for deciding: a walk under ~1.5 km, else the distance */
const howFar = (km: number) => (km <= 1.5 ? `${Math.max(1, Math.round(km * 13))} min walk` : `${fmtKm(km)}`);
/** Stations and airports are places you pass through, not plans: a weak thing to be "near" */
const TRANSIT = /station|airport|terminal|駅|空港/i;

export function fitFor(idea: Item, day: { date: string; items: Item[] }): Fit {
  const f = factsOf(idea);
  const reasons: Note[] = [];
  const blockers: Note[] = [];
  let score = 0;
  let out = false;

  // Closed that weekday
  const wd = new Date(`${day.date}T12:00:00Z`).getUTCDay();
  if (f.closed?.includes(wd)) {
    blockers.push({ text: `Closed ${WEEKDAY[wd]}`, weight: 100 });
    score -= 100;
    out = true;
  }

  // Near the day's stops
  const stops = day.items.filter((i) => i.kind === "place" && !i.waypoint && at(i));
  const anchors = stops.some((s) => !TRANSIT.test(s.name)) ? stops.filter((s) => !TRANSIT.test(s.name)) : stops;
  const here = at(idea);
  if (here && stops.length) {
    let best = { km: Infinity, name: "" };
    for (const s of anchors) {
      const km = distanceKm(here, at(s)!);
      if (km < best.km) best = { km, name: s.name };
    }
    if (best.km <= 3) {
      reasons.push({ text: `${howFar(best.km)} from ${best.name}`, weight: 30 });
      score += 40 - best.km * 5;
    } else if (best.km <= 15) {
      reasons.push({ text: `${howFar(best.km)} from ${best.name}`, weight: 10 });
      score += 15 - best.km;
    } else if (best.km > 40) {
      blockers.push({ text: `${fmtKm(best.km)} from this day's stops`, weight: 40 });
      score -= 30 + Math.min(best.km, 400) / 10;
    } else score -= best.km / 2;
  } else if (!stops.length) {
    reasons.push({ text: "Nothing planned yet: room for it", weight: 5 });
  }

  // How full the day is
  const load = stops.reduce((n, s) => n + (factsOf(s).stay ?? DEFAULT_STAY), 0);
  const add = f.stay ?? DEFAULT_STAY;
  if (stops.length && load + add > FULL_DAY) {
    blockers.push({ text: `Day gets long (~${Math.round((load + add) / 60)} h of stops)`, weight: 30 });
    score -= 15;
  } else if (stops.length && load < 4 * 60) {
    reasons.push({ text: "Light day, has room", weight: 8 });
    score += 5;
  }

  if (f.best === "sunset") reasons.push({ text: "Best at sunset", weight: 4 });
  if (f.best === "morning") reasons.push({ text: "Best early", weight: 4 });
  // A to-do rather than a reason against the day: shown, but barely moves the score
  if (f.book) blockers.push({ text: "Book ahead", weight: 20 });

  reasons.sort((a, b) => b.weight - a.weight);
  blockers.sort((a, b) => b.weight - a.weight);
  return { score, reasons, blockers, out };
}

/** The day this idea fits best, with its fit. */
export function bestDay<D extends { key: string; date: string; items: Item[] }>(idea: Item, days: D[]): { day: D; fit: Fit } | null {
  let best: { day: D; fit: Fit } | null = null;
  for (const d of days) {
    const fit = fitFor(idea, d);
    if (!best || fit.score > best.fit.score) best = { day: d, fit };
  }
  return best;
}
