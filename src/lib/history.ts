import * as Y from "yjs";
import { nanoid } from "nanoid";

/*
 * Edit history, stored inside the trip doc (the `history` array) so everyone on the trip sees the
 * same log and the Worker can log Claude's edits too. Each entry holds the JSON before and after
 * every record it touched, which is what makes any entry revertable later.
 *
 * This file is also bundled into the Worker, so it may import only yjs and nanoid.
 */

export const TRACKED = ["items", "lists", "meta", "reservations", "expenses", "drafts"] as const;
export type TrackedMap = (typeof TRACKED)[number];
export type HistoryBy = "me" | "claude" | "email";
export interface HistoryChange {
  map: TrackedMap;
  key: string; // record id (or the meta field name for map "meta")
  before: string | null; // JSON string of the value before; null = didn't exist
  after: string | null; // JSON string after; null = deleted
}
export interface HistoryEntry {
  id: string;
  at: number; // Date.now()
  by: HistoryBy;
  who?: string; // account email for "me", "Claude" for claude
  label?: string; // e.g. "Undo", "Revert", "Tidy notes", "Email"
  changes: HistoryChange[];
  revertOf?: string[]; // ids of entries this entry reverted
  revertedBy?: string; // set on an entry once it has been reverted
}
/** Origin of the log writes themselves: never logged again (no loops). */
export const HISTORY_ORIGIN = { by: "history" } as const;
export const historyArray = (doc: Y.Doc) => doc.getArray<HistoryEntry>("history");

const MERGE_MS = 60_000;
const KEEP = 250;

const json = (v: unknown): string => JSON.stringify(v instanceof Y.AbstractType ? v.toJSON() : v);

const watched = new WeakSet<Y.Doc>();
const authors = new WeakMap<Y.Doc, string>();
// Set by applyRevert, consumed by the next transaction's observer (the revert itself)
const pendingRevert = new WeakMap<Y.Doc, string[]>();

/** Who "me" edits belong to (the signed-in account's email). */
export function setHistoryAuthor(doc: Y.Doc, who: string | undefined) {
  if (who) authors.set(doc, who);
  else authors.delete(doc);
}
let signedIn: string | undefined;
/** The signed-in account, for edits on any trip (e.g. creating one on Home) before a page sets one. */
export function setDefaultHistoryAuthor(who: string | undefined) {
  signedIn = who;
}
const author = (doc: Y.Doc) => authors.get(doc) ?? signedIn;

interface Loggable {
  by: HistoryBy;
  who?: string;
  label?: string;
}

/** Which transactions become history entries; background and sync writes are not logged. */
function loggable(doc: Y.Doc, origin: unknown): Loggable | null {
  if (origin === "claude") return { by: "claude", who: "Claude" };
  if (origin instanceof Y.UndoManager) return { by: "me", who: author(doc), label: "Undo" };
  if (origin && typeof origin === "object" && "by" in origin) {
    const o = origin as { by: unknown; label?: string };
    if (o.by === "me" || o.by === "claude" || o.by === "email") {
      const by = o.by;
      return { by, who: by === "me" ? author(doc) : by === "claude" ? "Claude" : author(doc), label: o.label };
    }
  }
  return null;
}

/** Records touched by a transaction: top-level map keys, or a record's nested Y.Map. */
function touchedKeys(tr: Y.Transaction, tops: Map<Y.AbstractType<any>, TrackedMap>): [TrackedMap, string][] {
  const out: [TrackedMap, string][] = [];
  for (const [type, keys] of tr.changed) {
    const top = tops.get(type);
    if (top) {
      for (const k of keys) if (k !== null) out.push([top, k]);
      continue;
    }
    // Yjs internals: a nested record's Y.Map knows its parent map and its key in it
    const parentTop = tops.get((type as any).parent);
    const key = (type as any)._item?.parentSub as string | undefined;
    if (parentTop && key) out.push([parentTop, key]);
  }
  return out;
}

