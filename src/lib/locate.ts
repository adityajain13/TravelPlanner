import { GOOGLE_KEY } from "./google";
import { searchPlaces } from "./photon";
import { textScore } from "./geocode";

export interface Located {
  lat: number;
  lng: number;
  address?: string;
  googlePlaceId?: string;
  osmId?: string;
}

/**
 * Where an imported booking (ticket, hotel, restaurant) actually is. Google's text search first
 * (it knows "Nintendo Museum" and reads Japanese addresses); otherwise OpenStreetMap, but only a
 * result whose name really matches, then the address on its own. Never a loose "best guess".
 */
export async function locateBooking(name: string | undefined, address: string | undefined, near?: [number, number]): Promise<Located | null> {
  const q = [name, address].filter(Boolean).join(", ");
  if (!q) return null;
  if (GOOGLE_KEY && navigator.onLine) {
    try {
      const { findPlaceId, suggestionPlace } = await import("./google");
      const id = await findPlaceId({ name: name ?? address!, address: name ? address : undefined });
      const p = id ? await suggestionPlace(id) : null;
      if (p) return { lat: p.lat, lng: p.lng, address: address || p.address, googlePlaceId: id! };
    } catch {
      /* fall through to OpenStreetMap */
    }
  }
  if (name) {
    const hits = await searchPlaces(name, near).catch(() => []);
    const good = hits.find((h) => textScore(name, h) >= 0.8);
    if (good) return { lat: good.lat, lng: good.lng, address: address || good.address, osmId: good.osmId };
  }
  if (address) {
    const [hit] = await searchPlaces(address, near).catch(() => []);
    if (hit) return { lat: hit.lat, lng: hit.lng, address, osmId: hit.osmId };
  }
  return null;
}
