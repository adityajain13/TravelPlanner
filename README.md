# Travel Planner

My own Wanderlog. It's an offline-first trip planner, dark down to the map, with live sharing, reservations, a split budget, real routing between stops, and a Claude connector. There's no paywall and no ads.

**Live:** [adityajain.ca/travelplanner](https://adityajain.ca/travelplanner) · **Roadmap / design notes:** [PLAN.md](PLAN.md)

![Itinerary, reservations and budget for an imported Iceland trip](docs/screenshots/tabs.png)

## Features

**Plan**
- Days generated from the trip dates, plus lists like "Places to visit". Drag and drop stops within and between days.
- Place search on OpenStreetMap (Photon, with Nominatim as a fallback). Each stop takes a time, notes and a cost. An optional live **Google details** button shows photos, hours and ratings; only the place ID is stored.
- **Routing between stops:** each leg shows "🚗 21 min · 8.7 km". Tap it to switch to walk, bike or transit. The map draws the real road, path or transit line, and each day header shows that day's total travel.
- **Photos** for every place: pick from Unsplash, the place's Wikipedia article, or large landscape shots from Wikimedia Commons and Openverse (or paste a link). **Auto-fill photos** adds confident Wikipedia matches for the whole trip, and every trip gets a cover photo.
- Dark vector map with Wanderlog-style numbered pins per day, photo popups, and a **satellite** toggle. Jump between days with the date chips, and focus the map on one day with the eye icon.

**Book and budget**
- **Reservations tab:** flights, lodging, rental cars, trains and buses, restaurants. Each has confirmation numbers, times and cost, and shows as chips on its days ("Check-in", "Departs 13:10").
- **Budget tab:** a trip budget and currency, with spending by category. Costs from reservations and stops are counted automatically. Add who paid and who it's split between, and **settle up** shows the fewest transfers. Multi-currency uses ECB rates, cached for offline use.

**Offline-first**
- An installable PWA. Trips live on the device, so the app opens instantly and works with no signal.
- **Save map offline** downloads the dark map for a trip's area. Routes you've viewed are cached too.

**Share and sync**
- Sign in with an email code, and stay signed in for a year.
- Trips sync live across devices. Edits made offline merge when you reconnect.
- **Share links:** view-only or can-edit, and they work without an account. Reset them any time.

**Bring trips in**
- **Import from Wanderlog:** drop in the PDF from Wanderlog's "Print this trip". It's parsed on your device, with no AI involved. Days, stops, notes, flights, hotels, cars and the budget all come across.
- **Email import:** forward booking confirmations to `trips@adityajain.ca`. They're matched to the right trip and wait for your review.
- **Claude connector:** paste a share link into Claude, and it can read or edit the trip, with approval for each change.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/trips.png" alt="Trip list"></td>
    <td width="50%"><img src="docs/screenshots/import.png" alt="Import from Wanderlog"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/share.png" alt="Share links"></td>
    <td><img src="docs/screenshots/login.png" alt="Email-code sign in"></td>
  </tr>
</table>

## Using it

### Importing old Wanderlog trips

**In the app (no AI):** Home → **Import** → choose the PDF from Wanderlog's ⋯ → Print this trip → Save as PDF. It's parsed on your device. Days, places, notes, flights, hotels, cars and the budget come across, and places get pins automatically. Each pin is matched near the previous stop, preferring countries the trip visits.

**Or via Claude** (uses your Claude plan, not the API):

1. In Wanderlog: open the trip → ⋯ → **Print this trip** → Save as PDF.
2. In the app: create the trip with the same name and dates → Share → copy the **edit** link.
3. In a Claude chat: attach the PDF, paste the edit link, and say *"Import this Wanderlog trip"*. Claude adds everything in a few bulk calls. If some places are still unpinned, it calls `pin_missing` to finish them.

### Email import

Forward any booking confirmation (flights, hotels, trains, restaurants…) to **trips@adityajain.ca** from your allow-listed address. Claude reads it, matches it to a trip by dates and destination, and replies with a receipt.
- On the trip: the bookings wait at the top under "From your email", ready to add or dismiss. Flights, hotels, trains, cars and restaurants become reservations.
- Bookings with no matching trip appear on the home screen with a trip picker.

### Claude connector

1. In Claude: Settings → Connectors → add a custom connector with the URL `https://adityajain.ca/travelplanner/mcp`. It needs no login.
2. In that connector's tool permissions, leave `get_trip` and `search_places` always allowed. Set the edit tools to require approval, so Claude asks before every change.
3. In a chat, paste a trip's share link from the app's Share button. With a view link Claude can read the trip; with an edit link it can also change it. Changes appear live in the app.

Resetting a trip's links in the app also cuts off Claude's access to that trip.

## How it works

| Piece | What it uses |
| --- | --- |
| App | React + Vite + Tailwind v4, PWA (`vite-plugin-pwa`), served at `/travelplanner` |
| Trip data | One **Yjs** document per trip, stored offline in IndexedDB. Edits merge as CRDTs. |
| Sync | One **Cloudflare Durable Object** per trip (y-websocket protocol), with a D1 index |
| Auth | Email code / magic link from the Worker, plus a 1-year rolling session cookie |
| Sharing | Signed view/edit tokens; resetting bumps a version, which revokes every link |
| Map | MapLibre + Protomaps (dark/light vector), MapTiler satellite |
| Places | Photon → Nominatim fallback, ranked by relevance, distance and the trip's countries |
| Routing | FOSSGIS OSRM (drive/walk/bike), Transitous (transit), cached in IndexedDB |
| Email | Cloudflare Email Routing → Worker → Claude extraction → review inbox |
| Claude | Stateless MCP server at `/travelplanner/mcp`; the share link is the credential |

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

### Keys (`.env`, baked in at build time)

- `VITE_PROTOMAPS_KEY` — vector basemap: https://protomaps.com/api
- `VITE_MAPTILER_KEY` — satellite: https://cloud.maptiler.com/account/keys/
- `VITE_GOOGLE_PLACES_KEY` — optional live Google details (Places API (New))

Restrict all three to the referrers `adityajain.ca/*` and `localhost`.

## First deploy (one time, ~10 minutes)

Every push to `main` deploys through GitHub Actions (`.github/workflows/deploy.yml`). One-time setup:

1. **API token:** Cloudflare dashboard → My Profile → API Tokens → Create Token → template **"Edit Cloudflare Workers"**. Add **Account → D1 → Edit** to it. Scope it to your account and the `adityajain.ca` zone.
2. **Database:** Workers & Pages → D1 → Create → name `travelplanner`. Copy its **Database ID** into `wrangler.jsonc` and commit.
3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN`: the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID`: the hex string after `dash.cloudflare.com/` in the dashboard URL
   - `VITE_PROTOMAPS_KEY`, `VITE_MAPTILER_KEY`, and optionally `VITE_GOOGLE_PLACES_KEY`
4. **Run it:** push, or Actions → Deploy → Run workflow. The first run creates the `travelplanner` Worker and the `adityajain.ca/travelplanner*` route.
5. **Worker secrets:** Workers & Pages → travelplanner → Settings → Variables and Secrets. Add:
   - `ALLOWED_EMAILS`: your Gmail
   - `SHARE_SECRET`: any long random string
   - `ANTHROPIC_API_KEY`: only used for email import
   - `UNSPLASH_ACCESS_KEY` (optional): the Access Key of an app at https://unsplash.com/oauth/applications. Gives travel-quality photos in the picker and for covers; searches are cached for a day.
6. **Inbound email:** Email → Email Routing → Routing rules → Create address: custom address `trips`, action **Send to a Worker**, destination `travelplanner`.

Outgoing mail (login codes, import receipts) goes through Email Routing's free `send_email` binding. That binding can only deliver to **verified destination addresses**, so the address in `ALLOWED_EMAILS` must be one. No Workers Paid plan or Email Sending is needed.

## Credits

Map data © OpenStreetMap contributors · Protomaps · MapTiler. Search: Photon, Nominatim. Routing: FOSSGIS OSRM. Transit: [Transitous](https://transitous.org/sources/). Exchange rates: European Central Bank via Frankfurter. Photos: Unsplash, Wikipedia, Wikimedia Commons, Openverse.
