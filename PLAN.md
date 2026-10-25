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
| Login | Own email-code login on the Worker, 1-year rolling session cookie (Access caps sessions at 1 month) |
| Claude | **Remote MCP server** at `/travelplanner/mcp` (custom connector in claude.ai). View link → read tools, edit link → write tools. Write tools set to "needs approval" in claude.ai; every Claude edit tagged with origin `claude` for revert. No in-app chat panel (API cost) |
| Email | Manual forward to **trips@adityajain.ca** → Email Worker → Claude (Haiku) structured extraction → review inbox → approve into trip |
| Hosting | Worker route `adityajain.ca/travelplanner*` (beats the personal site's `/*` route) |

## Phases

- [x] **1. Shell + local planner** — PWA, trip list, create/delete trip, days from date range, lists ("Places to visit" + custom), Photon search, notes, times, notes field, drag and drop within/between days, per-day map colours + numbered pins + dashed routes, focus one day on the map, dark/light toggle, map/satellite toggle, Google Maps deep link, mobile plan/map switch, lazy-loaded map, worker serving SPA under `/travelplanner`.
- [x] **2. Google details + offline maps**
  - "Google details" pill on a selected place (`src/components/GoogleDetails.tsx`, `src/lib/google.ts`): Text Search with a 300 m bias → saves `googlePlaceId` only; details (photos, rating, price, open now, hours, phone, website) fetched live and kept in an in-memory cache. Hidden when `VITE_GOOGLE_PLACES_KEY` is unset; disabled offline.
  - "Save map offline" in the trip header (`src/lib/offlineMap.ts`): pre-downloads the vector tiles for the trip's padded bbox into the service worker's `basemap-tiles` cache, picking the deepest zoom (≤15) under 6,000 tiles, plus label fonts and sprites. Region recorded in Dexie `regions`; button switches to "Update offline map" when new places fall outside it. Satellite stays online-only.
  - Possible upgrade: per-region `.pmtiles` extract in OPFS (smaller, faster, larger areas) if tile prefetch proves limiting.
- [x] **3. Login + sync + share links**
  - Login (`worker/auth.ts`, `src/pages/Login.tsx`): email → 6-digit code + one-tap link sent via Email Routing's `send_email` binding (raw MIME `EmailMessage`, free plan, verified destinations only; the Email Service structured API needs Workers Paid); allow-list in `ALLOWED_EMAILS`. Session cookie `tp_session` (HttpOnly, Path=/travelplanner) lasts 1 year and rolls forward on use; only its SHA-256 is stored in D1. Cloudflare Access was ruled out: its sessions max out at 1 month.
  - Sync (`worker/room.ts`, `src/lib/sync.ts`): `TripRoom` Durable Object per trip (SQLite-backed, hibernation API) speaking the y-websocket protocol; doc persisted on every update; meta mirrored into D1 `trips` via a 5 s alarm. Client attaches `WebsocketProvider` to the offline doc; sync badge in the header.
  - Ownership: logged-in user claims a trip ID on first sync. Home reconciles with `GET /api/trips` (lists trips from other devices, pushes trips created offline).
  - Share links (`worker/trips.ts`, `ShareDialog`): stateless HMAC tokens `b64(trip.role.version).sig` using `SHARE_SECRET`; "Reset links" bumps `share_version`. `/s/:token` registers the trip on the friend's device (no login). View links: server drops writes, client blocks edits and hides editing UI.
  - Delete removes the trip on the server too (owner only); shared trips are just removed from the device.
  - Tested locally with `wrangler dev` + headless Chromium: login by code, 365-day cookie, live owner↔editor sync, viewer read-only, unauthenticated socket gets nothing, link reset → 404, second device pulls the trip.
  - Not built yet: edit-history panel / per-origin undo (moved to phase 6).
- [x] **4. Claude MCP connector** — `https://adityajain.ca/travelplanner/mcp` (`worker/mcp.ts`, `worker/tripOps.ts`)
  - Hand-rolled stateless MCP over Streamable HTTP (JSON responses), no SDK dependency. Server `instructions` explain the share-link model.
  - Tools: `get_trip`, `search_places` (Photon, biased to trip centre), `add_place`, `add_note`, `update_item`, `move_item`, `remove_item`, `update_trip`. Read tools carry `readOnlyHint`; writes don't (remove_item is `destructiveHint`), so claude.ai can require approval per call.
  - Auth: every tool takes `trip_link`; the HMAC share token is the credential. View link → reads only; edit link → writes. Resetting links in the app revokes Claude's access too.
  - Writes run inside the trip's Durable Object (`TripRoom.mutate`, origin `"claude"`) and reach open app clients live. Errors are phrased for the model (bad section lists valid ones, view link asks for the edit link).
  - `add_items` bulk tool (≤300 items, one approval): server-side Photon geocoding for items without coordinates, atomic section validation. Used for Wanderlog imports via a Claude chat (PDF attached + edit link), so imports cost no API tokens.
  - Tested locally: initialize, tools/list, add/move/update, view-link write refused, invalid link refused, live delivery to an open client, get_trip rendering.
- [x] **5. Email import** — `worker/email.ts`, `worker/inbox.ts`, `src/components/InboxPanel.tsx`, `UnmatchedInbox.tsx`
  - Email Routing rule `trips@adityajain.ca` → Worker `email()` handler. Rejects senders not in `ALLOWED_EMAILS`.
  - `postal-mime` parse (HTML → text fallback) → Claude API (`EXTRACT_MODEL`, default `claude-haiku-5-5`) with a forced `record_bookings` tool for structured output: per-leg bookings (type, title, confirmation, local dates/times, venue, from/to, notes) plus the matching trip id from the owner's trip list (validated server-side).
  - Results stored in D1 `inbox` (migration 0002). A receipt email goes back ("Got it: 2 bookings…", "No booking found", or an error).
  - App: matched bookings show at the top of the trip ("From your email") with "Add to <day>" (or the first list when outside the trip dates) and Dismiss. Hotels, restaurants and activities get geocoded with Photon so they get a pin. Unmatched bookings show on Home with a trip picker.
  - Tested locally: allowed sender processed, stranger rejected, inbox add/dismiss/assign flows in the browser. Claude extraction itself is untested here (no API access from the sandbox).
- [x] **5b. Reservations + Budget (Wanderlog parity)** — `src/components/Reservations.tsx`, `Budget.tsx`, `src/lib/budget.ts`, `src/lib/fx.ts`
  - Trip doc gains `reservations` and `expenses` maps (flat records, CRDT-friendly) plus `meta.currency/budget/travelers`.
  - Tabs: Itinerary / Reservations / Budget. Reservation types: flight, lodging, car, train/bus, restaurant, other, with per-type fields, cost, confirmation, notes; lodging/restaurant geocoded to H/R pins. Day chips (departs/arrives, check-in/staying/check-out, pick-up/drop-off).
  - Budget: trip currency + budget bar, category breakdown, travelers, paid-by / split-between, greedy settle-up. Reservation costs count automatically. FX: Frankfurter (ECB) `api.frankfurter.dev/v1/latest?base=`, cached daily in Dexie for offline.
  - Email inbox creates reservations for flights/hotels/trains/cars/restaurants. Connector: `get_trip` shows reservations + expenses; bulk `add_reservations` and `add_expenses` tools.
- [x] **5c. Wanderlog import (no AI)** — Home → Import. `src/lib/wanderlog/{parse,extract,importTrip}.ts`, `WanderlogImport.tsx`
  - pdf.js (lazy-loaded) reads the "Print this trip" PDF in the browser; parser keys off positions/font sizes (h27 title, h18 section/day headings, numbered stops x≈217 + names x≈236, h9 travel rows, x≈222 reservation echoes). Drops Wanderlog descriptions/hints/travel times; keeps your notes; handles names split across page breaks; repairs \0 ligatures (ff, or ft for craft/gift…); infers the year from weekdays.
  - Flights (+1 arrivals), lodging, cars → reservations with confirmation + cost; budget expenses de-duplicated against reservation costs; expenses named like a stop become that stop's cost. Verified on a real Iceland export: 7 days, 83 places, 7 bookings, budget total matches Wanderlog to the cent.
  - Pinning: destination → country; each stop geocoded near the previous one (≤450 km), in-country only; generic names (parking lot, rest stop…) left unpinned on purpose; unpinned list shown on the trip after import.
- [x] **Geocoding hardening** — `src/lib/geocode.ts` + `worker/geocode.ts`: Photon → Nominatim fallback (throttled ~1/s), trip-country filter (`meta.countryCode`, derived from the destination or reverse-geocoded from the centre), distance cap. Connector: per-call lookup budget (free-plan subrequest limit) with `pin_missing` to continue; `search_places` flags results outside the trip country.
- [x] **Routing + travel modes** — `src/lib/routing.ts`, `LegChip.tsx`
  - Each leg between consecutive pinned stops of a day gets a chip ("🚗 21 min · 8.7 km") and a mode: drive / walk / bike (FOSSGIS OSRM, routing.openstreetmap.de, ≤1 req/s) or transit (Transitous / MOTIS v6 `/api/v6/plan`, polyline-decoded legs, steps + transfers). Trip default `meta.travelMode`; per-leg override `item.travelMode`.
  - Map draws real geometry: solid = road/transit, dotted = walking, dashed = not yet routed or >800 km "flight" hop (not routed). Day header shows total ground travel.
  - Leg results cached in Dexie `routes` (60 days; transit 3 days, keyed by departure hour) → routes draw offline. Transit departure = previous stop's end/start time or 09:00 with a longitude-based UTC offset (approximate).
- [x] **Geocoding ranking instead of hard limits** — candidates scored by relevance, distance from the previous stop (log scale) and whether they're in a country the trip already visits (learned as pins land). Only "unknown country AND >3,000 km" is rejected, so multi-country trips and YYZ → KEF work.
- [x] Fix: search dropdowns / leg menus were clipped by `content-visibility` on sections (`:has()` opt-out).
- [x] **Wanderlog-style UI + photos** — `ImagePicker.tsx`, `src/lib/images.ts`
  - Trip panel scrolls as one page: cover-photo hero (title + dates over it, Cover button), sticky tabs with day jump chips, reservations quick-add card, auto-fill photos + "Getting around" row.
  - Place cards: teardrop numbered marker in the day colour, name / category·address / notes preview / time + cost chips, photo thumbnail on the right; leg rows get a Google Maps "Directions" link.
  - Map: SDF teardrop pins tinted per day (selected pin larger), photo popup for the selected stop.
  - Photos: picker searches Wikipedia (geosearch near the pin + title match), Wikimedia Commons and Openverse, or takes a pasted URL; stores `{url, thumb, credit, link, source}` on the item (`item.image`) / trip (`meta.cover`). Auto-fill uses confident Wikipedia matches only (≥0.75 name similarity) and skips generic stops; country/region lead images that are flags, maps or coats of arms are filtered. Photos cached by the service worker (`place-photos`).
- [ ] **6. Polish** — edit history with per-origin undo, trip cover image, budget/expenses, packing list, ICS export, travel-time estimates between stops (OSRM), Wanderlog import if an export path exists.

## Notes for the next session

- Read `src/lib/trips.ts` first: all trip writes go through it (`edit()` with an origin).
- `npm run dev` for the app; `npm run cf:dev` runs the Worker locally against the built app.
- Keys go in `.env` (see `.env.example`). Without `VITE_PROTOMAPS_KEY` the map shows a placeholder.
- Not yet verified against real keys: map tiles, satellite, Google details, offline save (sandbox can't reach those hosts). Check these first.
- Smoke-tested in headless Chromium: create trip, add note, reload persists, drag note into another day.

- Photos fix: covers come from Commons landscape photos (no more "Iceland (supermarket)"); auto-fill only takes exact-title or nearby Wikipedia matches; cards use the API-returned standard-width thumbnails with a fallback chain (Photo.tsx); broken picker tiles are hidden; ImagePicker is portalled to <body> as a centered modal; Cover button sits above the title overlay.
- Contents column (Wanderlog-style): Overview (lists, booking types with counts), Itinerary (days with stop names), Budget total; scroll-spy highlight, collapsible to a rail (remembered), drawer below lg. Plan column widened (540/620/680px).
- Photo.tsx snaps old non-standard Wikimedia widths (e.g. 320) to standard ones and falls back to the original file; old namesake Wikipedia covers ("X (supermarket)") get replaced automatically.
- Picker quality: Unsplash via Worker proxy (/api/photos, secret UNSPLASH_ACCESS_KEY, edge-cached 1 day, download tracking on pick); Wikipedia only for the place's own article; Commons/Openverse limited to >=1400px landscape photos and non-chart titles. Pointer cursor restored on buttons (Tailwind v4 default).
- Unsplash attribution: linked "Photo by <name> on Unsplash" under every picker tile, on the cover, in the expanded card and in map popups (PhotoCredit.tsx).
- Insert between stops: hover "+" in the gap/leg row opens an inline search; addItem takes an index.
- lib/scroll.ts: rAF scroller that re-targets each frame (content-visibility sections resize mid-scroll and cancel native smooth scroll, esp. upward). Used by contents, day chips, map selection.
- Google Maps links in "Add a place": Worker /api/maps-link expands short links (Google hosts only, Location headers only); lib/gmaps.ts reads name + !3d/!4d pin, then matches OSM within 1 km (falls back to a bare pin). Shared share-token helper lib/shareToken.ts.
- Typography: Source Sans 3 everywhere (Wanderlog-style), bold headings; replaced Fraunces/Manrope. Bigger card titles (17px bold), notes 15px, day headings 21px, sidebar 15/18px.