function mergeChanges(prev: HistoryChange[], next: HistoryChange[]): HistoryChange[] {
  const out = prev.map((c) => ({ ...c }));
  for (const n of next) {
    const i = out.findIndex((c) => c.map === n.map && c.key === n.key);
    if (i < 0) out.push(n);
    else out[i] = { ...out[i], after: n.after }; // keep the first "before"
  }
  return out.filter((c) => c.before !== c.after);
}

const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

function record(doc: Y.Doc, by: HistoryBy, who: string | undefined, label: string | undefined, changes: HistoryChange[], revertIds?: string[]) {
  const arr = historyArray(doc);
  const now = Date.now();
  if (revertIds) {
    const entry = clean({ id: nanoid(8), at: now, by, who, label: "Revert", changes, revertOf: revertIds });
    arr.toArray().forEach((e, i) => {
      if (!revertIds.includes(e.id)) return;
      arr.delete(i, 1);
      arr.insert(i, [{ ...e, revertedBy: entry.id }]);
    });
    arr.push([entry]);
  } else {
    const last = arr.length ? arr.get(arr.length - 1) : undefined;
    // Quick successive edits by the same person (typing, a drag) become one entry
    if (last && by === "me" && last.by === "me" && last.who === who && !last.revertOf && !last.revertedBy && now - last.at < MERGE_MS) {
      const merged = mergeChanges(last.changes, changes);
      arr.delete(arr.length - 1, 1);
      if (merged.length) arr.push([{ ...last, at: now, label: last.label ?? label, changes: merged }]);
    } else {
      arr.push([clean({ id: nanoid(8), at: now, by, who, label, changes })]);
    }
  }
  if (arr.length > KEEP) arr.delete(0, arr.length - KEEP);
}

/**
 * Logs every local change (and Claude's, which the Worker makes locally) in the doc itself, so it
 * syncs to everyone. Idempotent. Runs for remote updates too, to keep its cache of the last
 * known values exact.
 */
