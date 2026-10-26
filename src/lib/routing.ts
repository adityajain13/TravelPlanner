import { GOOGLE_KEY } from "./google";
import { shareQuery } from "./shareToken";
import { useEffect, useState } from "react";
import { db } from "./db";
import { distanceKm } from "./geocode";

/*
 * Leg routing between consecutive stops, Wanderlog-style.
 *  drive / walk / bike → FOSSGIS OSRM (routing.openstreetmap.de; OSM roads & paths; ≤1 req/s)
 *  transit             → Transitous (api.transitous.org, MOTIS 2; free, open, non-commercial)
 * Results are cached in IndexedDB, so routes keep drawing offline. Legs longer than FLIGHT_KM
 * aren't routed: they're drawn as a straight "flight" line.
 */

export type TravelMode = "drive" | "walk" | "bike" | "transit";
export const MODES: TravelMode[] = ["drive", "transit", "walk", "bike"];
export const FLIGHT_KM = 800;

export interface TransitStep {
  mode: string; // WALK, BUS, SUBWAY, RAIL, …
  name?: string; // route short name / line
  minutes: number;
}

export interface LegResult {
  mode: TravelMode | "flight";
  coords: [number, number][];
  distance: number; // metres
  duration: number | null; // seconds (null for flights)
  steps?: TransitStep[];
  transfers?: number;
  /** Transit timed on a nearby same weekday / leaving now (the trip date isn't in the timetables). */
  estimated?: boolean;
  /** Not written to the offline route cache. */
  live?: boolean;
  /** No timetable anywhere: a distance-based guess. */
  rough?: boolean;
}

export interface LegRequest {
  key: string;
  mode: TravelMode;
  from: [number, number]; // [lng, lat]
  to: [number, number];
  when?: string; // RFC3339 departure, transit only
}

const r5 = (n: number) => n.toFixed(5);
export const legKey = (mode: TravelMode, a: [number, number], b: [number, number], when?: string) =>
  `${mode}:${r5(a[0])},${r5(a[1])}>${r5(b[0])},${r5(b[1])}${mode === "transit" && when ? `@${when.slice(0, 13)}` : ""}`;

const TTL = { transit: 3 * 864e5, other: 60 * 864e5 };

/** Serialises requests per provider with a minimum gap (usage policies ask for ≤1 req/s). */
class Throttle {
  private chain: Promise<unknown> = Promise.resolve();
  private last = 0;
  constructor(private gap: number) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const wait = this.last + this.gap - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      return fn();
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
}
const osrmQ = new Throttle(1100);
const transitQ = new Throttle(1100);

async function osrm(mode: Exclude<TravelMode, "transit">, a: [number, number], b: [number, number]): Promise<LegResult | null> {
  const profile = { drive: "car", walk: "foot", bike: "bike" }[mode];
  const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const j = (await res.json()) as { code: string; routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] };
  const r = j.code === "Ok" ? j.routes?.[0] : undefined;
  return r ? { mode, coords: r.geometry.coordinates, distance: r.distance, duration: r.duration } : null;
}

/** Google-style encoded polyline with configurable precision → [lng, lat][] */
function decodePolyline(str: string, precision = 6): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let lat = 0;
  let lng = 0;
  let i = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = str.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

interface MotisLeg {
  mode: string;
  duration: number;
  distance?: number;
  routeShortName?: string;
  displayName?: string;
  legGeometry?: { points: string; precision?: number };
}

