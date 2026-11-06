import { getSession } from "./auth";
import { API, error, json, type Env } from "./util";

/*
 *   GET   /api/inbox          pending bookings imported from email
 *   GET   /api/inbox?all=1    every forwarded booking (any status), for the "imported emails" list
 *   PATCH /api/inbox/:id      {status?: "added" | "dismissed" | "pending", trip_id?: string | null}
 *   DELETE /api/inbox/:id     forget a forwarded booking entirely
 *   GET   /api/inbox/:id/mail the original email it came from (kept since mail storage began)
 */
/** Trips the user can edit without owning them (a bound email parameter). */
const EDITABLE = "SELECT trip_id FROM trip_members WHERE email = ? AND role = 'edit'";

export async function handleInbox(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith(`${API}/inbox`)) return null;
  const session = await getSession(req, env);
  if (!session) return error(401, "Not logged in");
  const [id = "", sub] = url.pathname.slice(`${API}/inbox/`.length).split("/");
  if (sub === "mail" && id && req.method === "GET") return inboxMail(env, session.email, id);
  if (sub) return error(404, "Not found");

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

/** The forwarded email behind a booking: anyone who can see the booking (owner, trip editor, or the forwarder). */
async function inboxMail(env: Env, email: string, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT m.id AS mail_id, m.archived, m.subject, m.sender, m.received_at, m.html, m.text, m.attachments
       FROM inbox i JOIN mail m ON m.id = i.mail_id
      WHERE i.id = ? AND (i.owner = ? OR json_extract(i.booking, '$.forwarded_by') = ? OR i.trip_id IN (${EDITABLE}))`,
  )
    .bind(id, email, email, email)
    .first<{ mail_id: string; archived: number; subject: string | null; sender: string | null; received_at: number; html: string | null; text: string | null; attachments: string | null }>();
  if (!row) return error(404, "not kept");
  let content = { html: row.html, text: row.text, attachments: row.attachments };
  if (row.archived) {
    // Moved to R2 by the daily archive (worker/archive.ts): same fields, stored as one JSON object
    const obj = await env.ARCHIVE.get(`mail/${row.mail_id}.json`);
    if (!obj) return error(404, "not kept");
    content = (await obj.json()) as typeof content;
  }
  // The stored email never changes, so the browser may keep it for an hour
  return json(
    { subject: row.subject, sender: row.sender, received_at: row.received_at, html: content.html, text: content.text, attachments: JSON.parse(content.attachments ?? "[]") },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
