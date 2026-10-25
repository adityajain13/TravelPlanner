# Travel Planner — build plan

Personal Wanderlog replacement. Offline-first PWA, dark mode (UI and map), share links, Claude connector, email import.
Hosted at **adityajain.ca/travelplanner** by the `travelplanner` Cloudflare Worker (this repo).

## Decisions (locked)

| Area | Choice |
| --- | --- |
| App | React + Vite + Tailwind v4 PWA (`vite-plugin-pwa`), base path `/travelplanner/` |
| Trip data | One **Yjs** doc per trip, offline via `y-indexeddb` (`trip-<id>`). Items are a flat `Y.Map` with `section` + fractional `order` (see `src/lib/trips.ts`) |
| Local-only data | **Dexie**: trip index, settings; later inbox + offline regions |
| Map | MapLibre + Protomaps vector tiles (dark/light flavours) |
| Satellite | MapTiler `satellite-v2` raster + Protomaps labels (hybrid), online only |
| Place search | **Photon** (OSM) — records stored offline. No Google Places for storage |
| Google | Optional live "Google details" button only; store `googlePlaceId` only (ToS: only place IDs may be kept) |
| Sync / sharing | Yjs over a **Durable Object per trip**; share links carry a view or edit token |
| Claude | **Remote MCP server** (custom connector in claude.ai). View link → read tools, edit link → write tools. Write tools set to "needs approval" in claude.ai; every Claude edit tagged with origin `claude` for revert. No in-app chat panel (API cost) |
| Email | Manual forward to **trips@adityajain.ca** → Email Worker → Claude (Haiku) structured extraction → review inbox → approve into trip |
| Hosting | Worker route `adityajain.ca/travelplanner*` (beats the personal site's `/*` route) |

## Phases

- [x] **1. Shell + local planner** — PWA, trip list, create/delete trip, days from date range, lists ("Places to visit" + custom), Photon search, notes, times, notes field, drag and drop within/between days, per-day map colours + numbered pins + dashed routes, focus one day on the map, dark/light toggle, map/satellite toggle, Google Maps deep link, mobile plan/map switch, lazy-loaded map, worker serving SPA under `/travelplanner`.
- [ ] **2. Google details + offline maps**
  - "Google details" button on a place: Places API (New) Text Search → save `googlePlaceId`; Place Details fetched live (hours, rating, phone, website, photos). Key restricted by HTTP referrer to adityajain.ca. Never persist the details.
  - Offline region download: per trip, "Download map for offline". Plan: Worker endpoint that range-reads the Protomaps planet build (or a hosted daily build) and returns a bbox extract, stored in OPFS; MapLibre `pmtiles://` protocol uses it when offline. Fonts/sprites already runtime-cached.
  - Until then: viewed tiles are CacheFirst-cached by the service worker.
- [ ] **3. Sync + share links**
  - `TripRoom` Durable Object (y-protocols over WebSocket, or `y-partyserver`), state persisted in DO storage.
  - `POST /travelplanner/api/trips/:id/share` → `{view, edit}` tokens (HMAC'd, stored in D1 so they can be revoked).
  - Client: `WebsocketProvider` attached to the existing doc when online; share dialog with copy buttons; opening `/trip/:id?t=<token>` joins.
  - Edit-history panel grouped by origin (me / collaborator / claude / email) with revert (Y.UndoManager per origin).
- [ ] **4. Claude MCP connector** — `/travelplanner/mcp` on the same Worker (Cloudflare `agents` McpAgent, streamable HTTP).
  - Tools: `open_trip(link)`, `get_trip`, `get_day`, `search_place` (Photon), `add_place`, `add_note`, `move_item`, `update_item`, `remove_item`.
  - Token from the pasted share link scopes access; write tools refuse with a view token.
  - Writes applied to the trip's Durable Object doc with origin `claude`.
- [ ] **5. Email import** — Cloudflare Email Routing rule `trips@adityajain.ca` → this Worker's `email()` handler.
  - `postal-mime` parse → Claude API (Haiku, structured output: flight / hotel / train / car / reservation, times + tz, confirmation #, address).
  - Match to a trip by dates/destination; store in D1 `inbox`; app shows a review inbox, approve → items.
  - Unparseable mail is forwarded on to Gmail. Needs `ANTHROPIC_API_KEY` secret.
- [ ] **6. Polish** — trip cover image, budget/expenses, packing list, ICS export, travel-time estimates between stops (OSRM), Wanderlog import if an export path exists.

## Notes for the next session

- Read `src/lib/trips.ts` first: all trip writes go through it (`edit()` with an origin).
- `npm run dev` for the app; `npm run cf:dev` runs the Worker locally against the built app.
- Keys go in `.env` (see `.env.example`). Without `VITE_PROTOMAPS_KEY` the map shows a placeholder.
- Smoke-tested in headless Chromium: create trip, add note, reload persists, drag note into another day.
