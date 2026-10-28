import { api } from "./api";
import { locateBooking } from "./locate";
import type { Item, Reservation, ReservationType } from "./trips";

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
  traveler?: string;
  /** Total price, when the email or an attached PDF shows one. */
  cost?: number;
  currency?: string;
  /** Set when someone other than the owner forwarded it (from the trip's sender list). */
  forwarded_by?: string;
}

export interface InboxItem {
  id: string;
  trip_id: string | null;
  subject: string;
  booking: Booking;
  created_at: number;
  status?: "pending" | "added" | "dismissed";
}

/** Who besides the owner may forward emails to this trip's address. */
export const fetchSenders = (tripId: string) => api<{ emails: string[] }>(`/trips/${tripId}/senders`).then((r) => r.emails);
export const saveSenders = (tripId: string, emails: string[]) =>
  api<{ emails: string[] }>(`/trips/${tripId}/senders`, { method: "PUT", body: JSON.stringify({ emails }) }).then((r) => r.emails);

export const deleteInbox = (id: string) => api(`/inbox/${id}`, { method: "DELETE" });

/** Every forwarded booking, newest first, whatever happened to it. */
export const fetchInboxHistory = () => api<{ items: InboxItem[] }>("/inbox?all=1").then((r) => r.items);

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

  let geo: { lat?: number; lng?: number; address?: string; osmId?: string; googlePlaceId?: string } = {};
  if (PINNABLE.has(b.type) && (b.address || b.location_name)) {
    try {
      const hit = await locateBooking(b.location_name ?? b.title, b.address, near);
      if (hit) geo = hit;
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
    googlePlaceId: geo.googlePlaceId,
    located: true,
    cost: b.cost ?? undefined,
    costCurrency: b.cost != null ? b.currency?.toUpperCase() : undefined,
  };
}

const RES_TYPE: Partial<Record<Booking["type"], ReservationType>> = {
  flight: "flight",
  hotel: "lodging",
  train: "train",
  bus: "train",
  car: "car",
  restaurant: "restaurant",
  // Tickets and timed entries (museums, shows, tours) are bookings too: Reservations → Other
  activity: "other",
  other: "other",
};

/** Every booking becomes a reservation (activities and tickets as "Other"). */
export const reservationTypeFor = (b: Booking) => RES_TYPE[b.type];

/**
 * "Nintendo Museum timed ticket (Purchase M0715366501)" → title "Nintendo Museum timed ticket",
 * confirmation "M0715366501": order numbers belong in Confirmation #, not the name.
 */
export function cleanTitle(title: string, confirmation?: string) {
  const m = /\s*[(\[]\s*(?:purchase|order|booking|reservation|confirmation|ref(?:erence)?)\b[^)\]]*?([A-Z0-9][A-Z0-9-]{4,})?\s*[)\]]/i.exec(title);
  if (!m) return { title, confirmation };
  return { title: title.replace(m[0], "").trim() || title, confirmation: confirmation || m[1] };
}

export async function bookingToReservation(b: Booking, near?: [number, number]): Promise<Omit<Reservation, "id" | "createdAt">> {
  const type = RES_TYPE[b.type] ?? "other";
  let geo: { lat?: number; lng?: number; address?: string } = {};
  if ((type === "lodging" || type === "restaurant" || type === "other") && (b.address || b.location_name)) {
    try {
      const hit = await locateBooking(b.location_name, b.address, near);
      if (hit) geo = { lat: hit.lat, lng: hit.lng, address: hit.address };
    } catch {
      /* offline */
    }
  }
  return {
    type,
    ...cleanTitle(b.title, b.confirmation),
    startDate: b.start_date,
    startTime: b.start_time,
    endDate: b.end_date,
    endTime: b.end_time,
    from: b.from ?? (type === "car" ? b.location_name : undefined),
    to: b.to,
    address: geo.address ?? b.address,
    lat: geo.lat,
    lng: geo.lng,
    notes: b.notes,
    traveler: b.traveler,
    cost: b.cost ?? undefined,
    costCurrency: b.cost != null ? b.currency?.toUpperCase() : undefined,
  };
}
