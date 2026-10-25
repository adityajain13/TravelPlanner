/*
 * Expand a Google Maps short link (maps.app.goo.gl/…) to its full URL so the app can read the
 * place name and coordinates out of it. Browsers can't follow cross-origin redirects, so the
 * Worker does it: manual redirects only, Google hosts only, nothing fetched beyond the Location headers.
 */
import { getSession } from "./auth";
import { verifyShareToken } from "./trips";
import { API, error, json, type Env } from "./util";

const SHORT = /^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/;
const GOOGLE = /(^|\.)google\.[a-z.]+$/;

export async function handleMapsLink(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== `${API}/maps-link`) return null;
  const share = url.searchParams.get("share");
  if (!(await getSession(req, env)) && !(share && (await verifyShareToken(env, share)))) return error(401, "Sign in");
  let target: URL;
  try {
    target = new URL(url.searchParams.get("u") ?? "");
  } catch {
    return error(400, "Not a link");
  }
  for (let hop = 0; hop < 5; hop++) {
    if (GOOGLE.test(target.hostname) && !SHORT.test(target.hostname)) return json({ url: target.toString() });
    if (!SHORT.test(target.hostname) || target.protocol !== "https:") return error(400, "Not a Google Maps link");
    const res = await fetch(target.toString(), { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (travelplanner link expander)" } });
    const loc = res.headers.get("location");
    if (!loc) return error(422, "Link didn't redirect");
    target = new URL(loc, target);
  }
  return error(422, "Too many redirects");
}
