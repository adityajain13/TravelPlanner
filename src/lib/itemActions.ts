import type * as Y from "yjs";
import { GENERIC_PLACE } from "./geocode";
import { findPlaceId, getDetails, GOOGLE_KEY, photoUrl } from "./google";
import { firstPhoto } from "./images";
import type { PlaceResult } from "./photon";
import type { TravelMode } from "./routing";
import { addItem, readTrip, samePlace, setItemImage, updateItem, updateMeta, type Item, type TripState } from "./trips";

/** A place picked in the add box: a new stop in the section, with its photo and details looked up. */
export function addPlace(doc: Y.Doc, sectionKey: string, p: PlaceResult, index: number | undefined, ctx: { destination?: string; near?: [number, number] }): string {
  const newId = addItem(doc, sectionKey, { kind: "place", name: p.name, address: p.address || undefined, category: p.category || undefined, lat: p.lat, lng: p.lng, osmId: p.osmId, googlePlaceId: p.googlePlaceId }, undefined, index);
  // Already on the trip elsewhere with a photo: reuse that photo
  const all = readTrip(doc).items;
  const added = all.find((x) => x.id === newId);
  const twin = added && all.find((x) => x.id !== newId && x.image && samePlace(added, x));
  if (twin) updateItem(doc, newId, { image: twin.image });
  // Picked from Google: copy its details (rating, hours…) and use its first photo
  if (p.googlePlaceId && GOOGLE_KEY)
    getDetails(p.googlePlaceId)
      .then((d) => {
        const ph = d.photos[0];
        const image = ph
          ? { url: photoUrl(ph.name, 1600), thumb: photoUrl(ph.name, 600), source: "google" as const, credit: ph.attributions.map((a) => a.displayName).join(", ") || "Google", link: ph.attributions[0]?.uri, title: d.name }
          : undefined;
        const cur = readTrip(doc).items.find((x) => x.id === newId);
        updateItem(doc, newId, { google: { ...d, fetchedAt: Date.now() }, ...(image && !cur?.image ? { image } : {}) });
      })
      .catch(() => undefined);
  // Give it a photo straight away (Wikipedia match, else Unsplash)
  if (navigator.onLine && !p.googlePlaceId && !GENERIC_PLACE.test(p.name.trim()))
    firstPhoto(p.name, [p.lng, p.lat], ctx.destination)
      .then((image) => image && !readTrip(doc).items.find((x) => x.id === newId)?.image && updateItem(doc, newId, { image }))
      .catch(() => undefined);
  // From a Google Maps link without a Google match yet: link its place ID so Google details work straight away
  if (p.fromLink && !p.googlePlaceId && GOOGLE_KEY)
    findPlaceId({ name: p.name, lat: p.lat, lng: p.lng })
      .then((googlePlaceId) => googlePlaceId && updateItem(doc, newId, { googlePlaceId }))
      .catch(() => undefined);
  if (!ctx.near) updateMeta(doc, { center: [p.lng, p.lat] });
  return newId;
}

/** A stop's card changed. A new photo goes on every stop at the same place. */
export function changeItem(doc: Y.Doc, itemId: string, patch: Partial<Item>) {
  if ("image" in patch) {
    const { image, ...rest } = patch;
    setItemImage(doc, itemId, image);
    if (Object.keys(rest).length) updateItem(doc, itemId, rest);
  } else updateItem(doc, itemId, patch);
}

/** Travel mode of one leg: the day's hotel legs, the leg into a stop, or the stop's default. */
export function setLegMode(doc: Y.Doc, state: TripState, sectionKey: string, legId: string, m: TravelMode) {
  const itemId = legId.replace(/#\d+$/, ""); // a person's own leg into the stop
  if (itemId === "end" || itemId.startsWith("dep:"))
    updateMeta(doc, { hotelLegModes: { ...(state.meta.hotelLegModes ?? {}), [itemId === "end" ? sectionKey : `${sectionKey}|dep`]: m } });
  else updateItem(doc, itemId, { travelMode: m === (state.meta.travelMode ?? "drive") ? undefined : m });
}

/** Sets or clears one per-day / per-section entry in a trip meta map (colour, start time, subtitle). */
export function setMetaEntry(doc: Y.Doc, state: TripState, field: "dayColors" | "dayStarts" | "subtitles", key: string, value: string | undefined) {
  const next = { ...(state.meta[field] ?? {}) };
  if (value) next[key] = value;
  else delete next[key];
  updateMeta(doc, { [field]: next });
}

/** Folds a section open or shut (the list of collapsed section keys is shared by the trip). */
export function setCollapsed(doc: Y.Doc, state: TripState, key: string, collapsed: boolean) {
  const cur = (state.meta.collapsed ?? []).filter((k) => k !== key);
  updateMeta(doc, { collapsed: collapsed ? [...cur, key] : cur });
}
