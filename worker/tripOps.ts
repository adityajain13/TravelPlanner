import * as Y from "yjs";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";

/*
 * Server-side view of the trip doc, matching the schema in src/lib/trips.ts:
 *   meta: {title, destination, startDate, endDate, center?}
 *   lists: listId -> {title, order}
 *   items: itemId -> {kind, section ("day:YYYY-MM-DD" | "list:<id>"), order, name, ...}
 * Used by the Claude connector, so errors are written to be read by a model.
 */

export interface Item {
  id: string;
  kind: "place" | "note" | "checklist";
  section: string;
  order: string;
  name: string;
  notes?: string;
  startTime?: string;
  endTime?: string;
  lat?: number;
  lng?: number;
  address?: string;
  category?: string;
  osmId?: string;
  googlePlaceId?: string;
  cost?: number;
  costCurrency?: string;
  checks?: { id: string; text: string; done?: boolean }[];
  createdAt: number;
}

export interface Meta {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  center?: number[]; // [lng, lat]
  currency?: string;
  budget?: number;
  travelers?: string[];
  countryCode?: string;
}

export interface Section {
  key: string;
  label: string;
  items: Item[];
}

export interface Snapshot {
  meta: Meta;
  sections: Section[];
  outsideDates: Item[];
  reservations: Rec[];
  expenses: Rec[];
}

// Plain JSON shape so it survives Durable Object RPC serialization
export type Rec = { id: string; [k: string]: string | number | boolean | string[] | number[] | undefined };

export const RES_TYPES = ["flight", "lodging", "car", "train", "restaurant", "other"] as const;
export const EXPENSE_CATEGORIES = ["flights", "lodging", "car", "transit", "food", "drinks", "sightseeing", "activities", "shopping", "gas", "groceries", "other"] as const;

const recs = (doc: Y.Doc, name: string): Rec[] =>
  [...doc.getMap<Y.Map<unknown>>(name).entries()].map(([id, m]) => ({ ...(m.toJSON() as Omit<Rec, "id">), id }));

const byOrder = (a: { order: string }, b: { order: string }) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0);

