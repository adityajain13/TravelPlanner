import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";
import { db } from "./db";
import { daysBetween } from "./dates";

/*
 * Trip doc layout (one Y.Doc per trip, persisted offline in IndexedDB as `trip-<id>`):
 *
 *   meta:  Y.Map  { title, destination, startDate, endDate, center? [lng, lat] }
 *   lists: Y.Map  listId -> Y.Map { title, order }        e.g. "Places to visit"
 *   items: Y.Map  itemId -> Y.Map { ...Item fields }
 *
 * Items are a flat map with a `section` ("day:YYYY-MM-DD" | "list:<id>") and a fractional
 * `order` key, instead of nested arrays. Two people moving items at once can't corrupt the
 * order, and a field edit on one item never conflicts with a move of another.
 *
 * Every write goes through `edit()` with an origin, so later phases can label history
 * ("you", "Rahul", "Claude") and offer per-origin undo.
 */

export type ItemKind = "place" | "note";

export interface Item {
  id: string;
  kind: ItemKind;
  section: string;
  order: string;
  name: string;
  notes?: string;
  startTime?: string; // "HH:MM"
  endTime?: string;
  lat?: number;
  lng?: number;
  address?: string;
  category?: string;
  osmId?: string; // e.g. "N123456" — stable OSM reference, fine to store forever
  googlePlaceId?: string; // only the ID; details are fetched live (Phase 2)
  createdAt: number;
}

export interface TripMeta {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  center?: [number, number];
}

export interface ListMeta {
  id: string;
  title: string;
  order: string;
}

export interface TripState {
  meta: TripMeta;
  lists: ListMeta[];
  items: Item[];
}

export type EditOrigin = { by: "me" | "remote" | "claude" | "email"; label?: string };
export const ME: EditOrigin = { by: "me" };

export const daySection = (date: string) => `day:${date}`;
export const listSection = (id: string) => `list:${id}`;

interface OpenTrip {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  ready: Promise<void>;
}

const open = new Map<string, OpenTrip>();

export function openTrip(id: string): OpenTrip {
  let t = open.get(id);
  if (!t) {
    const doc = new Y.Doc();
    const persistence = new IndexeddbPersistence(`trip-${id}`, doc);
    const ready = persistence.whenSynced.then(() => undefined);
    t = { doc, persistence, ready };
    open.set(id, t);
    // Keep the home-screen index in sync with the doc's metadata
    doc.getMap("meta").observe(() => syncIndex(id, doc));
  }
  return t;
}

function syncIndex(id: string, doc: Y.Doc) {
  const m = doc.getMap("meta").toJSON() as Partial<TripMeta>;
  if (!m.title) return;
  const fields = {
    title: m.title,
    destination: m.destination ?? "",
    startDate: m.startDate ?? "",
    endDate: m.endDate ?? "",
    updatedAt: Date.now(),
  };
  // update() keeps shareToken/role on shared trips; put() only for trips not indexed yet
  void db.trips.update(id, fields).then(async (n) => {
    if (n === 0) await db.trips.put({ id, ...fields });
  });
}

const readOnly = new WeakSet<Y.Doc>();
/** View-only share links: local edits are blocked (the server drops them too). */
export function setReadOnly(doc: Y.Doc, ro: boolean) {
  if (ro) readOnly.add(doc);
  else readOnly.delete(doc);
}

export function edit(doc: Y.Doc, fn: () => void, origin: EditOrigin = ME) {
  if (readOnly.has(doc)) return;
  doc.transact(fn, origin);
}

export async function createTrip(meta: TripMeta): Promise<string> {
  const id = nanoid(12);
  const { doc, ready } = openTrip(id);
  await ready;
  edit(doc, () => {
    const m = doc.getMap("meta");
    for (const [k, v] of Object.entries(meta)) if (v !== undefined) m.set(k, v);
    const lists = doc.getMap<Y.Map<unknown>>("lists");
    const l = new Y.Map<unknown>();
    l.set("title", "Places to visit");
    l.set("order", generateKeyBetween(null, null));
    lists.set(nanoid(8), l);
  });
  return id;
}

