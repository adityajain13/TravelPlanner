import { travelInstant } from "./airports";
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
 *   drafts: Y.Map draftId -> Y.Map { date, name, createdAt }   alternative plans for a day; their
 *          stops are ordinary items in section "draft:<draftId>"
 *
 * Items are a flat map with a `section` ("day:YYYY-MM-DD" | "list:<id>") and a fractional
 * `order` key, instead of nested arrays. Two people moving items at once can't corrupt the
 * order, and a field edit on one item never conflicts with a move of another.
 *
 * Every write goes through `edit()` with an origin, so later phases can label history
 * ("you", "Rahul", "Claude") and offer per-origin undo.
 */

export type ItemKind = "place" | "note" | "checklist";
export interface CheckItem {
  id: string;
  text: string;
  done?: boolean;
}

export interface Item extends CostSplit {
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
  googlePlaceId?: string;
  /** Last Google details seen for this place (rating, hours, phone…), kept for offline use. */
  google?: import("./google").GoogleDetails & { fetchedAt: number };
  /** Entry fee, meal, tickets… counted in the budget. Currency defaults to the trip's. */
  cost?: number;
  costCurrency?: string;
  /** Photo shown on the card and the pin popup (URL + credit only). */
  image?: import("./images").PlaceImage;
  /** How you get here from the previous stop of the day; falls back to the trip default. */
  travelMode?: import("./routing").TravelMode;
  /** The forwarded email (inbox row) this came from. */
  inboxId?: string;
  /** Imported stop whose pin came from the careful booking lookup (older imports get re-checked once). */
  located?: boolean;
  /** Checklist rows (kind "checklist"); the item's name is the checklist title. */
  checks?: CheckItem[];
  createdAt: number;
}

export interface TripMeta {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  center?: [number, number];
  /** ISO country of the destination (lowercase); keeps place lookups in-country. */
  countryCode?: string;
  /** Cover photo for the trip header. */
  cover?: import("./images").PlaceImage;
  /** Default way of getting between stops (Wanderlog defaults to driving). */
  travelMode?: import("./routing").TravelMode;
  /** Budget: everything is totalled in this currency (ISO code, e.g. "CAD"). */
  currency?: string;
  budget?: number;
  /** People splitting costs; the first is "you". */
  travelers?: string[];
  /** Names as bookings print them → the trip person they are ("aditya jain" → "Me"). */
  travelerAliases?: Record<string, string>;
  /** Custom subheading per day/list (e.g. "Osaka" under a day), keyed by section key. */
  subtitles?: Record<string, string>;
  /** Day colours picked by hand, by ISO date. Others use defaultDayColor. */
  dayColors?: Record<string, string>;
  /** Travel mode for the leg back to the hotel, per day section. */
  hotelLegModes?: Record<string, import("./routing").TravelMode>;
}

export type ReservationType = "flight" | "lodging" | "car" | "train" | "restaurant" | "other";

/** Wanderlog-style booking: lives in its own tab and shows as chips on the matching days. */
export interface TravelEnd {
  q: string;
  lat: number;
  lng: number;
  tz?: string;
}

export interface Reservation extends CostSplit {
  id: string;
  type: ReservationType;
  title: string; // "AC1 Toronto → Tokyo", "Hotel Granvia Kyoto"
  confirmation?: string;
  startDate?: string; // depart / check-in / pickup / reservation date
  startTime?: string;
  endDate?: string; // arrive / check-out / drop-off
  endTime?: string;
  from?: string; // flights, trains, car pickup location
  to?: string; // destination, car drop-off location
  /** Where from/to are (looked up in the background for trains, buses and cars) with their time
   *  zone, so long-distance rides sort by real time. `q` is the text it was looked up from. */
  fromAt?: TravelEnd;
  toAt?: TravelEnd;
  address?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  cost?: number;
  costCurrency?: string;
  /** Who it's for (passenger / guest), when each traveller has their own booking. */
  traveler?: string;
  /** The forwarded email (inbox row) this came from, so deleting the email can remove it. */
  inboxId?: string;
  createdAt: number;
}

/** By date and time (flights by real departure instant); the same flight/booking stays together, one row per traveller (A–Z). */
export function sortReservations(list: Reservation[]): Reservation[] {
  const k = (r: Reservation) => `${r.startDate ?? "9999-99-99"} ${r.startTime ?? "99:99"}`;
  // Flights compare by when they really leave (each airport's time zone), once airports are loaded
  const when = new Map(list.map((r) => [r, travelInstant(r, "dep")]));
  return [...list].sort(
    (a, b) =>
      (when.get(a) != null && when.get(b) != null ? when.get(a)! - when.get(b)! : k(a).localeCompare(k(b))) ||
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
      (a.traveler ?? "").localeCompare(b.traveler ?? "", undefined, { sensitivity: "base" }) ||
      a.createdAt - b.createdAt,
  );
}

