import { db } from "./db";

/*
 * "How far can I walk from here": a shaded ring around a point. Real streets from FOSSGIS
 * Valhalla (OSM) when they can be had; otherwise a circle at a straight-line walking pace.
 * Isochrones are cached on the device for 180 days and kept in memory for the session.
 */

export type Ring = [number, number][]; // [lng, lat], closed

/** 5 km/h is ~83 m a minute; 65 leaves room for streets being longer than a straight line. */
const METRES_PER_MIN = 65;
const URL_BASE = "https://valhalla1.openstreetmap.de/isochrone?json=";
const TTL_MS = 180 * 864e5;
const TIMEOUT_MS = 8000;

/** Straight-line fallback: a circle of walking distance around the centre. */
export function walkCircle(center: [number, number], minutes: number, steps = 64): Ring {
  const [lng, lat] = center;
  const r = METRES_PER_MIN * minutes;
  const ring: Ring = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + (r * Math.cos(a)) / (111320 * Math.cos((lat * Math.PI) / 180)), lat + (r * Math.sin(a)) / 110540]);
  }
  ring.push([...ring[0]] as [number, number]); // closed: last point repeats the first
  return ring;
}

/** Serialises requests with a minimum gap (the Valhalla usage policy asks for about 1 req/s). */
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
const queue = new Throttle(1100);
// Promises by key, so one area is asked for once per session (failed ones are dropped to retry)
const memo = new Map<string, Promise<Ring | null>>();

const keyOf = (center: [number, number], minutes: number) => `walk:${minutes}:${center[0].toFixed(4)},${center[1].toFixed(4)}`;

/** The real walking area, or null if it can't be had (offline with no cache, or an error). */
export async function walkIsochrone(center: [number, number], minutes: number): Promise<Ring | null> {
  const key = keyOf(center, minutes);
  let p = memo.get(key);
  if (!p) {
    p = load(center, minutes, key);
    memo.set(key, p);
    p.then((ring) => ring || memo.delete(key));
  }
  return p;
}

async function load(center: [number, number], minutes: number, key: string): Promise<Ring | null> {
  const cached = await readCache(key);
  if (cached) return cached;
  if (!navigator.onLine) return null;
  const ring = await queue.run(() => fetchRing(center, minutes)).catch(() => null);
  if (ring) await writeCache(key, ring);
  return ring;
}

async function fetchRing(center: [number, number], minutes: number): Promise<Ring | null> {
  const [lng, lat] = center;
  const json = JSON.stringify({ locations: [{ lat, lon: lng }], costing: "pedestrian", contours: [{ time: minutes }], polygons: true, denoise: 0.5, generalize: 30 });
  // Timeout so a slow server doesn't hold the queue (and the area's placeholder circle) forever
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL_BASE + encodeURIComponent(json), { signal: ac.signal });
    if (!res.ok) return null;
    const fc = (await res.json()) as { features?: { geometry?: { type: string; coordinates: unknown } }[] };
    return outerRing(fc.features?.[0]?.geometry);
  } finally {
    clearTimeout(timer);
  }
}

/** A Polygon's outer ring, or a MultiPolygon's largest one (the main area; islands are dropped). */
function outerRing(g?: { type: string; coordinates: unknown }): Ring | null {
  if (!g) return null;
  let ring: Ring | undefined;
  if (g.type === "Polygon") ring = (g.coordinates as Ring[])[0];
  else if (g.type === "MultiPolygon") ring = (g.coordinates as Ring[][]).map((poly) => poly[0]).sort((a, b) => b.length - a.length)[0];
  return ring && ring.length >= 4 ? ring : null;
}

async function readCache(key: string): Promise<Ring | null> {
  try {
    const row = await db.walkAreas.get(key);
    return row && Date.now() - row.fetchedAt < TTL_MS ? row.ring : null;
  } catch {
    return null; // storage unavailable (private window): just ask the server
  }
}

async function writeCache(key: string, ring: Ring): Promise<void> {
  try {
    await db.walkAreas.put({ key, ring, fetchedAt: Date.now() });
  } catch {
    /* storage unavailable: the area still shows this session */
  }
}
