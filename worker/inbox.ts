import { getSession } from "./auth";
import { API, error, json, type Env } from "./util";

/*
 *   GET   /api/inbox          pending bookings imported from email
 *   GET   /api/inbox?all=1    every forwarded booking (any status), for the "imported emails" list
 *   PATCH /api/inbox/:id      {status?: "added" | "dismissed" | "pending", trip_id?: string | null}
 *   DELETE /api/inbox/:id     forget a forwarded booking entirely
 */
/** Trips the user can edit without owning them (a bound email parameter). */
const EDITABLE = "SELECT trip_id FROM trip_members WHERE email = ? AND role = 'edit'";

export async function handleInbox(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith(`${API}/inbox`)) return null;
  const session = await getSession(req, env);
  if (!session) return error(401, "Not logged in");
  const id = url.pathname.slice(`${API}/inbox/`.length);

  if (!id && req.method === "GET") {
    const all = url.searchParams.get("all") === "1";
    const { results } = await env.DB.prepare(
      `SELECT id, trip_id, subject, booking, created_at, status FROM inbox WHERE (owner = ? OR trip_id IN (${EDITABLE})) ${all ? "" : "AND status = 'pending'"} ORDER BY created_at DESC LIMIT 200`,
    )
      .bind(session.email, session.email)
      .all<{ id: string; trip_id: string | null; subject: string; booking: string; created_at: number; status: string }>();
    return json({ items: results.map((r) => ({ ...r, booking: JSON.parse(r.booking) })) });
  }

  if (id && req.method === "PATCH") {
    const body = (await req.json().catch(() => ({}))) as { status?: string; trip_id?: string | null };
    if (body.status && !["added", "dismissed", "pending"].includes(body.status)) return error(400, "Bad status");
    if (body.trip_id) {
      const own = await env.DB.prepare(`SELECT 1 FROM trips WHERE id = ? AND (owner = ? OR id IN (${EDITABLE}))`).bind(body.trip_id, session.email, session.email).first();
      if (!own) return error(403, "Not your trip");
    }
    const r = await env.DB.prepare(
      `UPDATE inbox SET status = COALESCE(?, status), trip_id = CASE WHEN ? THEN ? ELSE trip_id END WHERE id = ? AND (owner = ? OR trip_id IN (${EDITABLE}))`,
    )
      .bind(body.status ?? null, "trip_id" in body ? 1 : 0, body.trip_id ?? null, id, session.email, session.email)
      .run();
    if (!r.meta.changes) return error(404, "Not found");
    return json({ ok: true });
  }
  if (id && req.method === "DELETE") {
    const r = await env.DB.prepare(`DELETE FROM inbox WHERE id = ? AND (owner = ? OR trip_id IN (${EDITABLE}))`).bind(id, session.email, session.email).run();
    if (!r.meta.changes) return error(404, "Not found");
    return json({ ok: true });
  }
  return error(404, "Not found");
}
