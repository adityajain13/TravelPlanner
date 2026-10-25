import { api } from "./api";
import { searchPlaces } from "./photon";
import type { Item } from "./trips";

export interface Booking {
  type: "flight" | "hotel" | "train" | "bus" | "car" | "restaurant" | "activity" | "other";
  title: string;
  confirmation?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  location_name?: string;
  address?: string;
  from?: string;
  to?: string;
  notes?: string;
}

export interface InboxItem {
  id: string;
  trip_id: string | null;
  subject: string;
  booking: Booking;
  created_at: number;
}

export const fetchInbox = () => api<{ items: InboxItem[] }>("/inbox").then((r) => r.items);

export const patchInbox = (id: string, body: { status?: "added" | "dismissed"; trip_id?: string | null }) =>
  api(`/inbox/${id}`, { method: "PATCH", body: JSON.stringify(body) });

const PINNABLE = new Set<Booking["type"]>(["hotel", "restaurant", "activity", "car", "other"]);

/** Turn a booking into a trip item. Venues get geocoded so they show on the map. */
export async function bookingToItem(b: Booking, near?: [number, number]): Promise<Omit<Item, "id" | "section" | "order" | "createdAt">> {
  const lines = [
    b.confirmation && `Confirmation: ${b.confirmation}`,
    b.from && b.to && `${b.from} → ${b.to}`,
    b.end_date && b.end_date !== b.start_date && `${b.type === "hotel" ? "Check-out" : "Until"} ${b.end_date}${b.end_time ? ` ${b.end_time}` : ""}`,
    b.notes,
  ].filter(Boolean);

  let geo: { lat?: number; lng?: number; address?: string; osmId?: string } = {};
  if (PINNABLE.has(b.type) && (b.address || b.location_name)) {
    try {
      const [hit] = await searchPlaces([b.location_name, b.address].filter(Boolean).join(", "), near);
      if (hit) geo = { lat: hit.lat, lng: hit.lng, address: b.address || hit.address, osmId: hit.osmId };
    } catch {
      /* offline: add without a pin */
    }
  }
  return {
    kind: "place",
    name: b.title,
    category: b.type,
    startTime: b.start_time,
    endTime: b.end_date && b.end_date !== b.start_date ? undefined : b.end_time,
    notes: lines.join("\n") || undefined,
    address: geo.address ?? b.address,
    lat: geo.lat,
    lng: geo.lng,
    osmId: geo.osmId,
  };
}