export type ExpenseCategory =
  | "flights"
  | "lodging"
  | "car"
  | "transit"
  | "food"
  | "drinks"
  | "sightseeing"
  | "activities"
  | "shopping"
  | "gas"
  | "groceries"
  | "other"
  /** legacy, read as "transit" */
  | "transport";

/** Budget overrides for a cost that lives on a stop or a reservation. */
export interface CostSplit {
  costCategory?: ExpenseCategory;
  costPaidBy?: string;
  /** Traveler names sharing it; missing = everyone. */
  costSplit?: string[];
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  date?: string;
  paidBy?: string;
  /** Traveler names sharing this cost; empty/missing = everyone. */
  splitWith?: string[];
  notes?: string;
  createdAt: number;
}

export interface ListMeta {
  id: string;
  title: string;
  order: string;
}

/** An alternative plan for one day ("forked" from the day or another draft). */
export interface DayDraft {
  id: string;
  date: string;
  name: string;
  createdAt: number;
}

export interface TripState {
  meta: TripMeta;
  lists: ListMeta[];
  drafts: DayDraft[];
  items: Item[];
  reservations: Reservation[];
  expenses: Expense[];
}

export type EditOrigin = { by: "me" | "remote" | "claude" | "email"; label?: string };
export const ME: EditOrigin = { by: "me" };

