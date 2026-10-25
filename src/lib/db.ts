import Dexie, { type EntityTable } from "dexie";

// Dexie holds the device-local, non-collaborative data.
// Trip contents live in per-trip Yjs docs (see trips.ts); `trips` here is just an index
// so the home screen can list trips without opening every doc.

export interface TripIndexRow {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  updatedAt: number;
  /** Set when this trip was opened from someone else's share link (no login needed). */
  shareToken?: string;
  role?: "view" | "edit";
}

export interface RegionRow {
  tripId: string;
  bbox: [number, number, number, number]; // w, s, e, n
  maxZoom: number;
  tiles: number;
  bytes: number;
  savedAt: number;
}

export interface RouteRow {
  key: string;
  result: import("./routing").LegResult;
  fetchedAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export const db = new Dexie("travelplanner") as Dexie & {
  trips: EntityTable<TripIndexRow, "id">;
  settings: EntityTable<SettingRow, "key">;
  regions: EntityTable<RegionRow, "tripId">;
  routes: EntityTable<RouteRow, "key">;
};

db.version(1).stores({
  trips: "id, updatedAt, startDate",
  settings: "key",
});

db.version(2).stores({
  trips: "id, updatedAt, startDate",
  settings: "key",
  regions: "tripId",
  // Reserved: inbox (email-imported bookings awaiting review)
});

db.version(3).stores({
  trips: "id, updatedAt, startDate",
  settings: "key",
  regions: "tripId",
  routes: "key", // cached leg geometries (derived data, safe to clear)
});
