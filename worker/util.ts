import { EmailMessage } from "cloudflare:email";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  TRIP_ROOM: DurableObjectNamespace<import("./room").TripRoom>;
  EMAIL: SendEmail;
  ALLOWED_EMAILS: string;
  MAIL_FROM: string;
  SHARE_SECRET: string;
  ANTHROPIC_API_KEY: string;
  EXTRACT_MODEL?: string;
  /** Model for reading receipt photos (default claude-sonnet-5-5). */
  RECEIPT_MODEL?: string;
  UNSPLASH_ACCESS_KEY?: string;
  /** optional server-side key for Google Routes; else the app's own key is forwarded */
  GOOGLE_ROUTES_KEY?: string;
  /** RapidAPI key subscribed to NAVITIME Route (totalnavi): Japanese train routes. */
  NAVITIME_RAPIDAPI_KEY?: string;
  /** Brave Search API key: web image search in the photo picker (like Google Images). */
  BRAVE_SEARCH_KEY?: string;
}

export const BASE = "/travelplanner";
export const API = `${BASE}/api`;

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...init.headers },
  });

export const error = (status: number, message: string) => json({ error: message }, { status });

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256(s: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function hmac(secret: string, data: string): Promise<string> {
  return b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data)));
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const isValidTripId = (id: string) => /^[A-Za-z0-9_-]{6,32}$/.test(id);

/*
 * Outgoing mail via Email Routing's send_email binding (free plan). It can only deliver to
 * verified destination addresses in Email Routing, which is fine: mail only ever goes to the
 * allow-listed owner (login codes, import receipts).
 */
const b64 = (s: string) => {
  const bytes = enc.encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/.{76}/g, "$&\r\n");
};
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s).replace(/\r\n/g, "")}?=`);

export async function sendMail(env: Env, m: { to: string; subject: string; text: string; html?: string }) {
  const domain = env.MAIL_FROM.split("@")[1];
  const boundary = `tp-${randomToken(12)}`;
  const head = [
    `From: ${encodeHeader("Atlas Journeys")} <${env.MAIL_FROM}>`,
    `To: <${m.to}>`,
    `Subject: ${encodeHeader(m.subject)}`,
    `Message-ID: <${randomToken(16)}@${domain}>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ];
  const part = (type: string, body: string) =>
    [`Content-Type: ${type}; charset=utf-8`, "Content-Transfer-Encoding: base64", "", b64(body)].join("\r\n");
  const raw = m.html
    ? [...head, `Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`, part("text/plain", m.text), `--${boundary}`, part("text/html", m.html), `--${boundary}--`, ""].join("\r\n")
    : [...head, part("text/plain", m.text), ""].join("\r\n");
  await env.EMAIL.send(new EmailMessage(env.MAIL_FROM, m.to, raw));
}
