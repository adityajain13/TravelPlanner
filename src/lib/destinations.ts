// PROTOTYPE (proto/new-trip): destination search for the new-trip flow.
// Two sources, merged:
//  1. A built-in list of countries (names from Intl) + popular cities, matched instantly and forgivingly:
//     nicknames ("korea" → South Korea, "uk", "holland") and typos ("korae", "thailnd", "nwe york").
//  2. Photon limited to countries, regions and cities, for everything else.

export interface Destination {
  name: string;
  /** Region and country, for the suggestion's second line. */
  context: string;
  /** What kind of place it is: country, state, city, ... */
  kind: string;
  /** Missing on built-in countries until resolved (see resolveDestination). */
  lng?: number;
  lat?: number;
  /** [west, south, east, north] when known. */
  bbox?: [number, number, number, number];
  countryCode?: string;
}

export const hasCoords = (d: Destination): d is Destination & { lng: number; lat: number } => d.lng != null && d.lat != null;

/* ---------- built-in list ---------- */

const CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" ");

/** Other names people type for a country. */
const ALIASES: Record<string, string[]> = {
  KR: ["korea"],
  US: ["usa", "us", "america", "united states of america", "states"],
  GB: ["uk", "britain", "great britain", "england", "scotland", "wales"],
  NL: ["holland"],
  CZ: ["czech republic"],
  TR: ["turkey"],
  AE: ["uae", "emirates"],
  MM: ["burma"],
  CI: ["ivory coast"],
  SZ: ["swaziland"],
  MK: ["macedonia"],
  CV: ["cape verde"],
};

interface Entry {
  d: Destination;
  /** Lowercased, accent-free names to match against (first is the display name). */
  keys: string[];
}

