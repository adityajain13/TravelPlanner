import { API, BASE, error, json, parseCookies, randomToken, safeEqual, sendMail, sha256, type Env } from "./util";

/*
 * Passwordless login, entirely on this Worker:
 *   POST /api/auth/request {email}     → emails a 6-digit code + one-tap link (if the email is allowed)
 *   POST /api/auth/verify {email,code} → session cookie
 *   GET  /api/auth/link?e=&t=          → session cookie, redirect to the app
 *   POST /api/auth/invite {t, peek?}    → one-time invite from a trip owner: who it's for (peek), or a session cookie
 *   GET  /api/auth/me                  → {email} (also rolls the session forward)
 *   POST /api/auth/logout
 * Sessions last a year and roll forward on use, so you effectively stay logged in.
 */

const COOKIE = "tp_session";
const YEAR = 365 * 24 * 60 * 60;
const CODE_TTL = 15 * 60 * 1000;
const RESEND_AFTER = 45 * 1000;
const MAX_ATTEMPTS = 5;

const allowed = (env: Env) =>
  new Set(
    (env.ALLOWED_EMAILS ?? "").split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

/** The owner(s) from ALLOWED_EMAILS, plus anyone a trip has been shared with. */
export async function canLogin(env: Env, email: string) {
  if (allowed(env).has(email)) return true;
  return !!(await env.DB.prepare("SELECT 1 FROM trip_members WHERE email = ? LIMIT 1").bind(email).first());
}
export const isOwnerEmail = (env: Env, email: string) => allowed(env).has(email);

const normEmail = (e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : "");

function sessionCookie(token: string, url: URL, maxAge = YEAR) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=${BASE}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

export interface Session {
  email: string;
  refreshCookie?: string;
}

/** Resolve the session from the cookie. Rolls expiry forward when under 11 months remain. */
export async function getSession(req: Request, env: Env): Promise<Session | null> {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const idHash = await sha256(token);
  const row = await env.DB.prepare("SELECT email, expires_at FROM sessions WHERE id_hash = ?").bind(idHash).first<{ email: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return null;
  // Allow-list removal (or being removed from every shared trip) revokes access immediately
  if (!(await canLogin(env, row.email))) return null;
  const s: Session = { email: row.email };
  if (row.expires_at - Date.now() < 335 * 24 * 3600 * 1000) {
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id_hash = ?").bind(Date.now() + YEAR * 1000, idHash).run();
    s.refreshCookie = sessionCookie(token, new URL(req.url));
  }
  return s;
}

async function createSession(req: Request, env: Env, email: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (id_hash, email, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256(token), email, now, now + YEAR * 1000, (req.headers.get("user-agent") ?? "").slice(0, 200))
    .run();
  await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
  return sessionCookie(token, new URL(req.url));
}

export async function handleAuth(req: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname.slice(`${API}/auth`.length);

  if (path === "/request" && req.method === "POST") return requestLoginCode(req, env, url);
  if (path === "/verify" && req.method === "POST") return verifyLoginCode(req, env);
  if (path === "/link" && req.method === "GET") return loginViaLink(req, env, url);
  // Invite links open the app's sign-in page, which redeems with a POST on a button press.
  // A GET must not use the link up: chat apps fetch links to build previews.
  if (path === "/invite" && req.method === "GET") return inviteRedirect(url);
  if (path === "/invite" && req.method === "POST") return redeemInvite(req, env);
  if (path === "/me" && req.method === "GET") return currentUser(req, env);
  if (path === "/logout" && req.method === "POST") return logout(req, env, url);

  return null;
}

async function requestLoginCode(req: Request, env: Env, url: URL): Promise<Response> {
  const { email: raw } = (await req.json().catch(() => ({}))) as { email?: string };
  const email = normEmail(raw);
  if (!email.includes("@")) return error(400, "Enter a valid email");
  // Same response either way, so the endpoint doesn't reveal who's allowed
  if (!(await canLogin(env, email))) return json({ ok: true });

  const prev = await env.DB.prepare("SELECT created_at FROM login_codes WHERE email = ?").bind(email).first<{ created_at: number }>();
  if (prev && Date.now() - prev.created_at < RESEND_AFTER) return error(429, "Code just sent — check your inbox");

  const { code, linkToken } = await storeLoginCode(env, email);
  const link = `${url.origin}${API}/auth/link?e=${encodeURIComponent(email)}&t=${linkToken}`;
  try {
    await sendLoginMail(env, email, code, link);
  } catch (e) {
    console.error("send failed", e);
    // Email Routing only delivers to verified addresses; members can still use an invite link
    return error(502, allowed(env).has(email) ? "Couldn't send the email" : "Couldn't email this address. Ask the trip owner for a sign-in link.");
  }
  return json({ ok: true });
}

/** Makes a fresh 6-digit code and one-tap link token, and saves their hashes (replacing any earlier ones). */
async function storeLoginCode(env: Env, email: string): Promise<{ code: string; linkToken: string }> {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const linkToken = randomToken(24);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO login_codes (email, code_hash, link_hash, created_at, expires_at, attempts) VALUES (?, ?, ?, ?, ?, 0)",
  )
    .bind(email, await sha256(`${email}:${code}`), await sha256(linkToken), now, now + CODE_TTL)
    .run();
  return { code, linkToken };
}

async function sendLoginMail(env: Env, email: string, code: string, link: string): Promise<void> {
  await sendMail(env, {
    to: email,
    subject: `${code} is your Atlas Journeys sign-in code`,
    text: `Your login code is ${code}\n\nOr sign in on this device with one tap:\n${link}\n\nThe code expires in 15 minutes. If you didn't ask for this, ignore it.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px">
<p>Your login code:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0">${code}</p>
<p><a href="${link}" style="display:inline-block;background:#1f9d55;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Sign in on this device</a></p>
<p style="color:#6b716d;font-size:13px">Expires in 15 minutes. If you didn't ask for this, ignore it.</p></div>`,
  });
}

async function verifyLoginCode(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  const email = normEmail(body.email);
  const code = String(body.code ?? "").replace(/\D/g, "");
  const row = await env.DB.prepare("SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?")
    .bind(email)
    .first<{ code_hash: string; expires_at: number; attempts: number }>();
  if (!row || row.expires_at < Date.now() || row.attempts >= MAX_ATTEMPTS) return error(400, "Code expired — request a new one");
  if (!safeEqual(row.code_hash, await sha256(`${email}:${code}`))) {
    await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    return error(400, "Wrong code");
  }
  const cookie = await createSession(req, env, email);
  return json({ email }, { headers: { "Set-Cookie": cookie } });
}

async function loginViaLink(req: Request, env: Env, url: URL): Promise<Response> {
  const email = normEmail(url.searchParams.get("e"));
  const t = url.searchParams.get("t") ?? "";
  const row = await env.DB.prepare("SELECT link_hash, expires_at FROM login_codes WHERE email = ?").bind(email).first<{ link_hash: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now() || !safeEqual(row.link_hash, await sha256(t))) {
    return Response.redirect(`${url.origin}${BASE}/login?expired=1`, 302);
  }
  const cookie = await createSession(req, env, email);
  return new Response(null, { status: 302, headers: { Location: `${BASE}/`, "Set-Cookie": cookie } });
}

function inviteRedirect(url: URL): Response {
  return Response.redirect(`${url.origin}${BASE}/login?invite=${encodeURIComponent(url.searchParams.get("t") ?? "")}`, 302);
}

async function redeemInvite(req: Request, env: Env): Promise<Response> {
  const { t, peek } = (await req.json().catch(() => ({}))) as { t?: string; peek?: boolean };
  const h = await sha256(String(t ?? ""));
  const row = await env.DB.prepare(
    "SELECT i.email, i.trip_id, i.expires_at, t.title FROM invites i JOIN trip_members m ON m.trip_id = i.trip_id AND m.email = i.email LEFT JOIN trips t ON t.id = i.trip_id WHERE i.token_hash = ?",
  )
    .bind(h)
    .first<{ email: string; trip_id: string; expires_at: number; title: string | null }>();
  if (!row || row.expires_at < Date.now()) return error(410, "That invite link expired or was already used. Ask for a new one.");
  if (peek) return json({ email: row.email, title: row.title ?? "a trip" });
  await env.DB.prepare("DELETE FROM invites WHERE token_hash = ?").bind(h).run(); // single use
  const cookie = await createSession(req, env, row.email);
  return json({ email: row.email, tripId: row.trip_id }, { headers: { "Set-Cookie": cookie } });
}

async function currentUser(req: Request, env: Env): Promise<Response> {
  const s = await getSession(req, env);
  if (!s) return error(401, "Not logged in");
  return json({ email: s.email, owner: allowed(env).has(s.email) }, { headers: s.refreshCookie ? { "Set-Cookie": s.refreshCookie } : {} });
}

async function logout(req: Request, env: Env, url: URL): Promise<Response> {
  const token = parseCookies(req)[COOKIE];
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", url, 0) } });
}
