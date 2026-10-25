// Google Places API (New), used live only. Per Google's terms the only thing we persist is the
// place ID (on the item as `googlePlaceId`). Details stay in this in-memory cache for the session.
// Restrict the key to HTTP referrers adityajain.ca/* and localhost in Google Cloud Console.

export const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY as string | undefined;

const API = "https://places.googleapis.com/v1";

export interface GoogleDetails {
  id: string;
  name: string;
  address?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: string;
  openNow?: boolean;
  hours?: string[];
  phone?: string;
  website?: string;
  mapsUri?: string;
  photos: { name: string; attributions: { displayName: string; uri?: string }[] }[];
}

const cache = new Map<string, GoogleDetails>();

async function call<T>(url: string, init: RequestInit, fields: string): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY ?? "",
      "X-Goog-FieldMask": fields,
      ...init.headers,
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(res.status === 403 ? "Google key rejected (check referrer restrictions)" : `Google error ${res.status} ${msg.slice(0, 80)}`);
  }
  return res.json() as Promise<T>;
}

/** Match an OSM place to its Google place ID, biased to its coordinates. */
export async function findPlaceId(q: { name: string; address?: string; lat?: number; lng?: number }): Promise<string | null> {
  const body: Record<string, unknown> = {
    textQuery: [q.name, q.address].filter(Boolean).join(", "),
    pageSize: 1,
  };
  if (q.lat != null && q.lng != null) {
    body.locationBias = { circle: { center: { latitude: q.lat, longitude: q.lng }, radius: 300 } };
  }
  const json = await call<{ places?: { id: string }[] }>(`${API}/places:searchText`, { method: "POST", body: JSON.stringify(body) }, "places.id");
  return json.places?.[0]?.id ?? null;
}

interface RawPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  photos?: { name: string; authorAttributions?: { displayName: string; uri?: string }[] }[];
}

const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "priceLevel",
  "currentOpeningHours.openNow",
  "currentOpeningHours.weekdayDescriptions",
  "regularOpeningHours.weekdayDescriptions",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "photos",
].join(",");

export async function getDetails(id: string): Promise<GoogleDetails> {
  const hit = cache.get(id);
  if (hit) return hit;
  const p = await call<RawPlace>(`${API}/places/${encodeURIComponent(id)}?languageCode=en`, { method: "GET" }, DETAIL_FIELDS);
  const d: GoogleDetails = {
    id: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress,
    rating: p.rating,
    ratingCount: p.userRatingCount,
    priceLevel: p.priceLevel,
    openNow: p.currentOpeningHours?.openNow,
    hours: p.currentOpeningHours?.weekdayDescriptions ?? p.regularOpeningHours?.weekdayDescriptions,
    phone: p.internationalPhoneNumber,
    website: p.websiteUri,
    mapsUri: p.googleMapsUri,
    photos: (p.photos ?? []).slice(0, 4).map((ph) => ({ name: ph.name, attributions: ph.authorAttributions ?? [] })),
  };
  cache.set(id, d);
  return d;
}

export const photoUrl = (name: string, w = 480) => `${API}/${name}/media?maxWidthPx=${w}&key=${GOOGLE_KEY}`;

export const PRICE_LABEL: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};