export const daySection = (date: string) => `day:${date}`;
export const listSection = (id: string) => `list:${id}`;
export const draftSection = (id: string) => `draft:${id}`;
export const isDraftSection = (section: string) => section.startsWith("draft:");

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
export async function deleteTrip(id: string, opts: { server: boolean; leave?: string }) {
  if (opts.leave) {
    // Someone else's trip: leave it (removes you from its people) rather than deleting it
    const res = await fetch(`/travelplanner/api/trips/${id}/members/${encodeURIComponent(opts.leave)}`, { method: "DELETE", credentials: "same-origin" }).catch(() => null);
    if (!res?.ok) throw new Error("Couldn't leave the trip — try again online");
  } else if (opts.server) {
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
  const reservations = records<Reservation>(doc, "reservations").sort((a, b) =>
    `${a.startDate ?? "9999"}${a.startTime ?? ""}`.localeCompare(`${b.startDate ?? "9999"}${b.startTime ?? ""}`),
  );
  const expenses = records<Expense>(doc, "expenses").sort(
    (a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.createdAt - a.createdAt,
  );
  const drafts = records<DayDraft>(doc, "drafts").sort((a, b) => a.createdAt - b.createdAt);
  return { meta, lists, drafts, items, reservations, expenses };
}

const records = <T,>(doc: Y.Doc, name: string) =>
  [...doc.getMap<Y.Map<unknown>>(name).entries()].map(([id, m]) => ({ ...(m.toJSON() as object), id }) as T);

/* ---- Reservations & expenses: flat maps of records, same CRDT-friendly shape as items ---- */

function upsert(doc: Y.Doc, name: string, id: string, data: Record<string, unknown>, origin: EditOrigin) {
  edit(
    doc,
    () => {
      const map = doc.getMap<Y.Map<unknown>>(name);
      let m = map.get(id);
      if (!m) {
        m = new Y.Map<unknown>();
        map.set(id, m);
      }
      for (const [k, v] of Object.entries(data)) {
        if (k === "id") continue;
        if (v === undefined || v === "" || v === null || (typeof v === "number" && Number.isNaN(v))) m.delete(k);
        else m.set(k, v);
      }
    },
    origin,
  );
}

export function saveReservation(doc: Y.Doc, r: Omit<Reservation, "id" | "createdAt"> & { id?: string; createdAt?: number }, origin: EditOrigin = ME) {
  const id = r.id ?? nanoid(10);
  upsert(doc, "reservations", id, { ...r, createdAt: r.createdAt ?? Date.now() }, origin);
  return id;
}

export const removeReservation = (doc: Y.Doc, id: string, origin: EditOrigin = ME) =>
  edit(doc, () => doc.getMap("reservations").delete(id), origin);

export function saveExpense(doc: Y.Doc, e: Omit<Expense, "id" | "createdAt"> & { id?: string; createdAt?: number }, origin: EditOrigin = ME) {
  const id = e.id ?? nanoid(10);
  upsert(doc, "expenses", id, { ...e, createdAt: e.createdAt ?? Date.now() }, origin);
  return id;
}

export const removeExpense = (doc: Y.Doc, id: string, origin: EditOrigin = ME) =>
  edit(doc, () => doc.getMap("expenses").delete(id), origin);

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
  /** Insert before the item currently at this position (default: append). */
  index?: number,
): string {
  const id = nanoid(10);
  const existing = itemsIn(doc, section);
  const i = index == null ? existing.length : Math.max(0, Math.min(index, existing.length));
  const order = generateKeyBetween(existing[i - 1]?.order ?? null, existing[i]?.order ?? null);
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

/** Two stops are the same place: same Google/OSM place, or the same name within ~150 m. */
export function samePlace(a: Item, b: Item) {
  if (a.kind !== "place" || b.kind !== "place") return false;
  if (a.googlePlaceId && a.googlePlaceId === b.googlePlaceId) return true;
  if (a.osmId && a.osmId === b.osmId) return true;
  const n = (x?: string) => (x ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (n(a.name) !== n(b.name)) return false;
  // Unpinned copies: same name and same address
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return n(a.address) === n(b.address);
  return Math.hypot((a.lat - b.lat) * 111_000, (a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180)) < 150;
}

/** Set (or clear) a stop's photo, and the same photo on every other stop at that place, in one undo step. */
export function setItemImage(doc: Y.Doc, id: string, image: Item["image"], origin: EditOrigin = ME) {
  const items = doc.getMap<Y.Map<unknown>>("items");
  const me = items.get(id)?.toJSON() as Item | undefined;
  if (!me) return;
  edit(
    doc,
    () => {
      for (const [k, m] of items.entries()) {
        if (k !== id && !samePlace(me, m.toJSON() as Item)) continue;
        if (image) m.set("image", image);
        else m.delete("image");
      }
    },
    origin,
  );
}

export function removeItem(doc: Y.Doc, id: string, origin: EditOrigin = ME) {
  edit(doc, () => doc.getMap("items").delete(id), origin);
}

/**
 * Remove whatever a forwarded email added: reservations/stops tagged with its inbox ids, plus
 * (for ones added before tagging existed) reservations with the same title and date.
 * Returns how many were removed.
 */
export function removeFromEmail(doc: Y.Doc, inboxIds: string[], legacy: { title: string; startDate?: string }[] = []) {
  const ids = new Set(inboxIds);
  const res = doc.getMap<Y.Map<unknown>>("reservations");
  const items = doc.getMap<Y.Map<unknown>>("items");
  const gone: [Y.Map<Y.Map<unknown>>, string][] = [];
  for (const [id, m] of res) {
    const r = m.toJSON() as Reservation;
    if ((r.inboxId && ids.has(r.inboxId)) || (!r.inboxId && legacy.some((l) => l.title === r.title && (l.startDate ?? "") === (r.startDate ?? "")))) gone.push([res, id]);
  }
  for (const [id, m] of items) if (ids.has((m.toJSON() as Item).inboxId ?? "")) gone.push([items, id]);
  if (gone.length) edit(doc, () => gone.forEach(([map, id]) => map.delete(id)));
  return gone.length;
}

/** Remove several items in one undoable change. */
export function removeItems(doc: Y.Doc, ids: string[], origin: EditOrigin = ME) {
  edit(doc, () => ids.forEach((id) => doc.getMap("items").delete(id)), origin);
}

/** Append items to the end of `section`, keeping their current relative order. */
export function moveItems(doc: Y.Doc, ids: string[], section: string, origin: EditOrigin = ME) {
  const items = doc.getMap<Y.Map<unknown>>("items");
  const picked = [...items.values()].map((m) => m.toJSON() as Item).filter((i) => ids.includes(i.id)).sort(sortForMove);
  edit(
    doc,
    () => {
      let last = itemsIn(doc, section).filter((i) => !ids.includes(i.id)).at(-1)?.order ?? null;
      for (const it of picked) {
        last = generateKeyBetween(last, null);
        const m = items.get(it.id)!;
        m.set("section", section);
        m.set("order", last);
      }
    },
    origin,
  );
}

/** Duplicate items onto the end of `section` (new ids; photos, notes, costs copied). */
export function copyItems(doc: Y.Doc, ids: string[], section: string, origin: EditOrigin = ME): string[] {
  const items = doc.getMap<Y.Map<unknown>>("items");
  const picked = [...items.values()].map((m) => m.toJSON() as Item).filter((i) => ids.includes(i.id)).sort(sortForMove);
  const out: string[] = [];
  edit(
    doc,
    () => {
      let last = itemsIn(doc, section).at(-1)?.order ?? null;
      for (const it of picked) {
        last = generateKeyBetween(last, null);
        const id = nanoid(10);
        const m = new Y.Map<unknown>();
        for (const [k, v] of Object.entries({ ...it, id, section, order: last, createdAt: Date.now() })) if (v !== undefined) m.set(k, v);
        items.set(id, m);
        out.push(id);
      }
    },
    origin,
  );
  return out;
}

/* ---- Day drafts: fork a day, edit the copy, compare, then make one the day's plan ---- */

/** Copy the stops of `fromSection` (the day, or another draft) into a new draft for `date`. */
export function forkDay(doc: Y.Doc, date: string, fromSection: string, name: string, origin: EditOrigin = ME): string {
  const id = nanoid(8);
  const items = doc.getMap<Y.Map<unknown>>("items");
  edit(
    doc,
    () => {
      const d = new Y.Map<unknown>();
      d.set("date", date);
      d.set("name", name);
      d.set("createdAt", Date.now());
      doc.getMap<Y.Map<unknown>>("drafts").set(id, d);
      for (const it of itemsIn(doc, fromSection)) {
        const m = new Y.Map<unknown>();
        const copy = { ...it, id: nanoid(10), section: draftSection(id), createdAt: Date.now() };
        for (const [k, v] of Object.entries(copy)) if (v !== undefined) m.set(k, v);
        items.set(copy.id, m);
      }
    },
    origin,
  );
  return id;
}

export function renameDraft(doc: Y.Doc, id: string, name: string, origin: EditOrigin = ME) {
  const d = doc.getMap<Y.Map<unknown>>("drafts").get(id);
  if (d && name.trim()) edit(doc, () => d.set("name", name.trim()), origin);
}

/** Throw a draft away, with its stops. */
export function deleteDraft(doc: Y.Doc, id: string, origin: EditOrigin = ME) {
  const items = doc.getMap<Y.Map<unknown>>("items");
  edit(
    doc,
    () => {
      for (const it of itemsIn(doc, draftSection(id))) items.delete(it.id);
      doc.getMap("drafts").delete(id);
    },
    origin,
  );
}

/**
 * "Push to main": the draft's stops become the day's plan. The day's current stops are kept as a
 * draft (named `keepAs`) unless `keepAs` is empty, so nothing is lost; one undo step either way.
 */
export function adoptDraft(doc: Y.Doc, id: string, keepAs: string | null, origin: EditOrigin = ME) {
  const drafts = doc.getMap<Y.Map<unknown>>("drafts");
  const meta = drafts.get(id)?.toJSON() as DayDraft | undefined;
  if (!meta) return;
  const items = doc.getMap<Y.Map<unknown>>("items");
  const day = daySection(meta.date);
  edit(
    doc,
    () => {
      const current = itemsIn(doc, day);
      if (keepAs && current.length) {
        const keepId = nanoid(8);
        const d = new Y.Map<unknown>();
        d.set("date", meta.date);
        d.set("name", keepAs);
        d.set("createdAt", Date.now());
        drafts.set(keepId, d);
        for (const it of current) items.get(it.id)!.set("section", draftSection(keepId));
      } else for (const it of current) items.delete(it.id);
      for (const it of itemsIn(doc, draftSection(id))) items.get(it.id)!.set("section", day);
      drafts.delete(id);
    },
    origin,
  );
}

// Keep trip order when moving a selection that spans days: by section, then position
const sortForMove = (a: Item, b: Item) => (a.section === b.section ? byOrder(a, b) : a.section < b.section ? -1 : 1);

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

const TITLES = /\b(mr|mrs|ms|miss|mx|dr|prof|sir|madam|mstr|master)\b\.?/g;
/** "MR VISHAL MONTEIRO" → "vishal monteiro" (titles, punctuation and case dropped). */
export const travelerKey = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(TITLES, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Which of the trip's people a printed passenger/guest name is: a remembered alias, the same
 * name, or a person whose name's words all appear in it ("Vishal" ⊂ "Mr Vishal Monteiro").
 * Only an unambiguous match counts; otherwise the printed name is kept.
 */
export function matchTraveler(raw: string | undefined, travelers: string[], aliases: Record<string, string> = {}): string | undefined {
  if (!raw?.trim()) return raw;
  const key = travelerKey(raw);
  if (aliases[key] && travelers.includes(aliases[key])) return aliases[key];
  const exact = travelers.find((t) => travelerKey(t) === key);
  if (exact) return exact;
  const words = new Set(key.split(" "));
  const hits = travelers.filter((t) => {
    const tw = travelerKey(t).split(" ").filter(Boolean);
    return tw.length > 0 && tw.every((w) => words.has(w));
  });
  return hits.length === 1 ? hits[0] : raw.trim();
}
