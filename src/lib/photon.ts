import { searchPlaces as search } from "./geocode";

// Place search via Photon (OpenStreetMap data, free, results are fine to store offline).
// https://photon.komoot.io — attribution: © OpenStreetMap contributors

export interface PlaceResult {
  osmId: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  countryCode?: string;
  /** Added from a pasted Google Maps link (the app then links its Google place ID). */
  fromLink?: boolean;
  /** Chosen from a Google suggestion: link this place ID (the only Google data kept). */
  googlePlaceId?: string;
}

/** Photon search with a Nominatim fallback (see geocode.ts); results in the trip's country first. */
export async function searchPlaces(q: string, near?: [number, number], signal?: AbortSignal, countryCode?: string): Promise<PlaceResult[]> {
  const hits = await search(q, { near, signal, countryCode });
  const seen = new Set<string>();
  return hits
    .map((h) => ({
      osmId: h.osmId ?? `${h.lat},${h.lng}`,
      name: h.name,
      address: h.address ?? "",
      category: h.category ?? "",
      lat: h.lat,
      lng: h.lng,
      countryCode: h.countryCode,
    }))
    .filter((r) => (seen.has(r.osmId) ? false : (seen.add(r.osmId), true)));
}

/** Free deep link — opens the place in Google Maps without touching the Places API. */
export function googleMapsLink(i: { name: string; lat?: number; lng?: number; googlePlaceId?: string }) {
  const q = encodeURIComponent(i.lat != null ? `${i.name} @${i.lat},${i.lng}` : i.name);
  const base = `https://www.google.com/maps/search/?api=1&query=${q}`;
  return i.googlePlaceId ? `${base}&query_place_id=${i.googlePlaceId}` : base;
}
