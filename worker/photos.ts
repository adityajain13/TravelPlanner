/*
 * Unsplash proxy for the photo picker and trip covers. The access key stays a Worker secret
 * (UNSPLASH_ACCESS_KEY); searches are edge-cached for a day so the 50/hour demo quota goes a long way.
 * Unsplash API guidelines: hotlink images.unsplash.com, credit the photographer + Unsplash,
 * and hit the photo's download_location when a user picks it (POST /photos/track).
 */
import { getSession } from "./auth";
import { verifyShareToken } from "./trips";
import { API, error, json, type Env } from "./util";

const UTM = "utm_source=travelplanner&utm_medium=referral";

interface UPhoto {
  id: string;
  width: number;
  height: number;
  alt_description?: string | null;
  description?: string | null;
  urls: { raw: string; regular: string; small: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}

async function allowed(req: Request, env: Env, url: URL) {
  if (await getSession(req, env)) return true;
  const share = url.searchParams.get("share") ?? req.headers.get("x-share-token");
  return !!(share && (await verifyShareToken(env, share)));
}

export async function handlePhotos(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response | null> {
  if (!url.pathname.startsWith(`${API}/photos`)) return null;
  if (url.pathname === `${API}/photos/web`) return webImages(req, env, url);
  if (!env.UNSPLASH_ACCESS_KEY) return error(501, "Unsplash not configured");
  if (!(await allowed(req, env, url))) return error(401, "Sign in");
  const headers = { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" };

  if (url.pathname === `${API}/photos/track` && req.method === "POST") {
    const { download } = (await req.json().catch(() => ({}))) as { download?: string };
    if (!download || new URL(download).hostname !== "api.unsplash.com") return error(400, "Bad download link");
    ctx.waitUntil(fetch(download, { headers }).catch(() => undefined));
    return json({ ok: true });
  }

  if (url.pathname === `${API}/photos` && req.method === "GET") {
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    if (!q) return error(400, "Missing q");
    const upstream = new URL("https://api.unsplash.com/search/photos");
    upstream.search = new URLSearchParams({ query: q, per_page: "24", orientation: "landscape", content_filter: "high" }).toString();
    // Cache by query only (not by the caller's credentials)
    const cacheKey = new Request(`https://cache.travelplanner/unsplash?q=${encodeURIComponent(q.toLowerCase())}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    const res = await fetch(upstream, { headers });
    if (!res.ok) return error(res.status === 403 ? 429 : 502, `Unsplash ${res.status}`);
    const data = (await res.json()) as { results?: UPhoto[] };
    const photos = (data.results ?? []).map((p) => ({
      url: `${p.urls.raw}&w=1600&q=80&auto=format&fit=max`,
      thumb: `${p.urls.raw}&w=600&h=450&q=70&auto=format&fit=crop`,
      source: "unsplash",
      credit: `Photo: ${p.user.name} on Unsplash`,
      link: `${p.links.html}?${UTM}`,
      author: `${p.user.links.html}?${UTM}`,
      authorName: p.user.name,
      title: p.alt_description ?? p.description ?? undefined,
      track: p.links.download_location,
    }));
    const out = json({ photos }, { headers: { "cache-control": "public, max-age=86400" } });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  }
  return error(404, "Not found");
}

/*
 * Web image search (Brave Search API), the closest thing to Google Images that's still open to
 * new developers (Google's Custom Search API is closed to new sign-ups). Results cached a week.
 */
async function webImages(req: Request, env: Env, url: URL): Promise<Response> {
  if (!env.BRAVE_SEARCH_KEY) return error(501, "Web image search isn't set up (BRAVE_SEARCH_KEY)");
  if (!(await allowed(req, env, url))) return error(401, "Sign in");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (!q) return error(400, "Missing q");
  const cacheKey = new Request(`https://cache.travelplanner/web-images?q=${encodeURIComponent(q.toLowerCase())}`);
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;
  const up = new URL("https://api.search.brave.com/res/v1/images/search");
  up.search = new URLSearchParams({ q, count: "20", safesearch: "strict", spellcheck: "0" }).toString();
  const res = await fetch(up, { headers: { Accept: "application/json", "X-Subscription-Token": env.BRAVE_SEARCH_KEY } });
  if (!res.ok) return error(res.status === 429 ? 429 : 502, `Brave ${res.status}`);
  type R = { title?: string; url?: string; source?: string; thumbnail?: { src?: string }; properties?: { url?: string; width?: number; height?: number }; meta_url?: { hostname?: string } };
  const data = (await res.json()) as { results?: R[] };
  const photos = (data.results ?? [])
    .filter((r) => r.properties?.url && r.thumbnail?.src)
    .map((r) => ({
      url: r.properties!.url!,
      thumb: r.thumbnail!.src!,
      source: "web",
      credit: r.meta_url?.hostname ?? r.source ?? "Web",
      link: r.url,
      title: r.title,
    }));
  const out = json({ photos }, { headers: { "Cache-Control": "public, max-age=604800" } });
  await caches.default.put(cacheKey, out.clone()).catch(() => undefined);
  return out;
}
