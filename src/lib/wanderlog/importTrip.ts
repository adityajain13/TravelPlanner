import type * as Y from "yjs";
import { addItem, addList, createTrip, daySection, listSection, openTrip, readTrip, saveExpense, saveReservation, updateItem, updateMeta, type EditOrigin } from "../trips";
import { GENERIC_PLACE, geocode } from "../geocode";
import type { WanderlogTrip } from "./parse";

const ORIGIN: EditOrigin = { by: "me", label: "Wanderlog import" };

export interface ImportOptions {
  title: string;
  destination: string;
  currency: string;
  findPins: boolean;
}

export interface Progress {
  phase: "creating" | "pinning" | "done";
  done: number;
  total: number;
  unpinned: string[];
}

/** Creates the trip locally (it syncs like any other), then pins places one by one. */
export async function importWanderlog(t: WanderlogTrip, o: ImportOptions, onProgress: (p: Progress) => void, signal: AbortSignal) {
  onProgress({ phase: "creating", done: 0, total: 0, unpinned: [] });

  // Destination → centre + country, which keeps every later lookup in the right place
  const dest = o.findPins ? await geocode(o.destination, { signal }).catch(() => null) : null;
  const id = await createTrip({
    title: o.title,
    destination: o.destination,
    startDate: t.startDate,
    endDate: t.endDate,
    center: dest ? [dest.lng, dest.lat] : undefined,
    countryCode: dest?.countryCode,
    currency: o.currency,
  });
  const { doc } = openTrip(id);

  const placeIds: { id: string; name: string }[] = [];
  const add = (section: string, s: WanderlogTrip["days"][number]["stops"][number]) => {
    const itemId = addItem(doc, section, s.note ? { kind: "note", name: s.name } : { kind: "place", name: s.name, notes: s.notes, cost: s.cost }, ORIGIN);
    if (!s.note) placeIds.push({ id: itemId, name: s.name });
  };

  for (const l of t.lists) {
    addList(doc, l.title);
    const list = readTrip(doc).lists.find((x) => x.title === l.title)!;
    for (const s of l.stops) add(listSection(list.id), s);
  }
  for (const d of t.days) for (const s of d.stops) add(daySection(d.date), s);
  const resIds = t.reservations.map((r) => saveReservation(doc, r, ORIGIN));
  for (const e of t.expenses) saveExpense(doc, { ...e, currency: o.currency }, ORIGIN);

  if (!o.findPins) return { id, unpinned: [] as string[] };
  return { id, unpinned: await pinAll(doc, t, placeIds, resIds, dest, onProgress, signal) };
}

async function pinAll(
  doc: Y.Doc,
  t: WanderlogTrip,
  places: { id: string; name: string }[],
  resIds: string[],
  dest: { lat: number; lng: number; countryCode?: string } | null,
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
) {
  // Countries this trip involves: the destination's, plus each country we pin in (multi-country trips)
  const countries = new Set<string>(dest?.countryCode ? [dest.countryCode] : []);
  const unpinned: string[] = [];
  const total = places.length + t.reservations.filter((r) => r.address).length;
  let done = 0;
  const tick = () => onProgress({ phase: "pinning", done, total, unpinned });
  const cache = new Map<string, Awaited<ReturnType<typeof geocode>>>();
  const lookup = async (q: string, near?: [number, number]) => {
    const key = `${q}|${near?.map((n) => n.toFixed(1)).join(",")}`;
    if (!cache.has(key)) {
      const hit = await geocode(q, { countries: [...countries], near, signal });
      if (hit?.countryCode) countries.add(hit.countryCode);
      cache.set(key, hit);
    }
    return cache.get(key) ?? null;
  };

  // Lodging/car addresses first: they're exact and make good anchors for nearby stops
  const anchors = new Map<string, [number, number]>();
  for (const [i, r] of t.reservations.entries()) {
    if (signal.aborted) break;
    if (!r.address) continue;
    const hit = (await lookup(r.address)) ?? (await lookup(`${r.title}, ${r.address}`));
    if (hit) {
      saveReservation(doc, { ...r, id: resIds[i], lat: hit.lat, lng: hit.lng }, ORIGIN);
      anchors.set(r.title.toLowerCase(), [hit.lng, hit.lat]);
    }
    done++;
    tick();
  }

  // Stops in order: each lookup is biased to the previous pinned stop of the same day
  let prev: [number, number] | undefined = dest ? [dest.lng, dest.lat] : undefined;
  for (const p of places) {
    if (signal.aborted) break;
    let hit: { lat: number; lng: number; address?: string; osmId?: string; category?: string } | null = null;
    const anchor = anchors.get(p.name.toLowerCase());
    if (anchor) hit = { lng: anchor[0], lat: anchor[1] };
    else if (!GENERIC_PLACE.test(p.name.trim()) && p.name.replace(/[^\p{L}\p{N}]/gu, "").length >= 2) hit = await lookup(p.name, prev);
    if (hit) {
      updateItem(doc, p.id, { lat: hit.lat, lng: hit.lng, address: hit.address, osmId: hit.osmId, category: hit.category }, ORIGIN);
      prev = [hit.lng, hit.lat];
    } else unpinned.push(p.name);
    done++;
    tick();
  }

  const first = readTrip(doc).items.find((i) => i.lat != null);
  if (!dest && first) updateMeta(doc, { center: [first.lng!, first.lat!] }, ORIGIN);
  onProgress({ phase: "done", done, total, unpinned });
  return unpinned;
}