async function transitous(a: [number, number], b: [number, number], when?: string): Promise<LegResult | null> {
  const params = new URLSearchParams({ fromPlace: `${a[1]},${a[0]}`, toPlace: `${b[1]},${b[0]}` });
  if (when) params.set("time", when);
  const res = await fetch(`https://api.transitous.org/api/v6/plan?${params}`);
  if (!res.ok) throw new Error(`Transitous ${res.status}`);
  const j = (await res.json()) as { itineraries?: { duration: number; transfers: number; legs: MotisLeg[] }[]; direct?: { duration: number; legs: MotisLeg[] }[] };
  const it = [...(j.itineraries ?? [])].sort((x, y) => x.duration - y.duration)[0] ?? j.direct?.[0];
  if (!it) return null;
  const coords = it.legs.flatMap((l) => (l.legGeometry ? decodePolyline(l.legGeometry.points, l.legGeometry.precision ?? 6) : []));
  return {
    mode: "transit",
    coords: coords.length > 1 ? coords : [a, b],
    distance: it.legs.reduce((s, l) => s + (l.distance ?? 0), 0) || distanceKm(a, b) * 1000,
    duration: it.duration,
    steps: it.legs.map((l) => ({ mode: l.mode, name: l.routeShortName || l.displayName, minutes: Math.round(l.duration / 60) })),
    transfers: "transfers" in it ? it.transfers : 0,
  };
}

/**
 * Timetables only cover a few weeks ahead (and nothing in the past), so a trip months away or
 * an imported old trip finds no service on its real date. Then ask for the same weekday and time
 * in the coming week instead: schedules repeat weekly, so the duration is a good estimate.
 */
export function nearbyWeekday(when: string, now = new Date()): string | null {
  const m = when.match(/^(\d{4}-\d{2}-\d{2})T(.*)$/);
  if (!m) return null;
  const day = new Date(`${m[1]}T12:00:00Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  const ahead = (day.getTime() - today.getTime()) / 86400000;
  if (ahead >= 1 && ahead <= 21) return null; // inside the timetable window: the real date is fine
  const shift = ((day.getUTCDay() - today.getUTCDay() + 7) % 7) || 7;
  const d = new Date(today.getTime() + shift * 86400000);
  return `${d.toISOString().slice(0, 10)}T${m[2]}`;
}

const rides = (r: LegResult | null) => !!r?.steps?.some((st) => st.mode !== "WALK");

/**
 * Transit, trying in turn: the real date/time, the same weekday next week, leaving now
 * (all Transitous), with Google's transit directions tried right after the real date fails (cached like the rest). Like Wanderlog, the
 * point is "how long will this take", so any of these is a fine answer.
 */
async function transitWithFallback(a: [number, number], b: [number, number], when?: string): Promise<LegResult | null> {
  const first = await transitous(a, b, when).catch(() => null);
  if (rides(first)) return first;
  // Google next when there's a key: real timetables almost everywhere (e.g. Japan)
  const google = await googleTransit(a, b).catch((e) => ((transitIssue = String((e as Error).message)), null));
  if (google) return (transitIssue = null), google;
  const alt = when ? nearbyWeekday(when) : null;
  if (alt) {
    const second = await transitous(a, b, alt).catch(() => null);
    if (rides(second)) return { ...second!, estimated: true };
  }
  const now = await transitous(a, b).catch(() => null);
  if (rides(now)) return { ...now!, estimated: true };
  if (first ?? now) return first ?? now; // walking-only answer, if that's all there is
  return roughTransit(a, b);
}

/** Why Google transit couldn't help, shown on the leg (e.g. the Routes API isn't enabled). */
export let transitIssue: string | null = null;

/** Last resort so a leg still says roughly how long: road distance ≈ 1.3× straight line, ~22 km/h door to door, + 8 min. */
function roughTransit(a: [number, number], b: [number, number]): LegResult {
  const km = distanceKm(a, b) * 1.3;
  return { mode: "transit", coords: [a, b], distance: km * 1000, duration: Math.round((km / 22) * 3600 + 8 * 60), estimated: true, rough: true, live: true };
}

/** Google Routes API (transit). Needs the Routes API enabled on the browser key. */
async function googleTransit(a: [number, number], b: [number, number]): Promise<LegResult | null> {
  if (!GOOGLE_KEY) throw new Error("no Google key in this build (VITE_GOOGLE_PLACES_KEY)");
  const res = await fetch(`/travelplanner/api/routes/transit?${new URLSearchParams(shareQuery())}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: a, to: b, key: GOOGLE_KEY }),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } | string }).error;
    const why = typeof detail === "string" ? detail : detail?.message;
    throw new Error(res.status === 403 ? `Google refused: ${why ?? "check the key allows Routes API"}` : `Google transit ${res.status}${why ? `: ${why}` : ""}`);
  }
  type Step = { travelMode?: string; staticDuration?: string; transitDetails?: { transitLine?: { nameShort?: string; name?: string; vehicle?: { type?: string } } } };
  const j = (await res.json()) as { routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string }; legs?: { steps?: Step[] }[] }[] };
  const r = j.routes?.[0];
  if (!r?.duration) return null;
  const secs = (d?: string) => Number(d?.replace("s", "") ?? 0);
  // Merge consecutive walking steps, like the Transitous summary
  const steps: TransitStep[] = [];
  for (const st of r.legs?.flatMap((l) => l.steps ?? []) ?? []) {
    const walk = st.travelMode !== "TRANSIT";
    const min = Math.round(secs(st.staticDuration) / 60);
    const prev = steps.at(-1);
    if (walk && prev?.mode === "WALK") prev.minutes += min;
    else steps.push({ mode: walk ? "WALK" : (st.transitDetails?.transitLine?.vehicle?.type ?? "TRANSIT"), name: st.transitDetails?.transitLine?.nameShort ?? st.transitDetails?.transitLine?.name, minutes: min });
  }
  const coords = r.polyline?.encodedPolyline ? decodePolyline(r.polyline.encodedPolyline, 5) : [a, b];
  return {
    mode: "transit",
    coords: coords.length > 1 ? coords : [a, b],
    distance: r.distanceMeters ?? distanceKm(a, b) * 1000,
    duration: secs(r.duration),
    steps,
    transfers: Math.max(0, steps.filter((x) => x.mode !== "WALK").length - 1),
    estimated: true,
  };
}

