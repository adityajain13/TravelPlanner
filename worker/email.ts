import PostalMime from "postal-mime";
import { sendMail, type Env } from "./util";
import { canLogin } from "./auth";
import { DETAILS_SCHEMA, formatBookingNotes } from "./bookingNotes";

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
  notes?: string; // standardized: one "**Label:** value" line per detail (see bookingNotes.ts)
  details?: Record<string, string>;
  traveler?: string; // passenger / guest name
  cost?: number; // total paid / due for this booking
  currency?: string; // ISO 4217
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
            title: { type: "string", description: 'Short label for an itinerary, e.g. "AC1 Toronto → Tokyo Haneda", "Hotel Granvia Kyoto", "Nozomi 21 Tokyo → Kyoto", "Nintendo Museum". No order/purchase/confirmation numbers in the title (they go in confirmation).' },
            confirmation: { type: "string" },
            start_date: { type: "string", description: "YYYY-MM-DD in the local time of the place (departure, check-in, reservation)." },
            start_time: { type: "string", description: "HH:MM 24h local time." },
            end_date: { type: "string", description: "YYYY-MM-DD (arrival, check-out)." },
            end_time: { type: "string", description: "HH:MM 24h local time." },
            location_name: { type: "string", description: "Hotel/venue name, or departure airport/station." },
            address: { type: "string" },
            from: { type: "string", description: "Departure city/station. For flights include the airport's IATA code, e.g. \"Toronto (YYZ)\"." },
            to: { type: "string", description: "Arrival city/station. For flights include the IATA code, e.g. \"Osaka (KIX)\"." },
            details: DETAILS_SCHEMA,
            notes: { type: "string", description: "Only useful extras that fit none of the details fields; short. Usually empty." },
            traveler: { type: "string", description: "Passenger or guest name this booking is for, as printed (e.g. \"Aditya Jain\"). One booking entry per passenger when the email lists several." },
            cost: { type: "number", description: "Price as a plain number (taxes and fees included), if shown anywhere in the email or attachments. When one price covers several legs or segments (connections, round trips), put it on the FIRST leg only and leave cost out of the others, unless per-leg prices are printed." },
            currency: { type: "string", description: "ISO 4217 code of cost, e.g. CAD, JPY, EUR. Infer from symbols and the booking site (¥ on a Japanese site = JPY)." },
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

export interface Attachment {
  filename: string;
  mimeType: string;
  base64: string;
}

