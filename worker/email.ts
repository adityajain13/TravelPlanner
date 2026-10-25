import PostalMime from "postal-mime";
import type { Env } from "./util";

/*
 * trips@adityajain.ca → Email Routing → this handler.
 * Only mail from an allow-listed sender is processed (you forward bookings from your Gmail).
 * Claude extracts bookings into structured JSON and picks the matching trip; results land in
 * the D1 `inbox` table for review in the app, and a short receipt is emailed back.
 */

export interface Booking {
  type: "flight" | "hotel" | "train" | "bus" | "car" | "restaurant" | "activity" | "other";
  title: string; // e.g. "Air Canada AC1 YYZ → HND"
  confirmation?: string;
  start_date?: string; // YYYY-MM-DD, local to the place
  start_time?: string; // HH:MM
  end_date?: string;
  end_time?: string;
  location_name?: string; // hotel/restaurant name, departure station/airport
  address?: string;
  from?: string;
  to?: string;
  notes?: string; // seat, room type, cancellation deadline, price, etc.
}

interface TripRow {
  id: string;
  title: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
}

const MAX_CHARS = 40_000;

const TOOL = {
  name: "record_bookings",
  description: "Record every travel booking found in the email.",
  input_schema: {
    type: "object",
    properties: {
      bookings: {
        type: "array",
        description: "One entry per booking. A round trip is two flights; a multi-leg itinerary is one entry per leg. Empty if the email contains no booking.",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["flight", "hotel", "train", "bus", "car", "restaurant", "activity", "other"] },
            title: { type: "string", description: 'Short label for an itinerary, e.g. "AC1 Toronto → Tokyo Haneda", "Hotel Granvia Kyoto", "Nozomi 21 Tokyo → Kyoto".' },
            confirmation: { type: "string" },
            start_date: { type: "string", description: "YYYY-MM-DD in the local time of the place (departure, check-in, reservation)." },
            start_time: { type: "string", description: "HH:MM 24h local time." },
            end_date: { type: "string", description: "YYYY-MM-DD (arrival, check-out)." },
            end_time: { type: "string", description: "HH:MM 24h local time." },
            location_name: { type: "string", description: "Hotel/venue name, or departure airport/station." },
            address: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            notes: { type: "string", description: "Useful extras only: seats, room type, check-in time, cancellation deadline, total price, terminal." },
          },
          required: ["type", "title"],
        },
      },
      trip_id: { type: ["string", "null"], description: "id of the trip these bookings belong to, from the provided list, or null if none fits." },
      summary: { type: "string", description: "One sentence describing what was found, for the receipt email." },
    },
    required: ["bookings", "trip_id", "summary"],
  },
};

async function extract(env: Env, subject: string, body: string, trips: TripRow[]) {
  const tripList = trips.length
    ? trips.map((t) => `- id ${t.id}: "${t.title}" (${t.destination ?? "?"}, ${t.start_date} → ${t.end_date})`).join("\n")
    : "(no trips yet)";
  const prompt = `Today is ${new Date().toISOString().slice(0, 10)}. Extract the travel bookings from this forwarded email and match them to a trip.

Trips:
${tripList}

Pick the trip whose dates and destination fit the bookings (allow a few days either side for travel days). If none fits, use null.

Subject: ${subject}

${body.slice(0, MAX_CHARS)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.EXTRACT_MODEL || "claude-haiku-5-5",
      max_tokens: 2000,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content: { type: string; input?: unknown }[] };
  const out = data.content.find((c) => c.type === "tool_use")?.input as { bookings: Booking[]; trip_id: string | null; summary: string } | undefined;
  if (!out) throw new Error("No structured output");
  const valid = new Set(trips.map((t) => t.id));
  return { ...out, trip_id: out.trip_id && valid.has(out.trip_id) ? out.trip_id : null };
}

/** HTML → readable text, enough for extraction (booking emails are mostly tables). */
function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
}

async function reply(env: Env, to: string, subject: string, text: string) {
  try {
    await env.EMAIL.send({ to, from: { email: env.MAIL_FROM, name: "Travel Planner" }, subject, text });
  } catch (e) {
    console.error("receipt failed", e);
  }
}

export async function handleEmail(message: ForwardableEmailMessage, env: Env) {
  const sender = message.from.trim().toLowerCase();
  const allowed = (env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  if (!allowed.includes(sender)) {
    message.setReject("This address only accepts mail from its owner.");
    return;
  }

  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(raw);
  const subject = (parsed.subject ?? "").replace(/^(fwd?|fw):\s*/i, "").trim();
  const body = (parsed.text?.trim() || htmlToText(parsed.html ?? "")).trim();
  const appUrl = "https://adityajain.ca/travelplanner/";

  if (!env.ANTHROPIC_API_KEY) {
    await reply(env, sender, `Couldn't read: ${subject}`, "Email import isn't set up yet: the Worker has no ANTHROPIC_API_KEY secret.");
    return;
  }

  const { results: trips } = await env.DB.prepare(
    "SELECT id, title, destination, start_date, end_date FROM trips WHERE owner = ? AND title IS NOT NULL ORDER BY start_date",
  )
    .bind(sender)
    .all<TripRow>();

  let out;
  try {
    out = await extract(env, subject, body, trips);
  } catch (e) {
    console.error(e);
    await reply(env, sender, `Couldn't read: ${subject}`, `Something went wrong reading that email (${(e as Error).message}). Try forwarding it again later.`);
    return;
  }

  if (!out.bookings.length) {
    await reply(env, sender, `No booking found: ${subject}`, "I couldn't find a flight, hotel, train or reservation in that email, so nothing was added.");
    return;
  }

  const now = Date.now();
  await env.DB.batch(
    out.bookings.map((b) =>
      env.DB.prepare("INSERT INTO inbox (id, owner, trip_id, status, subject, booking, created_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)").bind(
        crypto.randomUUID(),
        sender,
        out.trip_id,
        subject,
        JSON.stringify(b),
        now,
      ),
    ),
  );

  const trip = trips.find((t) => t.id === out.trip_id);
  const where = trip ? `in "${trip.title}"` : "in your inbox (no matching trip, so pick one in the app)";
  await reply(
    env,
    sender,
    `Got it: ${out.bookings.length} booking${out.bookings.length > 1 ? "s" : ""} ready to review`,
    `${out.summary}\n\nThey're waiting ${where}:\n${out.bookings.map((b) => `• ${b.title}${b.start_date ? ` (${b.start_date}${b.start_time ? ` ${b.start_time}` : ""})` : ""}`).join("\n")}\n\nReview and add them: ${appUrl}`,
  );
}