async function fetchLeg(req: LegRequest): Promise<LegResult | null> {
  const km = distanceKm(req.from, req.to);
  if (km > FLIGHT_KM) return { mode: "flight", coords: [req.from, req.to], distance: km * 1000, duration: null };
  if (req.mode === "transit") return transitQ.run(() => transitWithFallback(req.from, req.to, req.when));
  return osrmQ.run(() => osrm(req.mode as Exclude<TravelMode, "transit">, req.from, req.to));
}

export type LegState = LegResult | "loading" | "failed";

/** Resolves every leg: cache first, then the network (sequentially, politely). */
export function useLegs(requests: LegRequest[]): Map<string, LegState> {
  const [results, setResults] = useState<Map<string, LegState>>(new Map());
  const keys = requests.map((r) => r.key).join("|");

  useEffect(() => {
    let alive = true;
    const set = (key: string, v: LegState) => alive && setResults((m) => new Map(m).set(key, v));
    (async () => {
      const cached = await db.routes.bulkGet(requests.map((r) => r.key));
      const todo: LegRequest[] = [];
      requests.forEach((r, i) => {
        const c = cached[i];
        const fresh = c && Date.now() - c.fetchedAt < (r.mode === "transit" ? TTL.transit : TTL.other);
        if (c && (fresh || !navigator.onLine)) set(r.key, c.result);
        else todo.push(r);
      });
      for (const r of todo) {
        if (!alive) return;
        // Long hops resolve instantly; everything else needs the network
        if (!navigator.onLine && distanceKm(r.from, r.to) <= FLIGHT_KM) {
          set(r.key, "failed");
          continue;
        }
        set(r.key, "loading");
        try {
          const res = await fetchLeg(r);
          if (res && !res.live) await db.routes.put({ key: r.key, result: res, fetchedAt: Date.now() });
          set(r.key, res ?? "failed");
        } catch {
          set(r.key, "failed");
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  return results;
}

/** Departure time for transit: the previous stop's end/start time on that day, else 09:00, with a
 *  rough UTC offset from longitude (good enough for picking the right timetable window). */
export function departureTime(date: string, time: string | undefined, lng: number) {
  const off = Math.max(-12, Math.min(14, Math.round(lng / 15)));
  const sign = off < 0 ? "-" : "+";
  return `${date}T${time ?? "09:00"}:00${sign}${String(Math.abs(off)).padStart(2, "0")}:00`;
}

export function formatDuration(s: number) {
  const m = Math.round(s / 60);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  return `${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
