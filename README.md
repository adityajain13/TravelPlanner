# Travel Planner

My own Wanderlog: offline-first, dark mode down to the map, shareable, no paywall.
Live at **adityajain.ca/travelplanner**. Roadmap in [PLAN.md](PLAN.md).

## Local development

```bash
npm install
cp .env.example .env          # map + Google keys (see below)
# .dev.vars holds Worker secrets for local dev: SHARE_SECRET, ALLOWED_EMAILS
npm run db:migrate:local
npm run build && npm run dev:api   # Worker (auth, sync) on :8787
npm run dev                        # app on http://localhost:5173/travelplanner/ (proxies /api to :8787)
```

In local dev, login emails aren't sent; `wrangler dev` prints the code in its output.

## Keys (`.env`, baked in at build time)

- `VITE_PROTOMAPS_KEY` — vector basemap: https://protomaps.com/api
- `VITE_MAPTILER_KEY` — satellite: https://cloud.maptiler.com/account/keys/
- `VITE_GOOGLE_PLACES_KEY` — optional live Google details (Places API (New))

Restrict all three to the referrers `adityajain.ca/*` and `localhost`.

## First deploy (one time, ~10 minutes)

Every push to `main` deploys through GitHub Actions (`.github/workflows/deploy.yml`). One-time setup:

1. **API token:** Cloudflare dashboard → My Profile → API Tokens → Create Token → template **"Edit Cloudflare Workers"**. Add **Account → D1 → Edit** to it. Scope it to your account and the `adityajain.ca` zone.
2. **Database:** Workers & Pages → D1 → Create → name `travelplanner`. Copy its **Database ID** into `wrangler.jsonc` (replacing the zeros) and commit.
3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN`: the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID`: from the dashboard's account home, right sidebar
   - `VITE_PROTOMAPS_KEY`, `VITE_MAPTILER_KEY`, and optionally `VITE_GOOGLE_PLACES_KEY`
4. **Run it:** push, or Actions → Deploy → Run workflow. The first run creates the `travelplanner` Worker and the `adityajain.ca/travelplanner*` route.
5. **Worker secrets:** Workers & Pages → travelplanner → Settings → Variables and Secrets. Add:
   - `ALLOWED_EMAILS`: your Gmail
   - `SHARE_SECRET`: any long random string
6. **Email sending:** Email → Email Sending → enable it for `adityajain.ca`, so login codes can be sent from `trips@adityajain.ca`. Your Gmail must be a verified destination address in Email Routing, which it already is.

Then open adityajain.ca/travelplanner and sign in.

## Email import

Forward any booking confirmation (flights, hotels, trains, restaurants…) to **trips@adityajain.ca** from your allow-listed address. Claude reads it, matches it to a trip by dates and destination, and replies with a receipt. Open the trip, and the bookings wait at the top under "From your email", ready to add or dismiss. Bookings with no matching trip appear on the home screen with a trip picker.

## Claude connector

1. In Claude: Settings → Connectors → add a custom connector with the URL `https://adityajain.ca/travelplanner/mcp`. It needs no login.
2. In that connector's tool permissions, leave `get_trip` and `search_places` always allowed. Set the edit tools to require approval, so Claude asks before every change.
3. In a chat, paste a trip's share link from the app's Share button. With a view link Claude can read the trip; with an edit link it can also change it. Changes appear live in the app.

Resetting a trip's links in the app also cuts off Claude's access to that trip.

## How data flows

- Trips live on the device (IndexedDB) and work fully offline.
- When online, each trip syncs through its own Durable Object, and edits made offline merge on reconnect.
- Share links (view / edit) work without an account. "Reset links" revokes them.
- Logging in keeps you signed in for a year on that device.

Map data © OpenStreetMap contributors · Protomaps · MapTiler. Search by Photon.
