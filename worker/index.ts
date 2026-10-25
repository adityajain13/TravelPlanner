import { handleAuth } from "./auth";
import { handleTrips } from "./trips";
import { API, BASE, error, type Env } from "./util";

export { TripRoom } from "./room";

// Later phases add /travelplanner/mcp (Claude connector) and an email() handler for trips@.

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith(BASE)) return new Response("Not found", { status: 404 });
    if (url.pathname === BASE) return Response.redirect(`${url.origin}${BASE}/`, 301);

    if (url.pathname.startsWith(`${API}/`)) {
      // Cookie-auth'd writes must come from our own pages
      if (request.method !== "GET" && request.method !== "HEAD") {
        const origin = request.headers.get("origin");
        if (origin && origin !== url.origin) return error(403, "Bad origin");
      }
      try {
        if (url.pathname.startsWith(`${API}/auth/`)) return (await handleAuth(request, env, url)) ?? error(404, "Not found");
        return (await handleTrips(request, env, url)) ?? error(404, "Not found");
      } catch (e) {
        console.error(e);
        return error(500, "Server error");
      }
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
