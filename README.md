<p><img src="public/icon.svg" width="64" alt=""></p>

# Atlas Journeys

My own Wanderlog, and a sibling of my [Atlas New Tab](https://addons.mozilla.org/en-CA/firefox/addon/atlas-new-tab/) extension. It's an offline-first trip planner, dark down to the map, with live sharing, reservations, a split budget, real routing between stops, and a Claude connector. There's no paywall and no ads.

**Live:** [adityajain.ca/travelplanner](https://adityajain.ca/travelplanner) · **Roadmap / design notes:** [PLAN.md](PLAN.md)

![Itinerary, reservations and budget for an imported Iceland trip](docs/screenshots/tabs.png)

## Features

**Plan**
- Days generated from the trip dates, plus sections like "Places to visit", Notes or Restaurants. Drag and drop stops within and between days.
- **Notes and checklists** anywhere: the **+** between stops adds a place, note or checklist; buttons sit beside every "Add a place" box.
- Place search on OpenStreetMap (Photon nearby and worldwide, ranked by name match; Nominatim fallback), plus Google suggestions for places OSM doesn't know (Google's name, address, type and first photo are saved). Each stop takes a time, notes and a cost. **Google details** (rating, hours, phone, website) are saved on the stop and refreshed weekly, so they show offline too.
- **Routing between stops:** each leg shows "🚗 21 min · 8.7 km". Tap it to switch to walk, bike or transit. The map draws the real road, path or transit line, and each day header shows that day's total travel.
- **Photos** for every place: pick from Unsplash, the place's Wikipedia article, or large landscape shots from Wikimedia Commons and Openverse (or paste a link). **Auto-fill photos** adds confident Wikipedia matches for the whole trip, and every trip gets a cover photo.
- **Place panel over the map** when you open a stop: Wikipedia summary, photo, address, time, cost, notes, live Google details, links, and "6 of 12" stepping. Shrink it to a compact card; your choice sticks between stops.
- **Move or select:** each card's "Added to ▾" menu moves it to another day or list. Tick the checkbox (shift-click for a range) to copy, move or delete many at once.
- Dark vector map with Wanderlog-style numbered pins per day, photo popups, and a **satellite** toggle. Jump between days with the date chips, and focus the map on one day with the eye icon.

**Book and budget**
- **Reservations tab:** flights, lodging, rental cars, trains and buses, restaurants. Each has confirmation numbers, times and cost, and shows as chips on its days ("Check-in", "Departs 13:10").
- **Budget tab:** a trip budget and currency, with spending by category. Costs from reservations and stops are counted automatically. Twelve categories (with icons), who paid, and who it's split between (add people on the spot); costs on stops and bookings can be re-categorised and split too. **Settle up** shows the fewest transfers. Multi-currency uses ECB rates, cached for offline use.

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

## Tech stack

[![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Yjs](https://img.shields.io/badge/Yjs-CRDT-5fd68b)](https://yjs.dev)
[![MapLibre](https://img.shields.io/badge/MapLibre_GL-6-396cb2?logo=maplibre&logoColor=white)](https://maplibre.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers_·_D1_·_Durable_Objects-f38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Claude](https://img.shields.io/badge/Claude-MCP_·_API-d97757?logo=anthropic&logoColor=white)](https://claude.com)

**Front end** (installable, offline-first PWA)
- **React 19** + **TypeScript**, built with **Vite 8**; routing with **React Router 7**
- **Tailwind CSS 4** with theme tokens (dark by default), **Source Sans 3**, **Lucide** icons
- **vite-plugin-pwa / Workbox**: precached app shell, runtime caches for map tiles and photos
- **Yjs** (one CRDT document per trip) + **y-indexeddb** for offline storage, **y-websocket** for live sync
- **Dexie** (IndexedDB) for device-only data: trip index, offline map regions, route cache, exchange rates
- **MapLibre GL** with **Protomaps** vector basemaps (dark/light) and **MapTiler** satellite
- **dnd-kit** (drag and drop), **react-day-picker** (date pickers), **fractional-indexing** (stable ordering), **pdf.js** (Wanderlog PDF import)

**Back end** (one Cloudflare Worker at `adityajain.ca/travelplanner*`)
- **Workers** serving the app and the API; **D1** (SQLite) for sessions, trips index and the email inbox
- **Durable Objects** (SQLite-backed, hibernating WebSockets): one sync room per trip
- **Email Routing**: inbound `trips@` (plus `trips+<trip>@`) mail handled by the Worker; login codes sent with `send_email`
- **postal-mime** for parsing forwarded emails; **Claude API** (Haiku) extracts bookings, prices and attached PDFs
- **MCP server** (`/travelplanner/mcp`) so Claude can read and edit trips through a share link
- **GitHub Actions** → `wrangler deploy` (with D1 migrations) on every push to `main`

**Data and services**

| Need | Service |
| --- | --- |
| Place search | Photon / Nominatim (OpenStreetMap), Google Places (New) autocomplete and details |
| Routing | FOSSGIS OSRM (drive, walk, bike); Transitous, then Google Routes (transit) |
| Photos | Unsplash, Wikipedia, Wikimedia Commons, Openverse, Google Places photos |
| Exchange rates | Frankfurter (European Central Bank) |

## How it works

| Piece | What it uses |
| --- | --- |
| App | React + Vite + Tailwind v4, PWA (`vite-plugin-pwa`), served at `/travelplanner` |
| Trip data | One **Yjs** document per trip, stored offline in IndexedDB. Edits merge as CRDTs, with undo/redo for your own changes. |
| Sync | One **Cloudflare Durable Object** per trip (y-websocket protocol), with a D1 index |
| Auth | Email code / magic link from the Worker, plus a 1-year rolling session cookie |
| Sharing | Signed view/edit tokens; resetting bumps a version, which revokes every link |
| Map | MapLibre + Protomaps (dark/light vector), MapTiler satellite |
| Places | Photon + Nominatim ranked by name match and distance, plus Google suggestions |
| Routing | FOSSGIS OSRM (drive/walk/bike), Transitous then Google (transit), cached in IndexedDB |
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
