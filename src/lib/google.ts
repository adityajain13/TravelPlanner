// Google Places API (New). Personal app: Google's name/address/pin/type for picked places and a
// snapshot of details (rating, hours, phone, website) are saved on the stop so they work offline.
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
    photos: (p.photos ?? []).slice(0, 10).map((ph) => ({ name: ph.name, attributions: ph.authorAttributions ?? [] })),
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

/*
 * Google Places Autocomplete (New), live only, for places OpenStreetMap doesn't find
 * ("YYZ Terminal 3", a bakery counter inside a department store). Picking one looks up its
 * place's details once and saves Google's name, address, pin and type on the stop.
 * One session token per typing session keeps billing to a single autocomplete session.
 */
export interface GoogleSuggestion {
  placeId: string;
  main: string;
  secondary?: string;
}

let session: string | null = null;
const newSession = () => (session = crypto.randomUUID());

export async function autocomplete(input: string, near?: [number, number], signal?: AbortSignal): Promise<GoogleSuggestion[]> {
  if (!GOOGLE_KEY || input.trim().length < 3) return [];
  if (!session) newSession();
  const body: Record<string, unknown> = { input, sessionToken: session, languageCode: "en" };
  if (near) body.locationBias = { circle: { center: { latitude: near[1], longitude: near[0] }, radius: 50000 } };
  type R = { suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }[] };
  const json = await call<R>(
    `${API}/places:autocomplete`,
    { method: "POST", body: JSON.stringify(body), signal },
    "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text",
  );
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .slice(0, 5)
    .map((p) => ({ placeId: p.placeId, main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text }));
}

/** Google's own data for a picked suggestion (ends the autocomplete session). Saved on the stop. */
export async function suggestionPlace(placeId: string): Promise<{
  name: string;
  address?: string;
  lat: number;
  lng: number;
  type?: string;
  countryCode?: string;
} | null> {
  const qs = session ? `?sessionToken=${session}&languageCode=en` : "?languageCode=en";
  session = null;
  type P = {
    displayName?: { text: string };
    formattedAddress?: string;
    shortFormattedAddress?: string;
    location?: { latitude: number; longitude: number };
    primaryTypeDisplayName?: { text: string };
    addressComponents?: { shortText?: string; types?: string[] }[];
  };
  const p = await call<P>(
    `${API}/places/${encodeURIComponent(placeId)}${qs}`,
    { method: "GET" },
    "displayName,formattedAddress,shortFormattedAddress,location,primaryTypeDisplayName,addressComponents",
  );
  if (!p.location) return null;
  return {
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? p.shortFormattedAddress,
    lat: p.location.latitude,
    lng: p.location.longitude,
    type: p.primaryTypeDisplayName?.text,
    countryCode: p.addressComponents?.find((c) => c.types?.includes("country"))?.shortText?.toLowerCase(),
  };
}