// [name, countryCode, lng, lat]
const CITIES: [string, string, number, number][] = [
  ["Tokyo", "JP", 139.69, 35.69], ["Kyoto", "JP", 135.77, 35.01], ["Osaka", "JP", 135.5, 34.69], ["Seoul", "KR", 126.98, 37.57],
  ["Busan", "KR", 129.08, 35.18], ["Beijing", "CN", 116.4, 39.9], ["Shanghai", "CN", 121.47, 31.23], ["Hong Kong", "HK", 114.17, 22.32],
  ["Taipei", "TW", 121.56, 25.03], ["Bangkok", "TH", 100.5, 13.76], ["Chiang Mai", "TH", 98.99, 18.79], ["Phuket", "TH", 98.39, 7.88],
  ["Singapore", "SG", 103.82, 1.35], ["Kuala Lumpur", "MY", 101.69, 3.14], ["Hanoi", "VN", 105.85, 21.03], ["Ho Chi Minh City", "VN", 106.7, 10.78],
  ["Bali", "ID", 115.19, -8.41], ["Manila", "PH", 120.98, 14.6], ["Delhi", "IN", 77.21, 28.61], ["Mumbai", "IN", 72.88, 19.08],
  ["Dubai", "AE", 55.27, 25.2], ["Istanbul", "TR", 28.98, 41.01], ["Cairo", "EG", 31.24, 30.04], ["Marrakesh", "MA", -7.99, 31.63],
  ["Cape Town", "ZA", 18.42, -33.92], ["Nairobi", "KE", 36.82, -1.29], ["London", "GB", -0.13, 51.51], ["Paris", "FR", 2.35, 48.86],
  ["Rome", "IT", 12.5, 41.9], ["Florence", "IT", 11.26, 43.77], ["Venice", "IT", 12.32, 45.44], ["Milan", "IT", 9.19, 45.46],
  ["Barcelona", "ES", 2.17, 41.39], ["Madrid", "ES", -3.7, 40.42], ["Lisbon", "PT", -9.14, 38.72], ["Porto", "PT", -8.61, 41.15],
  ["Amsterdam", "NL", 4.9, 52.37], ["Berlin", "DE", 13.4, 52.52], ["Munich", "DE", 11.58, 48.14], ["Prague", "CZ", 14.42, 50.08],
  ["Vienna", "AT", 16.37, 48.21], ["Budapest", "HU", 19.04, 47.5], ["Copenhagen", "DK", 12.57, 55.68], ["Stockholm", "SE", 18.07, 59.33],
  ["Oslo", "NO", 10.75, 59.91], ["Reykjavik", "IS", -21.94, 64.15], ["Dublin", "IE", -6.26, 53.35], ["Edinburgh", "GB", -3.19, 55.95],
  ["Athens", "GR", 23.73, 37.98], ["Santorini", "GR", 25.43, 36.39], ["Dubrovnik", "HR", 18.09, 42.65], ["Zurich", "CH", 8.54, 47.38],
  ["New York", "US", -74.01, 40.71], ["Los Angeles", "US", -118.24, 34.05], ["San Francisco", "US", -122.42, 37.77], ["Las Vegas", "US", -115.14, 36.17],
  ["Chicago", "US", -87.63, 41.88], ["Miami", "US", -80.19, 25.76], ["Honolulu", "US", -157.86, 21.31], ["Toronto", "CA", -79.38, 43.65],
  ["Vancouver", "CA", -123.12, 49.28], ["Montreal", "CA", -73.57, 45.5], ["Mexico City", "MX", -99.13, 19.43], ["Cancún", "MX", -86.85, 21.16],
  ["Havana", "CU", -82.37, 23.11], ["Rio de Janeiro", "BR", -43.17, -22.91], ["Buenos Aires", "AR", -58.38, -34.6], ["Lima", "PE", -77.04, -12.05],
  ["Cusco", "PE", -71.97, -13.53], ["Sydney", "AU", 151.21, -33.87], ["Melbourne", "AU", 144.96, -37.81], ["Auckland", "NZ", 174.76, -36.85],
  ["Queenstown", "NZ", 168.66, -45.03],
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

let built: Entry[] | null = null;
function entries(): Entry[] {
  if (built) return built;
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const countryName = (cc: string) => names.of(cc) ?? cc;
  built = [
    ...CODES.map((cc) => {
      const name = countryName(cc);
      return { d: { name, context: "", kind: "country", countryCode: cc.toLowerCase() }, keys: [norm(name), ...(ALIASES[cc] ?? [])] };
    }),
    ...CITIES.map(([name, cc, lng, lat]) => ({ d: { name, context: countryName(cc), kind: "city", countryCode: cc.toLowerCase(), lng, lat }, keys: [norm(name)] })),
  ];
  return built;
}

/** Optimal string alignment distance (Levenshtein + adjacent swaps, so "korae" is 1 from "korea"). */
function osa(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** How well q matches a key, as you type: full prefix > word prefix > close typo of the prefix. 0 = no match. */
function matchScore(q: string, key: string): number {
  if (key === q) return 4;
  if (key.startsWith(q)) return 3 + q.length / key.length / 2;
  const words = key.split(/[\s-]+/);
  if (words.some((w) => w.startsWith(q))) return 2.5;
  if (q.length < 4) return 0; // typos only once there's enough to go on ("par" shouldn't match "pan…")
  const allowed = q.length >= 7 ? 2 : 1;
  // Compare against the key cut to the typed length (prefix), and the whole key (finished word)
  // A typo of the whole name beats a typo of one word in it ("korae": the "korea" alias for South Korea over North Korea)
  const whole = Math.min(osa(q, key.slice(0, q.length)), osa(q, key));
  const word = Math.min(...words.map((w) => osa(q, w)));
  if (whole <= allowed) return 2 - whole * 0.4;
  return word <= allowed ? 1.8 - word * 0.4 : 0;
}

/** Instant, forgiving matches from the built-in list. */
export function localDestinations(q: string, limit = 4): Destination[] {
  const nq = norm(q);
  if (nq.length < 2) return [];
  return entries()
    .map((e) => ({ e, s: Math.max(...e.keys.map((k) => matchScore(nq, k))) }))
    .filter((x) => x.s > 0)
    .map((x) => ({ ...x, s: x.s + (x.e.d.kind === "country" ? 0.05 : 0) })) // countries win ties
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.e.d);
}

/* ---------- Photon ---------- */

const LAYERS = ["country", "state", "county", "city", "district", "locality"];

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    type?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    extent?: [number, number, number, number]; // [w, n, e, s]
  };
}

async function photon(q: string, signal?: AbortSignal, layers = LAYERS, limit = 6): Promise<Destination[]> {
  const params = new URLSearchParams({ q, limit: String(limit), lang: "en" });
  for (const l of layers) params.append("layer", l);
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  return json.features
    .filter((f) => f.properties.name)
    .map((f): Destination => {
      const p = f.properties;
      const e = p.extent;
      return {
        name: p.name!,
        context: [p.type !== "state" ? p.state : undefined, p.type !== "country" ? p.country : undefined].filter((s) => s && s !== p.name).join(", "),
        kind: p.type ?? "place",
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        bbox: e ? [e[0], e[3], e[2], e[1]] : undefined,
        countryCode: p.countrycode?.toLowerCase(),
      };
    });
}