export function watchHistory(doc: Y.Doc) {
  if (watched.has(doc)) return;
  watched.add(doc);
  const cache = new Map<TrackedMap, Map<string, string>>(TRACKED.map((n) => [n, new Map()]));
  const tops = new Map<Y.AbstractType<any>, TrackedMap>(TRACKED.map((n) => [doc.getMap(n), n]));

  doc.on("afterTransaction", (tr: Y.Transaction) => {
    // The revert's own transaction is the one that comes right after applyRevert
    const revertIds = pendingRevert.get(doc);
    pendingRevert.delete(doc);

    const seen = new Set<string>();
    const changes: HistoryChange[] = [];
    for (const [map, key] of touchedKeys(tr, tops)) {
      const id = `${map}\u0000${key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const m = doc.getMap<any>(map);
      const mc = cache.get(map)!;
      const after = m.has(key) ? json(m.get(key)) : null;
      const before = mc.get(key) ?? null;
      if (after === null) mc.delete(key);
      else mc.set(key, after);
      if (before !== after) changes.push({ map, key, before, after });
    }

    if (!tr.local || !changes.length) return;
    const who = loggable(doc, tr.origin);
    if (!who) return;
    doc.transact(() => record(doc, who.by, who.who, revertIds ? "Revert" : who.label, changes, revertIds), HISTORY_ORIGIN);
  });
}

/**
 * Puts the records back to how they were before the given entries (newest first). Must run inside
 * a transaction; trips.ts wraps it with the REVERT origin, so the revert itself is logged and can
 * be undone with Ctrl+Z.
 */
export function applyRevert(doc: Y.Doc, entries: HistoryEntry[]) {
  pendingRevert.set(doc, entries.map((e) => e.id));
  const newest = [...entries].sort((a, b) => b.at - a.at);
  for (const e of newest) {
    for (const c of [...e.changes].reverse()) {
      const m = doc.getMap<any>(c.map);
      if (c.before === null) {
        m.delete(c.key);
        continue;
      }
      const value = JSON.parse(c.before);
      if (c.map === "meta") {
        m.set(c.key, value);
        continue;
      }
      // Still there: put back only the fields this change touched, so later edits to other
      // fields of the same record (someone's notes after Claude moved the stop) survive
      const cur = m.get(c.key);
      if (cur instanceof Y.Map && c.after !== null) {
        const after = JSON.parse(c.after) as Record<string, unknown>;
        for (const k of new Set([...Object.keys(value), ...Object.keys(after)])) {
          if (JSON.stringify(value[k]) === JSON.stringify(after[k])) continue;
          if (value[k] === undefined) cur.delete(k);
          else cur.set(k, value[k]);
        }
        continue;
      }
      const rec = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(value)) if (v !== undefined) rec.set(k, v);
      m.set(c.key, rec);
    }
  }
}

/** How many of the entry's changes no longer match what it left behind. */
export function changedSince(doc: Y.Doc, e: HistoryEntry): number {
  return e.changes.filter((c) => {
    const m = doc.getMap<any>(c.map);
    const now = m.has(c.key) ? json(m.get(c.key)) : null;
    return now !== c.after;
  }).length;
}

/* ---- Plain-language description of a change (pure, used by the History panel) ---- */

export interface ChangeView {
  verb: "added" | "removed" | "changed" | "moved";
  noun: string;
  name: string;
  fields: string[];
  toSection?: string;
}

const NOUN_BY_KIND: Record<string, string> = { place: "stop", note: "note", checklist: "checklist" };
const FIELD_LABEL: Record<string, string> = {
  startTime: "time",
  endTime: "time",
  stay: "duration",
  notes: "notes",
  cost: "cost",
  costCurrency: "cost",
  costCategory: "cost",
  costPaidBy: "cost",
  costSplit: "cost",
  image: "photo",
  lat: "location",
  lng: "location",
  address: "location",
  travelMode: "travel mode",
  checks: "checklist",
  who: "people",
  name: "name",
  title: "name",
  confirmation: "confirmation",
  startDate: "dates",
  endDate: "dates",
  amount: "amount",
  currency: "amount",
  traveler: "traveller",
  cover: "cover photo",
};
const INTERNAL = new Set(["order", "createdAt", "google", "located", "notesTidy", "inboxId", "osmId", "googlePlaceId", "fromAt", "toAt", "section"]);

const parseOrNull = (s: string | null) => (s === null ? null : (JSON.parse(s) as Record<string, any>));

function nounFor(map: TrackedMap, v: Record<string, any> | string): string {
  switch (map) {
    case "items":
      return NOUN_BY_KIND[(v as Record<string, any>).kind] ?? "stop";
    case "reservations":
      return "booking";
    case "expenses":
      return "expense";
    case "lists":
      return "section";
    case "drafts":
      return "plan";
    default:
      return "trip";
  }
}

export function describeChange(c: HistoryChange): ChangeView {
  const before = parseOrNull(c.before);
  const after = parseOrNull(c.after);
  const v = (after ?? before ?? {}) as Record<string, any>;
  const noun = nounFor(c.map, v);
  const rawName = c.map === "meta" ? c.key : c.map === "items" || c.map === "drafts" ? v.name : c.map === "reservations" || c.map === "expenses" || c.map === "lists" ? v.title : "";
  // Trip fields read as "Changed trip · dates" (a field being set for the first time is still a change)
  if (c.map === "meta") return { verb: "changed", noun: "trip", name: "", fields: [FIELD_LABEL[c.key] ?? c.key] };
  const name = String(rawName ?? "").trim() || "Untitled";

  let verb: ChangeView["verb"] = before === null ? "added" : after === null ? "removed" : "changed";
  let toSection: string | undefined;
  if (c.map === "items" && before && after && before.section !== after.section) {
    verb = "moved";
    toSection = after.section;
  }

  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  const fields = [...new Set(keys.filter((k) => !INTERNAL.has(k)).map((k) => FIELD_LABEL[k] ?? k))];

  return { verb, noun, name, fields, toSection };
}
