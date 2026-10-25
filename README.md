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

## First deploy

1. **Database:** `npx wrangler d1 create travelplanner` → paste the `database_id` into `wrangler.jsonc`, then `npm run db:migrate`.
2. **Allow-list:** set `ALLOWED_EMAILS` in `wrangler.jsonc` to the email(s) that may log in. That address must be a verified destination in Email Routing (your forwarding Gmail already is).
3. **Share-link secret:** `npx wrangler secret put SHARE_SECRET` (paste any long random string).
4. **Email sending:** in the Cloudflare dashboard, enable Email Sending for `adityajain.ca` so the Worker can send from `trips@adityajain.ca`.
5. `npx wrangler login && npm run deploy`

The Worker claims `adityajain.ca/travelplanner*`, which beats the personal site's catch-all route.

## How data flows

- Trips live on the device (IndexedDB) and work fully offline.
- When online, each trip syncs through its own Durable Object, and edits made offline merge on reconnect.
- Share links (view / edit) work without an account. "Reset links" revokes them.
- Logging in keeps you signed in for a year on that device.

Map data © OpenStreetMap contributors · Protomaps · MapTiler. Search by Photon.
