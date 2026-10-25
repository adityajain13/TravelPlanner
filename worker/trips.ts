import { getSession, type Session } from "./auth";
import { API, b64url, b64urlDecode, error, hmac, isValidTripId, json, safeEqual, type Env } from "./util";

/*
 *   GET    /api/trips                  your trips (for listing on a new device)
 *   POST   /api/trips/:id/share        {role} → share link token (stable until reset)
 *   DELETE /api/trips/:id/share        reset: revokes every existing link
 *   DELETE /api/trips/:id              delete the trip everywhere
 *   GET    /api/share/:token           resolve a link → {tripId, role, title}
 *   GET    /api/sync/:id  (WebSocket)  Yjs sync, via session (owner) or ?share=token
 */

export type Role = "view" | "edit";

interface TripRow {
  id: string;
  owner: string;
  title: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  share_version: number;
  updated_at: number;
}

const enc = new TextEncoder();

async function makeShareToken(env: Env, tripId: string, role: Role, version: number) {
  const payload = `${tripId}.${role}.${version}`;
  return `${b64url(enc.encode(payload))}.${await hmac(env.SHARE_SECRET, payload)}`;
}

export async function verifyShareToken(env: Env, token: string): Promise<{ tripId: string; role: Role } | null> {
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  let payload: string;
  try {
    payload = b64urlDecode(p);
  } catch {
    return null;
  }
  if (!safeEqual(sig, await hmac(env.SHARE_SECRET, payload))) return null;
  const [tripId, role, v] = payload.split(".");
  if (role !== "view" && role !== "edit") return null;
  const row = await env.DB.prepare("SELECT share_version FROM trips WHERE id = ?").bind(tripId).first<{ share_version: number }>();
  if (!row || String(row.share_version) !== v) return null; // reset since
  return { tripId, role };
}

async function getTrip(env: Env, id: string) {
  return env.DB.prepare("SELECT * FROM trips WHERE id = ?").bind(id).first<TripRow>();
}

/** The logged-in user owns trips they create; the first one to sync a new trip ID claims it. */
async function ownTrip(env: Env, s: Session, id: string): Promise<TripRow | Response> {
  let row = await getTrip(env, id);
  if (!row) {
    await env.DB.prepare("INSERT OR IGNORE INTO trips (id, owner, updated_at) VALUES (?, ?, ?)").bind(id, s.email, Date.now()).run();
    row = await getTrip(env, id);
  }
  if (!row || row.owner !== s.email) return error(403, "Not your trip");
  return row;
}

export async function handleTrips(req: Request, env: Env, url: URL): Promise<Response | null> {
  const parts = url.pathname.slice(API.length + 1).split("/"); // e.g. ["trips", id, "share"]

  // Share-link resolution is public (the token is the credential)
  if (parts[0] === "share" && parts[1] && req.method === "GET") {
    const s = await verifyShareToken(env, parts[1]);
    if (!s) return error(404, "This link is invalid or was reset");
    const row = await getTrip(env, s.tripId);
    return json({ tripId: s.tripId, role: s.role, title: row?.title ?? "Shared trip", destination: row?.destination ?? "" });
  }

  if (parts[0] === "sync" && parts[1]) return handleSync(req, env, url, parts[1]);

  if (parts[0] !== "trips") return null;
  const session = await getSession(req, env);
  if (!session) return error(401, "Not logged in");

  if (parts.length === 1 && req.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, title, destination, start_date, end_date, updated_at FROM trips WHERE owner = ? AND title IS NOT NULL ORDER BY start_date",
    )
      .bind(session.email)
      .all();
    return json({ trips: results });
  }

  const id = parts[1];
  if (!id || !isValidTripId(id)) return error(400, "Bad trip id");

  if (parts.length === 2 && req.method === "DELETE") {
    const row = await getTrip(env, id);
    if (row && row.owner !== session.email) return error(403, "Not your trip");
    if (row) {
      await env.TRIP_ROOM.get(env.TRIP_ROOM.idFromName(id)).fetch("https://room/", { headers: { "X-Action": "destroy" } });
      await env.DB.prepare("DELETE FROM trips WHERE id = ?").bind(id).run();
    }
    return json({ ok: true });
  }

  if (parts[2] === "share") {
    const row = await ownTrip(env, session, id);
    if (row instanceof Response) return row;
    if (req.method === "POST") {
      const { role } = (await req.json().catch(() => ({}))) as { role?: Role };
      if (role !== "view" && role !== "edit") return error(400, "role must be view or edit");
      return json({ token: await makeShareToken(env, id, role, row.share_version), role });
    }
    if (req.method === "DELETE") {
      await env.DB.prepare("UPDATE trips SET share_version = share_version + 1 WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
  }
  return error(404, "Not found");
}

async function handleSync(req: Request, env: Env, url: URL, id: string): Promise<Response> {
  if (req.headers.get("Upgrade") !== "websocket") return error(426, "Expected WebSocket");
  if (!isValidTripId(id)) return error(400, "Bad trip id");

  let role: Role | null = null;
  const share = url.searchParams.get("share");
  if (share) {
    const s = await verifyShareToken(env, share);
    if (s?.tripId === id) role = s.role;
  }
  if (!role) {
    const session = await getSession(req, env);
    if (session) {
      const row = await ownTrip(env, session, id);
      if (!(row instanceof Response)) role = "edit";
    }
  }
  if (!role) return error(403, "No access to this trip");

  const stub = env.TRIP_ROOM.get(env.TRIP_ROOM.idFromName(id));
  const headers = new Headers(req.headers);
  headers.set("X-Role", role);
  headers.set("X-Trip-Id", id);
  return stub.fetch(new Request(req.url, { headers, method: "GET" }));
}
