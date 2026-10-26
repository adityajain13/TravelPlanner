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
