/*
 * Place lookup for the app: Photon first (fast, typo-tolerant), OpenStreetMap Nominatim as the
 * fallback when Photon is down or finds nothing. Candidates are ranked rather than filtered:
 * search relevance, closeness to the previous stop, and whether they're in a country the trip
 * already visits. Multi-country trips and long hops (YYZ → KEF) work; only an absurd match
 * (unknown country AND >3,000 km from the previous stop) is rejected.
 * Nominatim's usage policy allows ~1 request/second, so those calls are throttled.
 */

export interface GeoHit {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  category?: string;
  osmId?: string;
  countryCode?: string; // lowercase ISO-3166 alpha-2
}

export interface GeoOpts {
  /** Countries the trip already involves (lowercase ISO); a preference, not a filter. */
  countries?: string[];
  /** Only used by searchPlaces for ordering. */
  countryCode?: string;
  near?: [number, number]; // [lng, lat]
  limit?: number;
  signal?: AbortSignal;
}

let photonFailures = 0;
let lastNominatim = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function distanceKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
}

// OSM tag values → the words people use ("information" → "tourist information")
const CATEGORY: Record<string, string> = {
  information: "tourist information",
  peak: "mountain",
  volcano: "volcano",
  hot_spring: "hot spring",
  attraction: "attraction",
  viewpoint: "viewpoint",
  national_park: "national park",
  protected_area: "protected area",
  fuel: "gas station",
  supermarket: "supermarket",
  guest_house: "guest house",
  aerodrome: "airport",
  place_of_worship: "church",
  fast_food: "fast food",
  car_rental: "car rental",
  yes: "",
};
export const prettyCategory = (v?: string | number) => {
  if (v == null) return undefined;
  const k = String(v);
  return (k in CATEGORY ? CATEGORY[k] : k.replace(/_/g, " ")) || undefined;
};

function fromPhoton(f: PhotonFeature, q = ""): GeoHit {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  return {
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    name: String(p.name ?? (street || q)),
    address: [street, p.district ?? p.locality, p.city, p.state, p.country].filter(Boolean).join(", ") || undefined,
    category: prettyCategory(p.osm_value),
    osmId: p.osm_id ? `${String(p.osm_type ?? "")}${p.osm_id}` : undefined,
    countryCode: p.countrycode ? String(p.countrycode).toLowerCase() : undefined,
  };
}

/** What's at a spot: named OSM features within radiusKm, nearest first (Photon reverse). */
export async function reversePlaces(at: [number, number], radiusKm = 0.15, signal?: AbortSignal): Promise<GeoHit[]> {
  const params = new URLSearchParams({ lon: String(at[0]), lat: String(at[1]), limit: "8", radius: String(radiusKm), lang: "en" });
  const res = await fetch(`https://photon.komoot.io/reverse?${params}`, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  return json.features.map((f) => fromPhoton(f)).sort((a, b) => distanceKm(at, [a.lng, a.lat]) - distanceKm(at, [b.lng, b.lat]));
}

async function photon(q: string, o: GeoOpts): Promise<GeoHit[]> {
  const params = new URLSearchParams({ q, limit: String(o.limit ?? 8), lang: "en" });
  if (o.near) params.set("lon", String(o.near[0])), params.set("lat", String(o.near[1])), params.set("location_bias_scale", "0.3");
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: o.signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  return json.features.map((f) => fromPhoton(f, q));
}

interface NominatimRow {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  type?: string;
  osm_type?: string;
  osm_id?: number;
  address?: { country_code?: string };
}

async function nominatim(q: string, o: GeoOpts): Promise<GeoHit[]> {
  const since = Date.now() - lastNominatim;
  if (since < 1100) await wait(1100 - since);
  lastNominatim = Date.now();
  const params = new URLSearchParams({ q, format: "jsonv2", limit: String(Math.min(o.limit ?? 5, 10)), addressdetails: "1", "accept-language": "en" });
  if (o.countryCode) params.set("countrycodes", o.countryCode);
  if (o.near) {
    const [x, y] = o.near;
    params.set("viewbox", `${x - 2},${y + 1.5},${x + 2},${y - 1.5}`); // preference, not a hard bound
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: o.signal });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = (await res.json()) as NominatimRow[];
  return rows.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    name: r.name || r.display_name.split(",")[0],
    address: r.display_name,
    category: prettyCategory(r.type),
    osmId: r.osm_type && r.osm_id ? `${r.osm_type[0].toUpperCase()}${r.osm_id}` : undefined,
    countryCode: r.address?.country_code?.toLowerCase(),
  }));
}

/** Pick the most plausible candidate (results arrive in relevance order). */
export function pickBest(cands: GeoHit[], o: GeoOpts): GeoHit | null {
  const countries = new Set((o.countries ?? []).map((c) => c.toLowerCase()));
  let best: GeoHit | null = null;
  let bestScore = -Infinity;
  cands.forEach((h, i) => {
    const d = o.near ? distanceKm(o.near, [h.lng, h.lat]) : 0;
    const known = !countries.size || (h.countryCode ? countries.has(h.countryCode) : true);
    if (!known && d > 3000) return; // e.g. an Iceland stop matching a shop in Vietnam
    const score = -i * 0.35 + (countries.size && known ? 1.5 : 0) - Math.log10(1 + d / 10);
    if (score > bestScore) (best = h), (bestScore = score);
  });
  return best;
}

/** Search results for the "Add a place" box. Photon → Nominatim fallback; trip-country results first. */
export async function searchPlaces(q: string, o: GeoOpts = {}): Promise<GeoHit[]> {
  let hits: GeoHit[] = [];
  if (photonFailures < 3) {
    try {
      hits = await photon(q, o);
      photonFailures = 0;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      photonFailures++;
    }
  }
  if (!hits.length) hits = await nominatim(q, { ...o, countryCode: undefined });
  if (o.countryCode) {
    const cc = o.countryCode.toLowerCase();
    hits.sort((a, b) => Number(b.countryCode === cc) - Number(a.countryCode === cc));
  }
  return hits;
}

/** Best single match for an imported place, or null if nothing plausible. */
export async function geocode(q: string, o: GeoOpts = {}): Promise<GeoHit | null> {
  if (photonFailures < 3) {
    try {
      const hit = pickBest(await photon(q, { ...o, limit: 8 }), o);
      photonFailures = 0;
      if (hit) return hit;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      photonFailures++;
    }
  }
  try {
    return pickBest(await nominatim(q, { ...o, countryCode: undefined, limit: 6 }), o);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return null;
  }
}

/** Generic stop names that would pin somewhere random; better left unpinned. */
export const GENERIC_PLACE = /^(parking( lot| area)?|car park|rest stop|rest area|toilets?|restrooms?|wc|gas station|petrol station|lookout|viewpoint|sea view ?point|scenic view|photo stop|hotel|airport|supermarket|grocery store)$/i;
