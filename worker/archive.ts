/*
 * Daily cron (wrangler.jsonc triggers): moves the stored originals of trips that ended more than a
 * year ago out of D1 into the ARCHIVE R2 bucket. D1 rows are size-limited and costly to keep around;
 * R2 is cheap file storage. Each row keeps its metadata and gets archived = 1; the read endpoints
 * (inbox mail, receipt photos) fetch the content from R2 when a row is archived.
 *
 *   mail/<id>.json      { html, text, attachments }   (attachments: the same JSON string the column held)
 *   receipts/<id>.jpg   the receipt photo
 *
 * Only trips with status 'done' or no status, and an end_date before the cutoff, are archived.
 * Each object is copied to R2 first; only after that succeeds is the D1 content cleared. A failure
 * is logged and skipped (the row stays in D1 untouched). At most MAX_MOVES objects per run.
 */
import type { Env } from "./util";

const MAX_MOVES = 100;

export async function archiveOldTrips(env: Env): Promise<number> {
  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const { results: trips } = await env.DB.prepare(
    "SELECT id FROM trips WHERE end_date IS NOT NULL AND end_date <> '' AND end_date < ? AND (status IS NULL OR status = 'done')",
  )
    .bind(cutoff)
    .all<{ id: string }>();

  let moved = 0;
  for (const { id: tripId } of trips) {
    if (moved >= MAX_MOVES) break;

    const { results: mail } = await env.DB.prepare(
      "SELECT DISTINCT m.id, m.html, m.text, m.attachments FROM mail m JOIN inbox i ON i.mail_id = m.id WHERE i.trip_id = ? AND m.archived = 0",
    )
      .bind(tripId)
      .all<{ id: string; html: string | null; text: string | null; attachments: string | null }>();
    for (const m of mail) {
      if (moved >= MAX_MOVES) break;
      try {
        await env.ARCHIVE.put(`mail/${m.id}.json`, JSON.stringify({ html: m.html, text: m.text, attachments: m.attachments }), {
          httpMetadata: { contentType: "application/json" },
        });
        await env.DB.prepare("UPDATE mail SET html = NULL, text = NULL, attachments = NULL, archived = 1 WHERE id = ?").bind(m.id).run();
        moved++;
      } catch (e) {
        console.error(`archive: mail ${m.id} (trip ${tripId}) skipped`, e);
      }
    }

    // Ids first, then one photo's bytes at a time, so a trip with many receipts never sits in memory whole
    const { results: photos } = await env.DB.prepare("SELECT id FROM receipt_photos WHERE trip_id = ? AND archived = 0")
      .bind(tripId)
      .all<{ id: string }>();
    for (const p of photos) {
      if (moved >= MAX_MOVES) break;
      try {
        const row = await env.DB.prepare("SELECT data FROM receipt_photos WHERE id = ?").bind(p.id).first<{ data: ArrayBuffer }>();
        if (!row) continue;
        // D1 hands BLOBs back as a plain array of bytes
        await env.ARCHIVE.put(`receipts/${p.id}.jpg`, new Uint8Array(row.data as ArrayLike<number> & ArrayBuffer), { httpMetadata: { contentType: "image/jpeg" } });
        await env.DB.prepare("UPDATE receipt_photos SET data = x'', archived = 1 WHERE id = ?").bind(p.id).run();
        moved++;
      } catch (e) {
        console.error(`archive: receipt photo ${p.id} (trip ${tripId}) skipped`, e);
      }
    }
  }

  console.log(`archive: moved ${moved} object(s) from ${trips.length} trip(s) ended before ${cutoff}`);
  return moved;
}