/** Removes the trip from this device; owners also delete it on the server (best effort). */
export async function deleteTrip(id: string, opts: { server: boolean }) {
  if (opts.server) {
    const res = await fetch(`/travelplanner/api/trips/${id}`, { method: "DELETE", credentials: "same-origin" }).catch(() => null);
    if (res && !res.ok && res.status !== 401) throw new Error("Couldn't delete on the server");
  }
  const t = openTrip(id);
  await t.ready;
  await t.persistence.clearData();
  t.doc.destroy();
  open.delete(id);
  await db.trips.delete(id);
  await db.regions.delete(id);
}

export function readTrip(doc: Y.Doc): TripState {
  const meta = doc.getMap("meta").toJSON() as TripMeta;
  const lists = [...doc.getMap<Y.Map<unknown>>("lists").entries()]
    .map(([id, m]) => ({ id, ...(m.toJSON() as Omit<ListMeta, "id">) }))
    .sort(byOrder);
  const items = [...doc.getMap<Y.Map<unknown>>("items").values()]
    .map((m) => m.toJSON() as Item)
    .sort(byOrder);
  return { meta, lists, items };
}

const byOrder = (a: { order: string }, b: { order: string }) =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : 0;

/** Sections in display order: lists first (like Wanderlog), then each trip day. */
export function sectionsFor(state: TripState): string[] {
  return [
    ...state.lists.map((l) => listSection(l.id)),
    ...daysBetween(state.meta.startDate, state.meta.endDate).map(daySection),
  ];
}

function itemsIn(doc: Y.Doc, section: string, excludeId?: string): Item[] {
  return [...doc.getMap<Y.Map<unknown>>("items").values()]
    .map((m) => m.toJSON() as Item)
    .filter((i) => i.section === section && i.id !== excludeId)
    .sort(byOrder);
}

export function addItem(
  doc: Y.Doc,
  section: string,
  data: Omit<Item, "id" | "section" | "order" | "createdAt">,
  origin: EditOrigin = ME,
): string {
  const id = nanoid(10);
  const existing = itemsIn(doc, section);
  const order = generateKeyBetween(existing.at(-1)?.order ?? null, null);
  edit(
    doc,
    () => {
      const m = new Y.Map<unknown>();
      const full: Item = { ...data, id, section, order, createdAt: Date.now() };
      for (const [k, v] of Object.entries(full)) if (v !== undefined) m.set(k, v);
      doc.getMap<Y.Map<unknown>>("items").set(id, m);
    },
    origin,
  );
  return id;
}

export function updateItem(doc: Y.Doc, id: string, patch: Partial<Omit<Item, "id">>, origin: EditOrigin = ME) {
  const m = doc.getMap<Y.Map<unknown>>("items").get(id);
  if (!m) return;
  edit(
    doc,
    () => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") m.delete(k);
        else m.set(k, v);
      }
    },
    origin,
  );
}

export function removeItem(doc: Y.Doc, id: string, origin: EditOrigin = ME) {
  edit(doc, () => doc.getMap("items").delete(id), origin);
}

/** Move an item into `section` at position `index` (counted without the moved item). */
export function moveItem(doc: Y.Doc, id: string, section: string, index: number, origin: EditOrigin = ME) {
  const siblings = itemsIn(doc, section, id);
  const i = Math.max(0, Math.min(index, siblings.length));
  const order = generateKeyBetween(siblings[i - 1]?.order ?? null, siblings[i]?.order ?? null);
  updateItem(doc, id, { section, order }, origin);
}

export function updateMeta(doc: Y.Doc, patch: Partial<TripMeta>, origin: EditOrigin = ME) {
  edit(
    doc,
    () => {
      const m = doc.getMap("meta");
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) m.set(k, v);
    },
    origin,
  );
}

export function renameList(doc: Y.Doc, listId: string, title: string) {
  const l = doc.getMap<Y.Map<unknown>>("lists").get(listId);
  if (l) edit(doc, () => l.set("title", title));
}

export function addList(doc: Y.Doc, title: string) {
  const lists = [...doc.getMap<Y.Map<unknown>>("lists").values()].map((m) => m.get("order") as string).sort();
  edit(doc, () => {
    const l = new Y.Map<unknown>();
    l.set("title", title);
    l.set("order", generateKeyBetween(lists.at(-1) ?? null, null));
    doc.getMap<Y.Map<unknown>>("lists").set(nanoid(8), l);
  });
}
