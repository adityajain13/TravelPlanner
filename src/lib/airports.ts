import type { Reservation } from "./trips";

/*
 * Airports for flight bookings: IATA code → [lat, lng, name, city], from OpenFlights
 * (openflights.org, ODbL). ~150 KB gzipped, so it's a separate chunk loaded only for trips with flights.
 */
export type AirportRow = [number, number, string, string];
export type AirportDb = Record<string, AirportRow>;

let cache: Promise<AirportDb> | null = null;
export const loadAirports = () => (cache ??= import("../data/airports.json").then((m) => m.default as unknown as AirportDb));

export interface Airport {
  code: string;
  lat: number;
  lng: number;
  name: string;
  city: string;
}

const codesIn = (s: string | undefined, db: AirportDb) => [...(s ?? "").matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1]).filter((c) => db[c]);

/** Main airport for cities with several, when a booking names only the city. */
const PRIMARY: Record<string, string> = {
  toronto: "YYZ", montreal: "YUL", vancouver: "YVR", london: "LHR", paris: "CDG", "new york": "JFK", chicago: "ORD",
  washington: "IAD", tokyo: "HND", osaka: "KIX", sapporo: "CTS", seoul: "ICN", shanghai: "PVG", beijing: "PEK",
  bangkok: "BKK", istanbul: "IST", milan: "MXP", rome: "FCO", stockholm: "ARN", berlin: "BER", moscow: "SVO",
  "sao paulo": "GRU", "buenos aires": "EZE", taipei: "TPE", dubai: "DXB", houston: "IAH", dallas: "DFW",
};
let byCity: Map<string, string[]> | null = null;
/** A city name ("Calgary", "Toronto, ON") → its airport, if there's one obvious one. */
function cityCode(s: string | undefined, db: AirportDb) {
  const city = (s ?? "").split(/[,(]/)[0].trim().toLowerCase();
  if (!city) return undefined;
  if (PRIMARY[city]) return PRIMARY[city];
  if (!byCity) {
    byCity = new Map();
    for (const [code, row] of Object.entries(db)) {
      const k = row[3]?.toLowerCase();
      if (k) byCity.set(k, [...(byCity.get(k) ?? []), code]);
    }
  }
  const hits = byCity.get(city);
  return hits?.length === 1 ? hits[0] : undefined;
}

/** Departure and arrival airports of a flight booking, from its from/to fields or its title ("Tokyo NRT → Osaka KIX"). */
export function flightAirports(r: Reservation, db: AirportDb): [Airport, Airport] | null {
  if (r.type !== "flight") return null;
  let from: string | undefined = codesIn(r.from, db)[0];
  let to: string | undefined = codesIn(r.to, db)[0];
  if (!from || !to) {
    // Title: codes on either side of the arrow
    const [a, b] = r.title.split(/→|->|–| to /);
    from ??= codesIn(a, db).at(-1);
    to ??= codesIn(b, db)[0];
    // Only city names: "WS 629 Toronto → Calgary"
    from ??= cityCode(r.from, db) ?? cityCode(a?.replace(/^\s*[A-Z0-9]{2}\s?\d{1,4}\s+/, ""), db);
    to ??= cityCode(r.to, db) ?? cityCode(b, db);
  }
  if (!from || !to || from === to) return null;
  const mk = (code: string): Airport => {
    const [lat, lng, name, city] = db[code];
    return { code, lat, lng, name, city };
  };
  return [mk(from), mk(to)];
}

/**
 * A flight drawn the way airline maps do: a gentle arc bowed to one side of the straight line
 * (in lng/lat, wrapped across the antimeridian so Pacific flights don't cross the whole map).
 */
export function flightArc(a: { lat: number; lng: number }, b: { lat: number; lng: number }, steps = 48): [number, number][] {
  let bl = b.lng;
  if (bl - a.lng > 180) bl -= 360;
  else if (a.lng - bl > 180) bl += 360;
  const dx = bl - a.lng;
  const dy = b.lat - a.lat;
  const len = Math.hypot(dx, dy);
  // Control point: midpoint pushed out perpendicular, toward the pole (like a great circle looks)
  const bow = len * 0.22;
  let nx = -dy / (len || 1);
  let ny = dx / (len || 1);
  if ((a.lat + b.lat) / 2 >= 0 ? ny < 0 : ny > 0) (nx = -nx), (ny = -ny);
  const cx = (a.lng + bl) / 2 + nx * bow;
  const cy = (a.lat + b.lat) / 2 + ny * bow;
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * a.lng + 2 * u * t * cx + t * t * bl, u * u * a.lat + 2 * u * t * cy + t * t * b.lat]);
  }
  return out;
}