function days(start: string, end: string): string[] {
  const out: string[] = [];
  if (!start || !end) return out;
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < 120; i++) {
    const s = d.toISOString().slice(0, 10);
    if (s > end) break;
    out.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const weekday = (date: string) =>
  new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

export function snapshot(doc: Y.Doc): Snapshot {
  const meta = doc.getMap("meta").toJSON() as Meta;
  const lists = [...doc.getMap<Y.Map<unknown>>("lists").entries()]
    .map(([id, m]) => ({ id, ...(m.toJSON() as { title: string; order: string }) }))
    .sort(byOrder);
  const items = [...doc.getMap<Y.Map<unknown>>("items").values()].map((m) => m.toJSON() as Item).sort(byOrder);

  const sections: Section[] = [
    ...lists.map((l) => ({ key: `list:${l.id}`, label: `List: ${l.title}`, items: [] as Item[] })),
    ...days(meta.startDate, meta.endDate).map((d, i) => ({ key: `day:${d}`, label: `Day ${i + 1} (${weekday(d)}, ${d})`, items: [] as Item[] })),
  ];
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const outsideDates: Item[] = [];
  for (const it of items) (byKey.get(it.section)?.items ?? outsideDates).push(it);
  const reservations = recs(doc, "reservations").sort((a, b) => String(a.startDate ?? "9999").localeCompare(String(b.startDate ?? "9999")));
  const expenses = recs(doc, "expenses").sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
  return { meta, sections, outsideDates, reservations, expenses };
}

/** Accepts "day 3", "3", "2026-12-03", a list name ("Places to visit"), or a raw section key. */
export function resolveSection(snap: Snapshot, input: string): string {
  const q = input.trim().toLowerCase();
  const exact = snap.sections.find((s) => s.key.toLowerCase() === q);
  if (exact) return exact.key;
  const dayN = q.match(/^(?:day\s*)?(\d{1,3})$/);
  const daySections = snap.sections.filter((s) => s.key.startsWith("day:"));
  if (dayN) {
    const s = daySections[Number(dayN[1]) - 1];
    if (s) return s.key;
  }
  const date = q.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (date) {
    const s = daySections.find((x) => x.key === `day:${date}`);
    if (s) return s.key;
  }
  const list = snap.sections.find((s) => s.key.startsWith("list:") && s.label.toLowerCase().replace(/^list:\s*/, "") === q.replace(/^list:\s*/, ""));
  if (list) return list.key;
  throw new Error(
    `Unknown section "${input}". Use "day N" (1–${daySections.length}), a date within the trip, or one of the lists: ${snap.sections
      .filter((s) => s.key.startsWith("list:"))
      .map((s) => `"${s.label.slice(6)}"`)
      .join(", ")}.`,
  );
}

function itemsIn(doc: Y.Doc, section: string, exclude?: string) {
  return [...doc.getMap<Y.Map<unknown>>("items").values()]
    .map((m) => m.toJSON() as Item)
    .filter((i) => i.section === section && i.id !== exclude)
    .sort(byOrder);
}

function orderAt(siblings: Item[], position?: number) {
  const i = position == null ? siblings.length : Math.max(0, Math.min(position - 1, siblings.length));
  return generateKeyBetween(siblings[i - 1]?.order ?? null, siblings[i]?.order ?? null);
}

export type ItemInput = Partial<Omit<Item, "id" | "section" | "order" | "createdAt">> & { name: string; kind: Item["kind"] };

export function addItem(doc: Y.Doc, section: string, data: ItemInput, position?: number): string {
  const id = nanoid(10);
  const order = orderAt(itemsIn(doc, section), position);
  const m = new Y.Map<unknown>();
  const full = { ...data, id, section, order, createdAt: Date.now() };
  for (const [k, v] of Object.entries(full)) if (v !== undefined && v !== null && v !== "") m.set(k, v);
  doc.getMap<Y.Map<unknown>>("items").set(id, m);
  return id;
}

function getItem(doc: Y.Doc, id: string) {
  const m = doc.getMap<Y.Map<unknown>>("items").get(id);
  if (!m) throw new Error(`No item with id "${id}". Call get_trip to see current item ids.`);
  return m;
}

export function updateItem(doc: Y.Doc, id: string, patch: Record<string, unknown>) {
  const m = getItem(doc, id);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null || v === "") m.delete(k);
    else m.set(k, v);
  }
}

export function moveItem(doc: Y.Doc, id: string, section: string, position?: number) {
  const m = getItem(doc, id);
  m.set("order", orderAt(itemsIn(doc, section, id), position));
  m.set("section", section);
}

export function removeItem(doc: Y.Doc, id: string) {
  getItem(doc, id);
  doc.getMap("items").delete(id);
}

export function updateMeta(doc: Y.Doc, patch: Partial<Meta>) {
  const m = doc.getMap("meta");
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && v !== "") m.set(k, v);
}

