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
- Hero: round icon pills (HeroPill.tsx) whose labels slide out on hover/focus; cover credit sits under the Change cover pill.
- Link-added places: when the name has no OSM match, Photon reverse at the pin supplies category/address (never raw coords); Google place ID auto-linked for link adds. Friendly OSM categories (prettyCategory).
- HeroPill expand: 500ms ease-out-quint.
- Place panel over the map (PlacePanel.tsx): full/compact, persisted (tp-place-panel), prev/next within the day, Wikipedia summary live (placeSummary), map pads the pin around it. SectionPicker "Added to ▾" on cards + panel. Multi-select checkboxes (pin swaps on hover, shift-range) with Copy to / Move to / Delete bar; trips.ts moveItems/copyItems/removeItems.
- HeroPill: grid 0fr→1fr width animation (700ms, visible whole time). keep_vars in wrangler.jsonc so dashboard text vars survive deploys. Picker shows why Unsplash is missing (501/401/429).
- Map framing: coreBounds() = nearest 75% of pins to the median (+ those within 1.5x), used for the initial camera, on map load, and re-frames; YYZ-style outliers no longer dominate.
- Reservations tab redesign (Wanderlog spacing): big collapsible sections, two-column cards (details | confirmation # + cost), "+ Add another X" → place search / Enter details / Forward email. ForwardDialog: copy trips@ address + Imported emails list (GET /api/inbox?all=1).
- Undo/redo (lib/undo.ts): Y.UndoManager over all trip maps, tracks only ME-origin edits (never collaborators/Claude/email), 500ms grouping, Cmd/Ctrl+Z, Shift+Z / Ctrl+Y outside text fields; buttons atop the contents sidebar/drawer. Contents sidebar roomier (17px rows, 20px groups, 250/280px wide).
- Branding: "Atlas Journeys", logo = Atlas New Tab globe recoloured green (Logo.tsx, public/icon.svg), new icon.svg + PNG/maskable/apple icons, manifest/title/emails/MCP renamed. URL stays /travelplanner.
- Save map offline button moved into the tab row (icon-only on phones).
- Drag: overlay renders the full card (ItemCardDragPreview, no sortable hooks); grip handle 28x48 hit area with hover bg.
- Date pickers: react-day-picker@9 (headless) themed in DatePicker.tsx: DateRangeField (trip hero + new trip, 2 months on wide screens) and DateField (reservations, expenses); ISO strings in/out, popover portalled to body.
- Place panel full mode docks at the bottom of the map; address inline with category; Google details button leads the links row; details flow beside the photo.
- Big batch (Oct 25 eve): search reranking + Google autocomplete resolved to OSM (place ID only); checklist item kind + note/checklist buttons + "+" insert menu; Add section presets at top; TimeField (type or 15-min list); auto first photo on add (firstPhoto); transit retries same weekday when trip date outside timetables (≈ label); 12 expense categories + Wanderlog-style expense editor with people/split + category/split overrides on stop & booking costs (CostSplit); imported emails filtered to this trip + unmatched; segmented travel modes (Drive/Transit/Walk/Bike); tighter tabs; capitalised categories; highlighted time/cost chips.
- Per-trip email address trips+<tripid lowercase>@ (worker pins the trip from the subaddress; needs Email Routing subaddressing on). Cost details: amount/currency editable for stop & booking costs, styled Paid by menu, Split modes Individuals/Everyone/Don't split, opened from a stop via "Category & split". Number spinners hidden. Photo credit inline with Google details.
- TimeRangeField (start+end in one popover); time/cost chips on collapsed cards open the time popover / cost details. Section subheadings (meta.subtitles, shown in sidebar). Transit fallback chain: trip date → same weekday next week → leave now → Google Routes transit (live, not cached; needs Routes API on key).
- Policy change (owner, Oct 25): Google data is saved. Google picks store Google name/address/pin/type (osmId g:<placeId>); links resolve via Google when a key is set; Item.google = details snapshot (refreshed weekly, shown offline); first Google photo used as the card photo for Google picks (SW caches places media); Google transit routes cached like others.
- CurrencySelect: symbol + code button, searchable short list (max-h-60) with symbols and names; replaces all native currency selects.
- Stale-chunk recovery: vite:preloadError + route errorElement (RouteError) reload once after a deploy; friendly error screen otherwise.
- Budget: lines sorted chronologically by itinerary (date, then time with untimed stops borrowing neighbours' times, untimed bookings last); Spending breakdown chart (Category / Day by day, single-hue horizontal bars with value + share labels and hover detail); CSV export; imported emails = this trip + unmatched only.
- Unmatched emails: home-screen button + sheet (send to a trip, suggested by date, or delete); trip email list shows this trip only. Email import extracts cost/currency incl. from up to 3 attached PDFs (Claude document blocks). Hotel legs: from the morning hotel to the first stop and from the last stop to tonight's hotel (meta.hotelLegModes for the evening mode). Transit: rough distance estimate as the final fallback; Google error reason in tooltip.
- Reservations: traveler field (form + email extraction), sortReservations = date/time → booking → traveler A–Z; day chips sorted and merged per booking ("· 2 people").
- Delete imported email: Imported emails grouped per email (subject+time) with a delete button; DELETE /api/inbox/:id; removeFromEmail removes reservations/stops tagged inboxId (new adds are tagged) or, for older ones, same title+date.
- Hotels/restaurants without a pin are located in the background on trip open (Google first, then Photon by name+address, then address), so hotel legs and pins appear.
- Booking address is a place search (AddressSearch: OSM + Google) that pins the reservation; Pinned / No pin badge.
- Google transit goes through the Worker (/api/routes/transit, forwards the app key with the site Referer; optional GOOGLE_ROUTES_KEY secret) since browser CORS to routes.googleapis.com is unreliable; tried right after Transitous fails; failure reason shown inline on rough-estimate legs.
- Day chips: one per line, ordered by each event's own time (arrivals by arrival time); check-outs/staying first, check-ins last.
- ChipScroller: day chip row scrolls with the mouse wheel, drag, and arrow buttons; edge fades.
- Hide itinerary: PanelLeft toggle at the map's top-left (desktop) hides contents + plan for a full-width map; remembered (tp-plan-hidden); map resizes via ResizeObserver.
- Oct 25: day chips frame the map on that day's pins (75% rule); chip-row arrows centred on the chips.
- Oct 25: AMOLED black theme (toggle cycles dark → black → light; black map background too).
- Oct 25: spending bars coloured by category icon colour / day pin colour.
- Oct 25: day-by-day spending bars stacked by category (Other takes the day colour) + legend.
- Oct 25: People tab in spending breakdown (each person's share stacked by category, paid amount alongside).
- Oct 25: per-trip 'who else can forward' list (D1 trip_senders); guests must use trips+<id>@, bookings land in the owner's inbox tagged forwarded_by.
- Oct 25: accounts for friends: trip_members (edit/view) + one-time invite sign-in links; anyone with a login can own trips; shared trips list in Home ('Shared by'), leave instead of delete; editors see/forward bookings.
- Oct 25: invite links open the sign-in page and redeem on a Continue press (POST), so chat link previews can't use them up.
- Oct 26: drop plain trips@ mention; one fare on first leg only; People tab shows owes/is owed; in-app confirm dialog on Home (leave/remove/delete); distinct + editable day colours (dot = picker, meta.dayColors); airports from flight bookings as plane pins with flight arcs (OpenFlights data, lazy chunk).
- Oct 26: no native dialogs: askConfirm()/ConfirmHost replaces every confirm(); shared Menu replaces <select>; themed react-colorful custom day colour picker.
- Oct 26: legs to/from airports on flight days (hotel/stops → departure airport, arrival airport → first stop or hotel); map no longer moves when the place panel is resized; traveler chips replace datalist.
- Oct 26: collapsing the contents column moves logo + undo/redo into a bar atop the itinerary (with a show-contents button); time ranges no longer auto-fill an end (end-only allowed).
- Oct 26: booking chips slot between stops by time (stop time = start, else end); flight connections ignored for legs; leg to the departure airport shown before its flight chip (mode stored as hotelLegModes['<day>|dep']).
- Oct 26: custom pin art (src/lib/pinArt.ts): glossy teardrop, white rim, shadow, white badge with number or a booking symbol (bed/plane/car/train/utensils/ticket); drawn at 3x.
- Oct 26: photo picker shows the place's Google Maps photos first (googlePhotos in images.ts); pasted links preview and need 'Use image', with an error if it isn't an image.
- Oct 26: a stop's new photo is applied to every stop at the same place (samePlace: Google/OSM id or same name within 150 m); new duplicates reuse it.
- Oct 26: flights ordered by real instants using each airport's IANA time zone (airports.json now carries tz); day chips, reservation list and airport legs use it.
- Oct 26: trains/buses/cars: from/to geocoded in the background with their IANA zone (@photostructure/tz-lookup, lazy chunk), saved as fromAt/toAt; sorting uses travelInstant for all of them.
- Oct 26: day menu on stop cards and the place panel is multi-select: tick days/lists to put the place on them (copies), untick to remove (keeps at least one); samePlace also matches unpinned copies by name+address.
- Oct 26: load speed: cached Intl formatters (src/lib/intl.ts), place-copy groups memoised, airports fetched as .json after first paint, Trip + map chunks fetched in parallel, calendar lazy-loaded, map keys split from basemap style. ~35% faster to first stop at 4x CPU throttle.
- Oct 26: Japan: Google returns no transit (licensing), so skip it there; rough transit estimates now follow the OSRM road route (dashed) at ~25 km/h + 10 min, and short hops (<1.3 km) use a real walking route.
- Oct 26: Japan transit via NAVITIME Route(totalnavi) on RapidAPI (Worker /api/routes/japan, secret NAVITIME_RAPIDAPI_KEY), with shared 30-day edge cache + 30-day device cache to stay inside the free quota.
- Oct 26: imported bookings located via locateBooking (Google text search → OSM name match ≥0.8 → address); older imported stops re-checked once and moved if >500 m off (Item.located).
- Oct 26: NAVITIME answers kept a year: D1 transit_cache (shared) + device cache.
- Oct 26: imported passenger names map to trip people (matchTraveler: titles dropped, all of the person's name words in the printed name, or a remembered alias); picking a person for a printed name saves meta.travelerAliases and fixes the trip's other bookings; manual reservation geocoding uses locateBooking.
- Oct 26: road shared by several days' routes is striped in all their colours (line-pattern, ~10 m segment matching, drawn once); selecting a stop paints shared stretches in its day's colour.
- Oct 26: Overview (TripOverview.tsx) at the top of the itinerary, adapting before/during/after: countdown, next up + tonight, readiness (unbooked nights, overnight travel counts; flights), budget pace, upcoming bookings with copyable confirmation #s, nudges (empty days, unscheduled places, time overlaps, unpinned). Collapsible (remembered). ?today= previews a date.
- Oct 26: Settings dialog (gear in the trip header; per-device, lib/settings.ts): pin click on map = zoom & open card (default) or just open the card.
- Oct 26: Google photos failed in the picker/cards because img referrerPolicy=no-referrer stripped the referrer the key needs; fixed. Optional web image search via Brave Search API (/api/photos/web, BRAVE_SEARCH_KEY), shown after Google Maps photos.
- Oct 26: Settings → Contents column Thick/Thin. Thin is a 76px rail: logo, undo/redo, Plan/Bookings/Budget, one ring per day in its colour (scroll-spy), hide button.
- Oct 26: Bookings inside a day as slim cards (icon, title, what happens · people · #conf, time on the right), lined up with stop cards; Settings → Bookings in a day: Card (default) / Pill.
- Oct 26: Pin numbers (list pins, thin-rail day dots) use inkOn(): near-black unless it's under 4.5:1 and white reads better.
- Oct 26: Day drafts. Y map 'drafts' (id → date, name, createdAt); draft stops are items in section draft:<id> (kept out of budget, orphans and the Claude connector). Fork button on the day header copies the shown plan; tabs (Main / drafts) switch which plan the day shows (per device, tp-drafts-<trip>); edits/moves/adds go to the shown plan via SectionInfo.writeKey. Hidden plans' legs are routed as ghost legs so Compare (DayCompare modal: shared-frame route sketch, travel, stops, cost, stop list) can total them. Use this plan = adoptDraft (old plan kept as 'Previous plan' draft; one undo step).
- Oct 26: Compare plans columns show a real mini map (TripMap mini: no controls, framed on all pins + routes) with the version's numbered stops, routed legs, and the hotel/airport its legs touch; the dot sketch stays as the fallback without a map key.
- Oct 26: Settings → Stop times: Set / Auto. Auto (src/lib/autoTime.ts): item.stay (min, default 60) + meta.dayStarts[date] (default 9:00; later of that and the day's landing time) + each stop's incoming route duration; arrival rounded up to 5 min. Cards/panel/compare show the worked-out times; the time pill is read-only and an hourglass 'how long' pill (StayField) edits stay. Day header gets a 'Day starts' time.
- Oct 26: Compare plans lists only stops (no notes/checklists), with Start/End rows: last night's/tonight's hotel (pinned or not) or the arrival/departure airport with its time.
- Oct 26: 'How long' picker redesigned to match the time picker (type box + 15-min list to 12 h, opens on the current length).
- Oct 26: Day plans keep their names when swapped: meta.planNames[date] is the day's plan name (default 'Original'); adoptDraft swaps names with stops (no more 'Previous plan'). Main tab gets a check, renamable in Compare; drafts numbered past the highest used. Map credits (i) start folded (first idle presses MapLibre's own toggle).
- Oct 27: Trip settings (pin click, flight paths, contents width, bookings style, stop times) saved per account per trip in the trip doc (map 'prefs': email → settings; outside the undo scope). View-only/signed-out and the home screen use the device copy, which is also where an unset trip starts. Theme stays per device.
- Oct 27: Eye (one day alone on the map) frames every pin of that day, not the ~75% core.
- Oct 27: Rich text in notes, stop notes and checklist rows (src/lib/richtext.ts + components/RichText.tsx). Stored as marked-up plain text: **b** *i* ++u++ ~~s~~, '- '/'1. ' list lines, leading tabs nest. contenteditable editor (execCommand) with a selection toolbar (B I U S, bullets, numbers, indent/outdent in lists); Tab/Shift+Tab indent, '- ' or '1. ' starts a list, paste is plain text, Ctrl+U / Ctrl+Shift+X. Click formatted text to edit with the caret at the click. Checklist rows inline-only; ticked rows struck through.
- Oct 27: Places added to a list (Places to visit…) are added closed; adding to a day still opens the new stop.
- Oct 27: Shared bookings (one copy per traveller): itinerary card lists each person's notes (name + note, gap between). Booking form edits the whole group: For chips multi-select (Everyone = one copy), shared details on all copies, confirmation #/cost/notes per person; unticking a person removes their copy.
- Oct 27: Imported booking notes standardized (worker/bookingNotes.ts): extractor + connector fill a 'details' object (terminal, gate, seat, class, ticket #, baggage, room, car, insurance, party, tickets, cancellation, reference…); notes are written as '**Label:** value' lines in a fixed order per type, free notes after a blank line. Booking form notes use the rich editor.
- Oct 27: Emailed bookings with old free-text notes get tidied once into the standard layout (POST /api/notes/tidy → Claude sorts into details; client effect, notesTidy=1, non-undo origin). Multi-day bookings: notes on the first day's card (check-in/pick-up/departure); last day shows only its line (Check-out / Drop-off+Fuel / Terminal+Baggage); 'Staying at' days none. Collapsed sections saved in meta.collapsed (whole trip, all users; view-only = local).
- Oct 27: Settings → Imported booking notes: 'Format now' re-tidies every emailed booking's notes in the trip (progress, count changed); shared src/lib/tidyNotes.ts with the background once-only pass.
- Oct 27: Format now covers every booking with notes (older untagged imports, Claude-added), reports failures; tidy prompt pushes facts into fields (example), details JSON-string tolerated.
- Oct 27: Stops can be for some people only (item.who; picker on the open card of a day stop, chip on the closed card). Days with such stops route per person (walkLane per traveller), legs merged when shared; different legs into the same place get '<id>#n' keys and 'Name · …' labels (e.g. each person's home → the airport). Pins/numbering unchanged.
- Oct 27: Auto times on split days: each person runs their own clock from the day start through their own stops; a shared stop starts when the last of them arrives (legs carry who).
- Oct 27: Travel mode (phones; Settings → Travel mode, per device): TravelView — today's day first (day switcher, back to today), Now/Next card with a big Directions button (Google Maps from where you are), today's bookings with copyable confirmation # and seat/notes, big stop rows (time, number, address, Directions; tap for hours today, notes, Call, Website, Copy address), legs as one-liners, tickable checklists, Tonight's hotel. No photos; map only on demand (mini TripMap overlay). Background lookups (photos, pins, notes tidy, cover) pause.
- Oct 27: Emailed activities/tickets become reservations (Other, geocoded, ticket field order) instead of stops; '(Purchase …)' moved from title to confirmation (cleanTitle); older email-added activity stops converted once (then notes tidied).
- Oct 27: Receipts. Camera button on a stop (header icons) or Budget → Receipts → Scan receipt (label+file input capture=environment). Photo → 1600px JPEG → POST /api/receipts/parse (worker/receipts.ts, Claude vision, RECEIPT_MODEL default sonnet) → merchant/date/currency/category/items(taxable)/tax(added vs included)/tip/total. ReceiptFlow: check & edit lines → who paid → payer only / even (pick people) / by item (people per line, Shared). Tax added on top goes onto taxable lines by price, tip/fees onto all lines; Expense.kind='receipt', receipt, shares (uneven split; settleUp/people chart use shareOf), itemId (matchStop by name, same day preferred). Stop cards show their receipts total.
- Oct 27: Budget on phones: summary wraps (budget + currency on their own row), chart tabs full-width/no wrap, bars fill what a fixed 16ch amount column leaves (nothing runs off the card at large text sizes).
- Oct 27: Receipt parser: prompt copes with sideways/crumpled photos (readable=false only if not a receipt), weighed items; falls back to EXTRACT_MODEL if RECEIPT_MODEL fails or gives up; API errors surfaced in the message + logged.
- Oct 27: Receipt parser: prompt copes with sideways/crumpled photos (readable=false only if not a receipt), weighed items; falls back to EXTRACT_MODEL if RECEIPT_MODEL fails or gives up; API errors surfaced in the message + logged.
- Oct 27: Menu: capped height (min(22rem,55vh)) scrolling inside, optional search box + left align; receipt stop picker uses both (same day first, then by date).
- Oct 28: Receipt prompt: surcharges/service charges only in tip (not also as items), cover charge per person is an item, merchant = brand (+ short branch), address = this branch not head office. Tested in chat: Haiku and Sonnet both read a sideways Canadian grocery receipt correctly; on a Japanese izakaya receipt both got amounts/tax-included right, Sonnet got the shop name (Uotami) where Haiku didn't.
