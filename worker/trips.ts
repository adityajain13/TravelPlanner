import { getSession, type Session } from "./auth";
import { API, b64url, b64urlDecode, error, hmac, isValidTripId, json, randomToken, safeEqual, sha256, type Env } from "./util";

/*
 *   GET    /api/trips                  your trips plus trips shared with you (role, owner)
 *   GET    /api/trips/:id/members      people with their own login on this trip (owner only)
 *   PUT    /api/trips/:id/members      {email, role} add or change someone → {invite} one-time sign-in link
 *   DELETE /api/trips/:id/members/:e   remove someone (owner), or leave (yourself)
 *   POST   /api/trips/:id/share        {role} → share link token (stable until reset)
 *   DELETE /api/trips/:id/share        reset: revokes every existing link
 *   GET    /api/trips/:id/senders      who else may forward emails to trips+<id>@
 *   PUT    /api/trips/:id/senders      {emails} replace that list (owner only)
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

function secret(env: Env) {
  if (!env.SHARE_SECRET) throw new Error("SHARE_SECRET is not set on the Worker");
  return env.SHARE_SECRET;
}

async function makeShareToken(env: Env, tripId: string, role: Role, version: number) {
  const payload = `${tripId}.${role}.${version}`;
  return `${b64url(enc.encode(payload))}.${await hmac(secret(env), payload)}`;
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
  if (!safeEqual(sig, await hmac(secret(env), payload))) return null;
  const [tripId, role, v] = payload.split(".");
  if (role !== "view" && role !== "edit") return null;
  const row = await env.DB.prepare("SELECT share_version FROM trips WHERE id = ?").bind(tripId).first<{ share_version: number }>();
  if (!row || String(row.share_version) !== v) return null; // reset since
  return { tripId, role };
}

async function getTrip(env: Env, id: string) {
  return env.DB.prepare("SELECT * FROM trips WHERE id = ?").bind(id).first<TripRow>();
}

/** Owner, or the role someone was given. */
async function access(env: Env, s: Session, id: string): Promise<Role | "owner" | null> {
  const row = await getTrip(env, id);
  if (row?.owner === s.email) return "owner";
  const m = await env.DB.prepare("SELECT role FROM trip_members WHERE trip_id = ? AND email = ?").bind(id, s.email).first<{ role: Role }>();
  if (m) return m.role;
  // Unclaimed trip id: whoever syncs it first owns it (anyone who can log in can make trips)
  if (!row) return (await ownTrip(env, s, id)) instanceof Response ? null : "owner";
  return null;
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
    const { results: shared } = await env.DB.prepare(
      "SELECT t.id, t.title, t.destination, t.start_date, t.end_date, t.updated_at, t.owner, m.role FROM trip_members m JOIN trips t ON t.id = m.trip_id WHERE m.email = ? AND t.title IS NOT NULL ORDER BY t.start_date",
    )
      .bind(session.email)
      .all();
    return json({ trips: [...results, ...shared] });
  }

  const id = parts[1];
  if (!id || !isValidTripId(id)) return error(400, "Bad trip id");

  if (parts.length === 2 && req.method === "DELETE") {
    const row = await getTrip(env, id);
    if (row && row.owner !== session.email) return error(403, "Not your trip");
    if (row) {
      await env.TRIP_ROOM.get(env.TRIP_ROOM.idFromName(id)).fetch("https://room/", { headers: { "X-Action": "destroy" } });
      await env.DB.batch([
        env.DB.prepare("DELETE FROM trips WHERE id = ?").bind(id),
        env.DB.prepare("DELETE FROM trip_senders WHERE trip_id = ?").bind(id),
        env.DB.prepare("DELETE FROM trip_members WHERE trip_id = ?").bind(id),
        env.DB.prepare("DELETE FROM invites WHERE trip_id = ?").bind(id),
      ]);
    }
    return json({ ok: true });
  }

  if (parts[2] === "members") {
    const target = parts[3] ? decodeURIComponent(parts[3]).toLowerCase() : undefined;
    // Anyone can remove themselves (leave a shared trip)
    if (req.method === "DELETE" && target === session.email) {
      await env.DB.prepare("DELETE FROM trip_members WHERE trip_id = ? AND email = ?").bind(id, target).run();
      return json({ ok: true });
    }
    const row = await ownTrip(env, session, id);
    if (row instanceof Response) return row;
    if (req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT email, role FROM trip_members WHERE trip_id = ? ORDER BY added_at, email").bind(id).all<{ email: string; role: Role }>();
      return json({ members: results });
    }
    if (req.method === "PUT") {
      const body = (await req.json().catch(() => ({}))) as { email?: string; role?: Role; invite?: boolean };
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(400, "Enter a valid email");
      if (email === session.email) return error(400, "That's you");
      if (body.role !== "view" && body.role !== "edit") return error(400, "role must be view or edit");
      const n = await env.DB.prepare("SELECT count(*) AS n FROM trip_members WHERE trip_id = ?").bind(id).first<{ n: number }>();
      if ((n?.n ?? 0) >= 20) return error(400, "At most 20 people per trip");
      await env.DB.prepare(
        "INSERT INTO trip_members (trip_id, email, role, added_at) VALUES (?, ?, ?, ?) ON CONFLICT (trip_id, email) DO UPDATE SET role = excluded.role",
      )
        .bind(id, email, body.role, Date.now())
        .run();
      // One-time sign-in link for them (7 days), so they don't depend on login emails arriving
      let invite: string | undefined;
      if (body.invite !== false) {
        const t = randomToken(24);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM invites WHERE expires_at < ?").bind(Date.now()),
          env.DB.prepare("INSERT INTO invites (token_hash, email, trip_id, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(t), email, id, Date.now() + 7 * 86400000),
        ]);
        invite = `${url.origin}${API}/auth/invite?t=${t}`;
      }
      return json({ ok: true, invite });
    }
    if (req.method === "DELETE" && target) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM trip_members WHERE trip_id = ? AND email = ?").bind(id, target),
        env.DB.prepare("DELETE FROM invites WHERE trip_id = ? AND email = ?").bind(id, target),
      ]);
      return json({ ok: true });
    }
  }

  if (parts[2] === "senders") {
    const row = await ownTrip(env, session, id);
    if (row instanceof Response) return row;
    if (req.method === "PUT") {
      const { emails } = (await req.json().catch(() => ({}))) as { emails?: unknown };
      if (!Array.isArray(emails)) return error(400, "emails must be a list");
      const clean = [...new Set(emails.map((e) => String(e).trim().toLowerCase()))].filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e !== session.email);
      if (clean.length > 20) return error(400, "At most 20 people");
      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare("DELETE FROM trip_senders WHERE trip_id = ?").bind(id),
        ...clean.map((e) => env.DB.prepare("INSERT INTO trip_senders (trip_id, email, added_at) VALUES (?, ?, ?)").bind(id, e, now)),
      ]);
      return json({ emails: clean });
    }
    if (req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT email FROM trip_senders WHERE trip_id = ? ORDER BY added_at, email").bind(id).all<{ email: string }>();
      return json({ emails: results.map((r) => r.email) });
    }
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
      const a = await access(env, session, id);
      if (a) role = a === "owner" ? "edit" : a;
    }
  }
  if (!role) return error(403, "No access to this trip");

  const stub = env.TRIP_ROOM.get(env.TRIP_ROOM.idFromName(id));
  const headers = new Headers(req.headers);
  headers.set("X-Role", role);
  headers.set("X-Trip-Id", id);
  return stub.fetch(new Request(req.url, { headers, method: "GET" }));
}
