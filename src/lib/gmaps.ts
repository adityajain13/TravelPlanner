/*
 * "Paste a Google Maps link" support. Only the name and coordinates are read from the link, and
 * the place is then matched to OpenStreetMap so what gets saved is OSM data (see CLAUDE.md).
 */
import { searchPlaces, type PlaceResult } from "./photon";
import { distanceKm, reversePlaces, textScore } from "./geocode";
import { suggestionLocation, type GoogleSuggestion } from "./google";
import { shareQuery } from "./shareToken";

const LINK = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\S*$/i;
export const isMapsLink = (s: string) => LINK.test(s.trim());

export interface ParsedLink {
  name?: string;
  lat?: number;
  lng?: number;
}

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Read the place name and pin out of a full google.com/maps URL. */
export function parseMapsUrl(raw: string): ParsedLink {
  const u = new URL(raw);
  const out: ParsedLink = {};
  const path = decodeURIComponent(u.pathname.replace(/\+/g, " "));
  const place = path.match(/\/maps\/(?:place|search)\/([^/]+)/);
  if (place && !COORDS.test(place[1])) out.name = place[1].trim();
  // The place's own pin (!3d lat !4d lng) beats the viewport centre (@lat,lng)
  const pin = raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const at = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const q = u.searchParams.get("q") ?? u.searchParams.get("query") ?? u.searchParams.get("destination") ?? u.searchParams.get("ll");
  const qc = q?.match(COORDS);
  const c = pin ?? qc ?? at;
  if (c) (out.lat = Number(c[1])), (out.lng = Number(c[2]));
  if (!out.name && q && !qc) out.name = q.trim();
  return out;
}

async function expand(link: string, signal?: AbortSignal): Promise<string> {
  if (/google\.[a-z.]+\/maps|maps\.google\./i.test(link)) return link;
  const qs = new URLSearchParams({ u: link, ...shareQuery() });
  const res = await fetch(`/travelplanner/api/maps-link?${qs}`, { signal, credentials: "same-origin" });
  if (!res.ok) throw new Error(navigator.onLine ? "Couldn't open that link" : "Opening short links needs a connection");
  return ((await res.json()) as { url: string }).url;
}

/** Places for a pasted link: the OSM match(es) at that spot, else the bare pin from the link. */
export async function placesFromLink(link: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const p = parseMapsUrl(await expand(link.trim(), signal));
  if (!p.name && p.lat == null) throw new Error("No place found in that link");
  const at: [number, number] | undefined = p.lat != null ? [p.lng!, p.lat] : undefined;
  if (p.name) {
    const hits = await searchPlaces(p.name, at, signal).catch(() => []);
    const near = at ? hits.filter((h) => distanceKm(at, [h.lng, h.lat]) < 1).sort((a, b) => distanceKm(at, [a.lng, a.lat]) - distanceKm(at, [b.lng, b.lat])) : hits;
    if (near.length) return near.slice(0, 3).map((h) => ({ ...h, fromLink: true }));
  }
  if (!at) throw new Error("Couldn't find that place on the map");
  // Name didn't match OSM (often a local-language name, e.g. "Gestastofa Snæfellsness"):
  // take the category/address of whatever OSM has right at the pin, or at least the town.
  const around = await reversePlaces(at, 0.15, signal).catch(() => []);
  const poi = around.find((h) => h.category && distanceKm(at, [h.lng, h.lat]) < 0.15);
  const area = around[0] ?? (await reversePlaces(at, 5, signal).catch(() => []))[0];
  return [
    {
      osmId: poi?.osmId ?? `pin:${p.lat!.toFixed(6)},${p.lng!.toFixed(6)}`,
      name: p.name ?? poi?.name ?? "Dropped pin",
      address: poi?.address ?? area?.address ?? "",
      category: poi?.category ?? "",
      lat: p.lat!,
      lng: p.lng!,
      countryCode: poi?.countryCode ?? area?.countryCode,
      fromLink: true,
    },
  ];
}

/**
 * A Google autocomplete pick → a place to save. Google only says *where* it is; what's saved
 * comes from OpenStreetMap at that spot (matching name first, else the nearest feature for the
 * position and address), plus the Google place ID so live Google details work.
 */
export async function placeFromSuggestion(sug: GoogleSuggestion, signal?: AbortSignal): Promise<PlaceResult> {
  const loc = await suggestionLocation(sug.placeId);
  if (!loc) throw new Error("Couldn't locate that place");
  const at: [number, number] = [loc.lng, loc.lat];
  const [around, named] = await Promise.all([
    reversePlaces(at, 0.15, signal).catch(() => []),
    searchPlaces(sug.main, at, signal).catch(() => []),
  ]);
  const close = (h: { lat: number; lng: number }, km: number) => distanceKm(at, [h.lng, h.lat]) < km;
  const match = [...named.filter((h) => close(h, 0.6)), ...around].find((h) => textScore(sug.main, h) >= 0.6);
  if (match)
    return {
      osmId: match.osmId ?? `pin:${match.lat.toFixed(5)},${match.lng.toFixed(5)}`,
      name: textScore(sug.main, match) >= 0.75 ? match.name : sug.main,
      address: match.address ?? "",
      category: match.category ?? "",
      lat: match.lat,
      lng: match.lng,
      countryCode: match.countryCode,
      googlePlaceId: sug.placeId,
    };
  const spot = around.find((h) => close(h, 0.15)) ?? (await reversePlaces(at, 0.6, signal).catch(() => []))[0];
  const pos = spot ?? { lat: loc.lat, lng: loc.lng };
  return {
    osmId: spot?.osmId ? `near:${spot.osmId}` : `pin:${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}`,
    name: sug.main,
    address: spot?.address ?? sug.secondary ?? "",
    category: "",
    lat: pos.lat,
    lng: pos.lng,
    countryCode: spot?.countryCode,
    googlePlaceId: sug.placeId,
  };
}
