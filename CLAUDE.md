# TravelPlanner

Offline-first trip planner PWA served at adityajain.ca/travelplanner by a Cloudflare Worker.
**Read PLAN.md first** — it has the locked decisions, phase checklist and what's next.

- Stack: React 19 + Vite + Tailwind v4, Yjs (+ y-indexeddb) for trip docs, Dexie for local-only data, MapLibre + Protomaps.
- All trip mutations go through `src/lib/trips.ts` with an `EditOrigin`. Don't write to Y maps directly from components.
- Theme tokens live in `src/index.css` (`bg`, `surface`, `surface-2`, `line`, `fg`, `muted`, `accent`). Dark is the default; green accent.
- Google Places data may be saved on stops (name, address, pin, type, details snapshot, photo URLs, transit routes): personal-use app, owner's decision (Oct 2026).
- Before finishing: `npm run build` must pass.
