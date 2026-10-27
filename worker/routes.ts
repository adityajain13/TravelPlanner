/*
 * Google Routes API (transit) through the Worker. The browser can't rely on CORS for
 * routes.googleapis.com, so the app sends its (public, referrer-restricted) key here and the
 * Worker calls Google with the site as Referer. Signed-in users or share-link holders only.
 */
import { getSession } from "./auth";
import { verifyShareToken } from "./trips";
import { API, error, type Env } from "./util";

const FIELDS =
  "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.transitLine.name,routes.legs.steps.transitDetails.transitLine.vehicle.type";

export async function handleRoutes(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === `${API}/routes/japan`) return japan(req, env, url);
  if (url.pathname !== `${API}/routes/transit`) return null;
  if (req.method !== "POST") return error(405, "POST only");
  const share = url.searchParams.get("share");
  if (!(await getSession(req, env)) && !(share && (await verifyShareToken(env, share)))) return error(401, "Sign in");
  const body = (await req.json().catch(() => null)) as { from?: [number, number]; to?: [number, number]; key?: string; departure?: string } | null;
  const key = env.GOOGLE_ROUTES_KEY || body?.key;
  if (!body?.from || !body?.to || !key) return error(400, "Missing from/to/key");
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS, Referer: `${url.origin}/travelplanner/` },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: body.from[1], longitude: body.from[0] } } },
      destination: { location: { latLng: { latitude: body.to[1], longitude: body.to[0] } } },
      travelMode: "TRANSIT",
      ...(body.departure ? { departureTime: body.departure } : {}),
    }),
  });
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}

/*
 * Japan: Google has no transit there, so trains come from NAVITIME (via RapidAPI; the free plan
 * is a few hundred searches a month, and the app caches every answer). Returns the same shape
 * the app uses for any transit leg.
 */
type NaviSection = {
  type?: string;
  move?: string;
  line_name?: string;
  time?: number;
  distance?: number;
  transport?: { name?: string; type?: string };
};
type NaviItem = {
  summary?: { move?: { time?: number; distance?: number; transit_count?: number } };
  sections?: NaviSection[];
  shapes?: { features?: { geometry?: { type?: string; coordinates?: unknown } }[] } | { type?: string; coordinates?: unknown };
};

async function japan(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.method !== "POST") return error(405, "POST only");
  const share = url.searchParams.get("share");
  if (!(await getSession(req, env)) && !(share && (await verifyShareToken(env, share)))) return error(401, "Sign in");
  if (!env.NAVITIME_RAPIDAPI_KEY) return error(501, "Japan transit isn't set up (NAVITIME_RAPIDAPI_KEY)");
  const body = (await req.json().catch(() => null)) as { from?: [number, number]; to?: [number, number]; when?: string } | null;
  if (!body?.from || !body?.to) return error(400, "Missing from/to");

  const call = async (withTime: boolean) => {
    const q = new URLSearchParams({
      start: `${body.from![1]},${body.from![0]}`,
      goal: `${body.to![1]},${body.to![0]}`,
      shape: "true",
      // Several candidates in one request; we keep the quickest (the first isn't always it)
      limit: "5",
      order: "time",
    });
    // Local Japan time, without the offset
    if (withTime && body.when) q.set("start_time", body.when.slice(0, 19));
    return fetch(`https://navitime-route-totalnavi.p.rapidapi.com/route_transit?${q}`, {
      headers: { "x-rapidapi-key": env.NAVITIME_RAPIDAPI_KEY!, "x-rapidapi-host": "navitime-route-totalnavi.p.rapidapi.com" },
    });
  };
  // Kept in D1 for a year, shared by everyone: the same hop at the same hour isn't searched twice
  const cacheKey = `v2|${body.from.map((v) => v.toFixed(4)).join(",")}|${body.to.map((v) => v.toFixed(4)).join(",")}|${(body.when ?? "").slice(0, 13)}`;
  const YEAR = 365 * 86400000;
  const hit = await env.DB.prepare("SELECT body FROM transit_cache WHERE key = ? AND created_at > ?").bind(cacheKey, Date.now() - YEAR).first<{ body: string }>();
  if (hit) return new Response(hit.body, { headers: { "content-type": "application/json" } });

  let res = await call(true);
  if (!res.ok && body.when && res.status !== 429 && res.status !== 403) res = await call(false); // e.g. a date outside the timetable
  if (!res.ok) return error(res.status === 429 ? 429 : 502, res.status === 429 ? "NAVITIME monthly limit reached" : `NAVITIME ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const j = (await res.json()) as { items?: NaviItem[] };
  const it = [...(j.items ?? [])].filter((x) => x.summary?.move?.time).sort((a, b) => a.summary!.move!.time! - b.summary!.move!.time!)[0];
  const keep = async (r: Response) => {
    const text = await r.text();
    await env.DB.prepare("INSERT OR REPLACE INTO transit_cache (key, body, created_at) VALUES (?, ?, ?)").bind(cacheKey, text, Date.now()).run().catch(() => undefined);
    return new Response(text, { headers: { "content-type": "application/json" } });
  };
  if (!it?.summary?.move?.time) return keep(Response.json({ route: null }));

  const steps: { mode: string; name?: string; minutes: number }[] = [];
  for (const s of it.sections ?? []) {
    if (s.type !== "move") continue;
    const walk = s.move === "walk";
    const prev = steps.at(-1);
    if (walk && prev?.mode === "WALK") prev.minutes += s.time ?? 0;
    else steps.push({ mode: walk ? "WALK" : (s.move ?? "TRAIN").toUpperCase(), name: walk ? undefined : (s.line_name ?? s.transport?.name), minutes: s.time ?? 0 });
  }
  // shapes: GeoJSON (FeatureCollection of LineStrings, [lon, lat])
  const coords: [number, number][] = [];
  const feats = it.shapes && "features" in it.shapes ? (it.shapes.features ?? []) : it.shapes ? [{ geometry: it.shapes as { type?: string; coordinates?: unknown } }] : [];
  for (const f of feats) {
    const g = f.geometry;
    if (g?.type === "LineString") coords.push(...(g.coordinates as [number, number][]));
    else if (g?.type === "MultiLineString") for (const line of g.coordinates as [number, number][][]) coords.push(...line);
  }
  // NAVITIME's summary distance can leave out the rail part; the drawn route's length can't
  const R = 6371000;
  let shapeLen = 0;
  for (let i = 1; i < coords.length; i++) {
    const [a, b] = [coords[i - 1], coords[i]];
    const dLat = ((b[1] - a[1]) * Math.PI) / 180;
    const dLng = ((b[0] - a[0]) * Math.PI) / 180;
    shapeLen += 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2));
  }
  return keep(Response.json({
    route: {
      duration: it.summary.move.time * 60,
      distance: Math.max(it.summary.move.distance ?? 0, Math.round(shapeLen)),
      transfers: it.summary.move.transit_count ?? Math.max(0, steps.filter((x) => x.mode !== "WALK").length - 1),
      steps,
      coords,
    },
  }));
}
