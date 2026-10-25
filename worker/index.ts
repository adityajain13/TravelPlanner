import { handleAuth } from "./auth";
import { handleTrips } from "./trips";
import { handleMcp } from "./mcp";
import { handleInbox } from "./inbox";
import { handleEmail } from "./email";
import { handlePhotos } from "./photos";
import { API, BASE, error, type Env } from "./util";

export { TripRoom } from "./room";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith(BASE)) return new Response("Not found", { status: 404 });
    if (url.pathname === BASE) return Response.redirect(`${url.origin}${BASE}/`, 301);

    // Claude connector (custom connector URL: https://adityajain.ca/travelplanner/mcp)
    if (url.pathname === `${BASE}/mcp`) return handleMcp(request, env);

    if (url.pathname.startsWith(`${API}/`)) {
      // Cookie-auth'd writes must come from our own pages
      if (request.method !== "GET" && request.method !== "HEAD") {
        const origin = request.headers.get("origin");
        if (origin && origin !== url.origin) return error(403, "Bad origin");
      }
      try {
        if (url.pathname.startsWith(`${API}/auth/`)) return (await handleAuth(request, env, url)) ?? error(404, "Not found");
        return (await handlePhotos(request, env, url, ctx)) ?? (await handleInbox(request, env, url)) ?? (await handleTrips(request, env, url)) ?? error(404, "Not found");
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

  // Email Routing: trips@adityajain.ca → this Worker
  async email(message, env) {
    await handleEmail(message, env);
  },
} satisfies ExportedHandler<Env>;
