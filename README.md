# Travel Planner

My own Wanderlog: offline-first, dark mode down to the map, no paywall.
Live at **adityajain.ca/travelplanner**. Roadmap in [PLAN.md](PLAN.md).

## Setup

```bash
npm install
cp .env.example .env   # add VITE_PROTOMAPS_KEY and VITE_MAPTILER_KEY
npm run dev            # http://localhost:5173/travelplanner/
```

- **Protomaps** key (vector basemap): https://protomaps.com/api
- **MapTiler** key (satellite): https://cloud.maptiler.com/account/keys/ — restrict it to `adityajain.ca` and `localhost`.

## Deploy

```bash
npx wrangler login
npm run deploy
```

The Worker claims the route `adityajain.ca/travelplanner*`, which is more specific than the personal site's route, so the two coexist on the same zone.
The `VITE_*` keys are baked in at build time, so set them in `.env` (or the CI environment) before deploying.

## Data

Trips live on the device (IndexedDB) and work fully offline. Clearing site data deletes them — sync arrives in phase 3.

Map data © OpenStreetMap contributors · Protomaps · MapTiler. Search by Photon.