/** Compact, model-friendly rendering of the trip. */
export function render(snap: Snapshot, role: string): string {
  const { meta } = snap;
  const lines = [
    `# ${meta.title}`,
    `Destination: ${meta.destination || "—"} · Dates: ${meta.startDate} → ${meta.endDate} · Your access: ${role}`,
    "",
  ];
  const fmt = (it: Item, n: number) => {
    const bits = [
      it.kind === "note"
        ? `${n}. [note] ${it.name}`
        : it.kind === "checklist"
          ? `${n}. [checklist] ${it.name || "Checklist"}: ${(it.checks ?? []).map((c) => `${c.done ? "☑" : "☐"} ${c.text}`).join("; ")}`
          : `${n}. ${it.name}`,
      it.startTime ? `@ ${it.startTime}${it.endTime ? `–${it.endTime}` : ""}` : "",
      it.category ? `(${it.category})` : "",
    ].filter(Boolean);
    let s = `${bits.join(" ")}  {id: ${it.id}}`;
    if (it.address) s += `\n   ${it.address}`;
    if (it.lat != null) s += `\n   coords: ${it.lat.toFixed(5)}, ${it.lng!.toFixed(5)}`;
    if (it.cost != null) s += `\n   cost: ${it.cost} ${it.costCurrency ?? meta.currency ?? "CAD"}`;
    if (it.notes) s += `\n   notes: ${it.notes.replace(/\n/g, " / ")}`;
    return s;
  };
  for (const s of snap.sections) {
    lines.push(`## ${s.label}`);
    lines.push(s.items.length ? s.items.map((it, i) => fmt(it, i + 1)).join("\n") : "(empty)");
    lines.push("");
  }
  if (snap.reservations.length) {
    lines.push("## Reservations");
    for (const r of snap.reservations) {
      const span = [r.startDate && `${r.startDate}${r.startTime ? ` ${r.startTime}` : ""}`, r.endDate && `${r.endDate}${r.endTime ? ` ${r.endTime}` : ""}`].filter(Boolean).join(" → ");
      lines.push(
        `- [${r.type}] ${r.title}${r.from || r.to ? ` (${[r.from, r.to].filter(Boolean).join(" → ")})` : ""}${span ? ` · ${span}` : ""}${r.confirmation ? ` · conf ${r.confirmation}` : ""}${r.cost != null ? ` · ${r.cost} ${r.costCurrency ?? meta.currency ?? ""}` : ""}  {id: ${r.id}}`,
      );
    }
    lines.push("");
  }
  if (snap.expenses.length) {
    lines.push(`## Expenses (trip currency ${meta.currency ?? "CAD"}${meta.budget ? `, budget ${meta.budget}` : ""})`);
    for (const e of snap.expenses) lines.push(`- ${e.date ?? ""} ${e.title}: ${e.amount} ${e.currency} [${e.category}]${e.paidBy ? ` paid by ${e.paidBy}` : ""}  {id: ${e.id}}`);
    lines.push("");
  }
  if (snap.outsideDates.length) {
    lines.push("## Outside trip dates");
    lines.push(snap.outsideDates.map((it, i) => fmt(it, i + 1)).join("\n"));
  }
  return lines.join("\n");
}

export type Op =
  | { type: "add"; section: string; item: ItemInput; position?: number }
  | { type: "update"; id: string; patch: Record<string, unknown> }
  | { type: "move"; id: string; section: string; position?: number }
  | { type: "remove"; id: string }
  | { type: "meta"; patch: Partial<Meta> }
  | { type: "addMany"; items: { section: string; item: ItemInput }[] }
  | { type: "updateMany"; updates: { id: string; patch: Record<string, unknown> }[] }
  | { type: "addRecords"; map: "reservations" | "expenses"; records: Omit<Rec, "id">[] };

/** Apply one op; returns the affected item (or null for meta/remove). */
export function applyOp(doc: Y.Doc, op: Op): Item | null {
  const snap = snapshot(doc);
  if (!snap.meta.title) throw new Error("This trip has no data on the server yet. Open it once in the app while online so it syncs.");
  let id: string | null = null;
  switch (op.type) {
    case "add":
      id = addItem(doc, resolveSection(snap, op.section), op.item, op.position);
      break;
    case "updateMany":
      for (const u of op.updates) if (doc.getMap("items").has(u.id)) updateItem(doc, u.id, u.patch);
      break;
    case "addRecords": {
      const map = doc.getMap<Y.Map<unknown>>(op.map);
      for (const r of op.records) {
        const m = new Y.Map<unknown>();
        for (const [k, v] of Object.entries({ ...r, createdAt: Date.now() } as Record<string, unknown>)) if (v !== undefined && v !== null && v !== "") m.set(k, v);
        map.set(nanoid(10), m);
      }
      break;
    }
    case "addMany": {
      // Resolve every section first so a bad one fails the whole batch before anything is written
      const keys = op.items.map((x) => resolveSection(snap, x.section));
      op.items.forEach((x, i) => addItem(doc, keys[i], x.item));
      break;
    }
    case "update":
      updateItem(doc, op.id, op.patch);
      id = op.id;
      break;
    case "move":
      moveItem(doc, op.id, resolveSection(snap, op.section), op.position);
      id = op.id;
      break;
    case "remove":
      removeItem(doc, op.id);
      break;
    case "meta":
      if (op.patch.startDate && op.patch.endDate && op.patch.endDate < op.patch.startDate) throw new Error("end_date is before start_date");
      updateMeta(doc, op.patch);
      break;
  }
  return id ? ((doc.getMap<Y.Map<unknown>>("items").get(id)?.toJSON() as Item) ?? null) : null;
}
