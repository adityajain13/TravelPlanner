/*
 * Geocoding for the connector, mirroring src/lib/geocode.ts:
 *  - Photon first; OpenStreetMap Nominatim when Photon errors (e.g. its 521 outages) or finds nothing
 *  - candidates ranked by relevance, closeness to the previous stop, and countries the trip already
 *    visits; only an unknown-country match >3,000 km from the previous stop is rejected
 *  - a per-request lookup budget, because a Worker invocation can only make a limited number of
 *    outbound requests. Whatever doesn't fit is reported back so `pin_missing` can finish it.
 */

const UA = { "User-Agent": "travelplanner/1.0 (https://adityajain.ca/travelplanner)" };

export interface Hit {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  category?: string;
  osmId?: string;
  countryCode?: string;
}

export class Budget {
  constructor(public left: number) {}
  take() {
    if (this.left <= 0) return false;
    this.left--;
    return true;
  }
}

export const OUT_OF_BUDGET = Symbol("budget");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastNominatim = 0;

export function distanceKm(a: number[], b: number[]) {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function photon(q: string, near: number[] | undefined, limit: number): Promise<Hit[]> {
  const params = new URLSearchParams({ q, limit: String(limit), lang: "en" });
  if (near?.length === 2) params.set("lon", String(near[0])), params.set("lat", String(near[1])), params.set("location_bias_scale", "0.3");
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: UA });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = (await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | number | undefined> }[] };
  return data.features.map((f) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    return {
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      name: String(p.name ?? street ?? q),
      address: [street, p.district ?? p.locality, p.city, p.country].filter(Boolean).join(", ") || undefined,
      category: p.osm_value ? String(p.osm_value).replace(/_/g, " ") : undefined,
      osmId: p.osm_id ? `${String(p.osm_type ?? "")}${p.osm_id}` : undefined,
      countryCode: p.countrycode ? String(p.countrycode).toLowerCase() : undefined,
    };
  });
}

async function nominatim(q: string, countryCode: string | undefined, near: number[] | undefined, limit: number): Promise<Hit[]> {
  const since = Date.now() - lastNominatim;
  if (since < 1100) await wait(1100 - since); // Nominatim usage policy: max ~1 request/second
  lastNominatim = Date.now();
  const params = new URLSearchParams({ q, format: "jsonv2", limit: String(limit), addressdetails: "1", "accept-language": "en" });
  if (countryCode) params.set("countrycodes", countryCode);
  if (near?.length === 2) params.set("viewbox", `${near[0] - 2},${near[1] + 1.5},${near[0] + 2},${near[1] - 1.5}`);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: UA });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = (await res.json()) as { lat: string; lon: string; name?: string; display_name: string; type?: string; osm_type?: string; osm_id?: number; address?: { country_code?: string } }[];
  return rows.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    name: r.name || r.display_name.split(",")[0],
    address: r.display_name,
    category: r.type?.replace(/_/g, " "),
    osmId: r.osm_type && r.osm_id ? `${r.osm_type[0].toUpperCase()}${r.osm_id}` : undefined,
    countryCode: r.address?.country_code?.toLowerCase(),
  }));
}

export interface Opts {
  countries?: string[];
  countryCode?: string; // search ordering only
  near?: number[];
  budget: Budget;
}

function pickBest(cands: Hit[], o: Opts): Hit | null {
  const countries = new Set((o.countries ?? []).map((c) => c.toLowerCase()));
  let best: Hit | null = null;
  let bestScore = -Infinity;
  cands.forEach((h, i) => {
    const d = o.near ? distanceKm(o.near, [h.lng, h.lat]) : 0;
    const known = !countries.size || (h.countryCode ? countries.has(h.countryCode) : true);
    if (!known && d > 3000) return;
    const score = -i * 0.35 + (countries.size && known ? 1.5 : 0) - Math.log10(1 + d / 10);
    if (score > bestScore) (best = h), (bestScore = score);
  });
  return best;
}

/** One best match, null when nothing plausible, OUT_OF_BUDGET when this request can't look up more. */
export async function geocode(q: string, o: Opts): Promise<Hit | null | typeof OUT_OF_BUDGET> {
  if (!o.budget.take()) return OUT_OF_BUDGET;
  try {
    const hit = pickBest(await photon(q, o.near, 8), o);
    if (hit) return hit;
  } catch {
    /* Photon down: fall through */
  }
  if (!o.budget.take()) return OUT_OF_BUDGET;
  try {
    return pickBest(await nominatim(q, undefined, o.near, 6), o);
  } catch {
    return null;
  }
}

/** Result list for search_places: Photon, else Nominatim; trip-country results first. */
export async function search(q: string, o: Opts): Promise<Hit[]> {
  let hits: Hit[] = [];
  if (o.budget.take())
    try {
      hits = await photon(q, o.near, 8);
    } catch {
      /* fall back */
    }
  if (!hits.length && o.budget.take()) hits = await nominatim(q, undefined, o.near, 8).catch(() => []);
  if (o.countryCode) {
    const cc = o.countryCode.toLowerCase();
    hits.sort((a, b) => Number(b.countryCode === cc) - Number(a.countryCode === cc));
  }
  return hits;
}

/** Country (lowercase ISO) at a point, via Nominatim reverse geocoding. */
export async function countryAt(lng: number, lat: number, budget: Budget): Promise<string | undefined> {
  if (!budget.take()) return undefined;
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "jsonv2", zoom: "3" });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { headers: UA });
    if (!res.ok) return undefined;
    return ((await res.json()) as { address?: { country_code?: string } }).address?.country_code?.toLowerCase();
  } catch {
    return undefined;
  }
}

export const GENERIC_PLACE = /^(parking( lot| area)?|car park|rest stop|rest area|toilets?|restrooms?|wc|gas station|petrol station|lookout|viewpoint|sea view ?point|scenic view|photo stop|hotel|airport|supermarket|grocery store)$/i;