async function extract(env: Env, subject: string, body: string, trips: TripRow[], pdfs: Attachment[] = []) {
  const tripList = trips.length
    ? trips.map((t) => `- id ${t.id}: "${t.title}" (${t.destination ?? "?"}, ${t.start_date} → ${t.end_date})`).join("\n")
    : "(no trips yet)";
  const prompt = `Today is ${new Date().toISOString().slice(0, 10)}. Extract the travel bookings from this forwarded email and match them to a trip.

Trips:
${tripList}

Pick the trip whose dates and destination fit the bookings (allow a few days either side for travel days). If none fits, use null.
Include each booking's total price (cost + currency) when it appears in the email or any attached PDF (receipts, e-tickets, invoices).

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
      max_tokens: 3000,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      // Attached PDFs (e-tickets, invoices) are read too: often the only place the price is
      messages: [
        {
          role: "user",
          content: [
            ...pdfs.map((a) => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 }, title: a.filename })),
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content: { type: string; input?: unknown }[] };
  const out = data.content.find((c) => c.type === "tool_use")?.input as { bookings: Booking[]; trip_id: string | null; summary: string } | undefined;
  if (!out) throw new Error("No structured output");
  const valid = new Set(trips.map((t) => t.id));
  dedupeLegCosts(out.bookings);
  // Same layout for every import: details in a fixed order per type, then any other notes
  for (const b of out.bookings) {
    b.notes = formatBookingNotes(b.type, b.details, b.notes);
    delete b.details;
  }
  return { ...out, trip_id: out.trip_id && valid.has(out.trip_id) ? out.trip_id : null };
}

/**
 * One fare covering several legs: the model sometimes repeats the total on every leg. Keep it on
 * the earliest leg per traveler and drop the copies, so the budget counts it once.
 */
function dedupeLegCosts(bookings: Booking[]) {
  const seen = new Map<string, Booking>();
  const order = [...bookings].sort((a, b) => `${a.start_date ?? ""}${a.start_time ?? ""}`.localeCompare(`${b.start_date ?? ""}${b.start_time ?? ""}`));
  for (const b of order) {
    if (b.cost == null || !["flight", "train", "bus"].includes(b.type)) continue;
    const key = `${b.type}|${(b.traveler ?? "").toLowerCase()}|${b.cost}|${b.currency ?? ""}`;
    if (seen.has(key)) delete b.cost;
    else seen.set(key, b);
  }
}

/** Up to 3 PDF attachments, 4 MB each (keeps the request small and cheap). */
function pdfAttachments(parsed: { attachments?: { filename?: string | null; mimeType?: string; content: ArrayBuffer | string | Uint8Array }[] }): Attachment[] {
  const out: Attachment[] = [];
  for (const a of parsed.attachments ?? []) {
    const isPdf = a.mimeType === "application/pdf" || /\.pdf$/i.test(a.filename ?? "");
    if (!isPdf || out.length >= 3) continue;
    const bytes = typeof a.content === "string" ? new TextEncoder().encode(a.content) : a.content instanceof Uint8Array ? a.content : new Uint8Array(a.content);
    if (bytes.byteLength > 4 * 1024 * 1024) continue;
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out.push({ filename: a.filename ?? "attachment.pdf", mimeType: "application/pdf", base64: btoa(bin) });
  }
  return out;
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
    await sendMail(env, { to, subject, text });
  } catch (e) {
    console.error("receipt failed", e);
  }
}

export async function handleEmail(message: ForwardableEmailMessage, env: Env) {
  const sender = message.from.trim().toLowerCase();
  const allowed = (env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  // trips+<trip id>@… (from the trip's Forward dialog) pins the email to that trip, no guessing
  const tag = message.to.toLowerCase().match(/^[^+@]+\+([a-z0-9_-]+)@/)?.[1];

  // Account mail for the sending address itself (e.g. Google verifying trips@ so it can have a
  // profile photo in Gmail) goes to the owner's inbox instead of being read as a booking
  // (Google's envelope sender is a bounce address like …@gaia.bounces.google.com, so match any google.com subdomain)
  if (/@([a-z0-9-]+\.)*google\.com$/.test(sender) && allowed[0]) {
    await message.forward(allowed[0]);
    return;
  }

  // Untagged mail: from anyone with an account, matched against their own trips.
  // trips+<id>@: from the trip's owner, an editor on it, or someone on its "who can forward" list;
  // bookings then land in the owner's inbox for that trip.
  let owner = sender;
  if (tag) {
    const trip = await env.DB.prepare("SELECT id, owner FROM trips WHERE lower(id) = ?").bind(tag).first<{ id: string; owner: string }>();
    const ok =
      trip &&
      (trip.owner === sender ||
        (await env.DB.prepare("SELECT 1 FROM trip_members WHERE trip_id = ? AND email = ? AND role = 'edit'").bind(trip.id, sender).first()) ||
        (await env.DB.prepare("SELECT 1 FROM trip_senders WHERE trip_id = ? AND email = ?").bind(trip.id, sender).first()));
    if (!ok) {
      message.setReject("You can't forward to this trip. Ask the trip owner to add your address.");
      return;
    }
    owner = trip!.owner;
  } else if (!allowed.includes(sender) && !(await canLogin(env, sender))) {
    message.setReject("This address only accepts mail from Atlas Journeys users. Ask the trip owner to add you, then send to the trip's own address.");
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
    .bind(owner)
    .all<TripRow>()
    // A guest only ever sees (and can only add to) the trip they were invited to
    .then((r) => ({ results: owner === sender ? r.results : r.results.filter((t) => t.id.toLowerCase() === tag) }));

  const pinned = tag ? trips.find((t) => t.id.toLowerCase() === tag) : undefined;

  let out;
  try {
    out = await extract(env, subject, body, pinned ? [pinned] : trips, pdfAttachments(parsed));
    if (pinned) out.trip_id = pinned.id;
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
        owner,
        out.trip_id,
        subject,
        JSON.stringify(owner === sender ? b : { ...b, forwarded_by: sender }),
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
    `${out.summary}\n\nThey're waiting ${where}:\n${out.bookings.map((b) => `• ${b.title}${b.start_date ? ` (${b.start_date}${b.start_time ? ` ${b.start_time}` : ""})` : ""}`).join("\n")}\n\n${owner === sender ? `Review and add them: ${appUrl}` : "The trip owner will review and add them."}`,
  );
}
