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
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export const db = new Dexie("travelplanner") as Dexie & {
  trips: EntityTable<TripIndexRow, "id">;
  settings: EntityTable<SettingRow, "key">;
};

db.version(1).stores({
  trips: "id, updatedAt, startDate",
  settings: "key",
  // Reserved for later phases:
  //   inbox: email-imported bookings awaiting review
  //   regions: downloaded offline map extracts
});