/** Built-in matches first, then Photon's, without repeats. */
export async function searchDestinations(q: string, signal?: AbortSignal): Promise<Destination[]> {
  const local = localDestinations(q);
  const remote = await photon(q, signal).catch((e) => {
    if ((e as Error).name === "AbortError") throw e;
    return [] as Destination[];
  });
  const key = (d: Destination) => `${norm(d.name)}|${d.kind === "country" ? "" : norm(d.context)}|${d.countryCode ?? ""}`;
  const seen = new Set(local.map(key));
  // Same country from Photon carries its outline extent: keep the local slot, take Photon's coords
  for (const r of remote) {
    const l = local.find((d) => d.kind === "country" && r.kind === "country" && d.countryCode === r.countryCode);
    if (l) Object.assign(l, { lng: r.lng, lat: r.lat, bbox: r.bbox });
  }
  // When the built-in list understood the query, drop Photon's loose guesses that don't resemble it (Andorra for "korae")
  const nq = norm(q);
  const plausible = (r: Destination) => !local.length || matchScore(nq, norm(r.name)) > 0;
  return [
    ...local,
    ...remote.filter((r) => !seen.has(key(r)) && plausible(r) && !(r.kind === "country" && local.some((l) => l.countryCode === r.countryCode))),
  ].slice(0, 7);
}

const resolved = new Map<string, Destination>();
/** Built-in countries have no coordinates: look up the country's centre and outline once. */
export async function resolveDestination(d: Destination, signal?: AbortSignal): Promise<Destination> {
  if (hasCoords(d)) return d;
  const k = d.countryCode ?? d.name;
  const hit = resolved.get(k);
  if (hit) return hit;
  const found = (await photon(d.name, signal, ["country"], 5)).find((r) => r.countryCode === d.countryCode);
  const out = found ? { ...d, lng: found.lng, lat: found.lat, bbox: found.bbox } : d;
  if (found) resolved.set(k, out);
  return out;
}

/* ---------- outlines ---------- */

export type Outline = GeoJSON.Polygon | GeoJSON.MultiPolygon;
const outlines = new Map<string, Outline | null>();

/** The chosen place's boundary (simplified), from Nominatim. Null for places without one. */
export async function fetchOutline(d: Destination, signal?: AbortSignal): Promise<Outline | null> {
  const q = d.kind === "country" ? d.name : [d.name, d.context].filter(Boolean).join(", ");
  const k = `${q}|${d.kind}`;
  if (outlines.has(k)) return outlines.get(k)!;
  const featureType = d.kind === "country" ? "country" : d.kind === "state" ? "state" : ["city", "district", "locality"].includes(d.kind) ? "settlement" : "";
  const params = new URLSearchParams({ q, format: "geojson", polygon_geojson: "1", polygon_threshold: "0.005", limit: "1", "accept-language": "en" });
  if (d.countryCode) params.set("countrycodes", d.countryCode);
  const lookup = async (p: URLSearchParams) => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, { signal });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    // First result that's an area (some places come back as a point first, e.g. Istanbul's city node)
    const geom = ((await res.json()) as GeoJSON.FeatureCollection).features.map((f) => f.geometry).find((g) => g?.type === "Polygon" || g?.type === "MultiPolygon");
    return (geom as Outline | undefined) ?? null;
  };
  let out: Outline | null = null;
  if (featureType) out = await lookup(new URLSearchParams([...params, ["featureType", featureType]]));
  // Some cities are filed as provinces (Istanbul): try once more without the type
  if (!out) {
    if (featureType) await new Promise((r) => setTimeout(r, 1000)); // Nominatim's 1 request/second
    const wider = new URLSearchParams(params);
    wider.set("limit", "5");
    out = await lookup(wider);
  }
  outlines.set(k, out);
  return out;
}

/** Rough zoom to frame a place with no extent, by kind. */
export const zoomForKind = (kind: string) =>
  ({ country: 4, state: 5.5, county: 7, city: 9.5, district: 11, locality: 11 })[kind] ?? 8;
