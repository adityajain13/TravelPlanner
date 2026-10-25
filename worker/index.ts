// Phase 1: serves the PWA under /travelplanner with SPA fallback.
// Later phases add to this same Worker: /travelplanner/api/sync (Durable Object per trip),
// /travelplanner/mcp (Claude connector), and an email() handler for trips@adityajain.ca.

export interface Env {
  ASSETS: Fetcher;
}

const BASE = "/travelplanner";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith(BASE)) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === BASE) {
      return Response.redirect(`${url.origin}${BASE}/`, 301);
    }

    const res = await env.ASSETS.fetch(request);

    // Client-side routes (e.g. /travelplanner/trip/abc) fall back to the app shell.
    const wantsHtml = request.headers.get("accept")?.includes("text/html");
    if (res.status === 404 && request.method === "GET" && wantsHtml) {
      return env.ASSETS.fetch(new Request(new URL(`${BASE}/`, url), request));
    }
    return res;
  },
} satisfies ExportedHandler<Env>;
