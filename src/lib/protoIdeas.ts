// PROTOTYPE (proto/trip-focus): the ideas pool. Ideas are the places and rough notes in his lists (except
// prep lists); this file adds what the workflow needs on top: auto groups, votes, and the "why" note.
// Votes are stored on the item as `votes` (not in his Item type yet); the why note is his `notes` field,
// so it travels with the stop when the idea is put on a day.
import type * as Y from "yjs";
import { useEffect, useState } from "react";
import { distanceKm } from "./geocode";
import { updateItem, type Item, type Reservation } from "./trips";

export type Group = "food" | "sights" | "nature" | "experiences" | "shopping" | "other";
export const GROUP_LABEL: Record<Group, string> = {
  food: "Food & drink",
  sights: "Sights",
  nature: "Nature",
  experiences: "Experiences",
  shopping: "Shopping",
  other: "Other",
};
export const GROUP_ORDER: Group[] = ["sights", "food", "nature", "experiences", "shopping", "other"];

// From the place's OSM category when there is one, else its name. Order matters: first match wins.
const RULES: [Group, RegExp][] = [
  ["food", /restaurant|cafe|café|coffee|bar\b|pub|bakery|food|ramen|sushi|izakaya|udon|soba|tempura|yakitori|ichiran|afuri|market|eat|dining|brewery|sake/i],
  ["experiences", /teamlab|ghibli|studio|theme_park|show|theatre|theater|onsen|spa|class|tour|experience|karaoke|arcade|sky\b|observation/i],
  ["sights", /temple|shrine|castle|museum|memorial|palace|tower|skytree|gallery|attraction|monument|viewpoint|historic|-ji\b|dera|taisha|crossing|church|cathedral|station/i],
  ["nature", /park|garden|lake|mountain|forest|beach|path|grove|waterfall|river|valley|island|nature|monkey|zoo|trail|hike/i],
  ["shopping", /shop|mall|store|boutique|outlet|department/i],
];
export function groupOf(it: Item): Group {
  return (it as Item & { groupOverride?: Group }).groupOverride ?? autoGroupOf(it);
}
export const hasOwnGroup = (it: Item) => !!(it as Item & { groupOverride?: Group }).groupOverride;
/** The app's own guess, ignoring any category the user picked */
export function autoGroupOf(it: Item): Group {
  const text = `${it.category ?? ""} ${it.name}`;
  for (const [g, re] of RULES) if (re.test(text)) return g;
  return "other";
}

/** A rough idea: a thought or a link with no place yet */
export const isRough = (it: Item) => it.kind === "note";
export const isIdeaItem = (it: Item) => (it.kind === "place" && !it.waypoint) || it.kind === "note";

export const votesOf = (it: Item): string[] => ((it as Item & { votes?: string[] }).votes ?? []).filter(Boolean);

export function toggleVote(doc: Y.Doc, it: Item, who: string) {
  const cur = votesOf(it);
  const votes = cur.includes(who) ? cur.filter((v) => v !== who) : [...cur, who];
  updateItem(doc, it.id, { votes: votes.length ? votes : undefined } as Partial<Item>);
}

export const setWhy = (doc: Y.Doc, id: string, text: string) => updateItem(doc, id, { notes: text.trim() || undefined });

/** "@Maya said…" → text and mention parts, matching trip people case-insensitively */
export function mentionParts(text: string, people: string[]): { text: string; who?: string }[] {
  const out: { text: string; who?: string }[] = [];
  const re = /@([\p{L}\p{N}_-]+)/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const who = people.find((p) => p.toLowerCase() === m[1].toLowerCase());
    if (!who) continue;
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: `@${who}`, who });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export const URL_RE = /^https?:\/\/\S+$/i;

/* ---- Who added it, must-do, soft remove (stored on the item; not in his Item type yet) ---- */
type Extra = { votes?: string[]; addedBy?: string; mustDo?: boolean; removedBy?: string; groupOverride?: Group; interest?: Record<string, -1 | 0 | 1> };
const extra = (it: Item) => it as Item & Extra;
export const addedByOf = (it: Item) => extra(it).addedBy;

/* ---- How each person feels about an idea (the poll): 1 = Yes!, 0 = Sure, -1 = Not for me, missing = no answer ----
   Older 👍 votes read as Yes! until that person answers. Must-do is now derived: anyone said Yes!. */
export type Answer = -1 | 0 | 1 | null;
export function interestOf(it: Item, people: string[]): Record<string, Answer> {
  const saved = extra(it).interest ?? {};
  const votes = votesOf(it);
  return Object.fromEntries(people.map((p) => [p, p in saved ? saved[p] : votes.includes(p) ? 1 : null]));
}
export function setInterest(doc: Y.Doc, it: Item, who: string, a: Answer) {
  const cur = { ...(extra(it).interest ?? {}) };
  if (a === null) delete cur[who];
  else cur[who] = a;
  // A 👍 left over from before would otherwise come back as Yes! when the answer is cleared
  const votes = votesOf(it).filter((v) => v !== who);
  updateItem(doc, it.id, { interest: Object.keys(cur).length ? cur : undefined, votes: votes.length ? votes : undefined } as Partial<Item>);
}
export const isMustDo = (it: Item) => {
  const saved = extra(it).interest ?? {};
  return !!extra(it).mustDo || Object.values(saved).includes(1) || votesOf(it).some((v) => !(v in saved));
};
export const removedByOf = (it: Item) => extra(it).removedBy;
export const setExtra = (doc: Y.Doc, id: string, patch: Extra) => updateItem(doc, id, patch as Partial<Item>);

/* ---- Areas: ideas clustered by distance, named after the town they're in ---- */
const AREA_KM = 25;
export type Area = { key: string; center: [number, number]; ids: string[] };

/** Greedy clustering: each idea joins the first area whose centre is within 25 km */
export function clusterAreas(items: Item[]): Area[] {
  const areas: (Area & { sum: [number, number] })[] = [];
  for (const it of items) {
    if (it.lat == null || it.lng == null) continue;
    const at: [number, number] = [it.lng, it.lat];
    const a = areas.find((x) => distanceKm(x.center, at) <= AREA_KM);
    if (a) {
      a.ids.push(it.id);
      a.sum = [a.sum[0] + at[0], a.sum[1] + at[1]];
      a.center = [a.sum[0] / a.ids.length, a.sum[1] / a.ids.length];
    } else areas.push({ key: it.id, center: at, ids: [it.id], sum: at });
  }
  return areas.map(({ key, center, ids }) => ({ key, center, ids }));
}

// One reverse lookup per area, cached for the session (Photon, keyless)
const nameCache = new Map<string, string>();
const cacheKey = (c: [number, number]) => `${c[0].toFixed(1)},${c[1].toFixed(1)}`;
async function areaName(c: [number, number]): Promise<string | null> {
  const k = cacheKey(c);
  if (nameCache.has(k)) return nameCache.get(k)!;
  const res = await fetch(`https://photon.komoot.io/reverse?lon=${c[0]}&lat=${c[1]}&limit=1&lang=en`);
  if (!res.ok) return null;
  const p = ((await res.json()) as { features: { properties: Record<string, string> }[] }).features[0]?.properties;
  const name = p ? (p.city ?? p.town ?? p.village ?? p.county ?? p.state ?? null) : null;
  if (name) nameCache.set(k, name.replace(/ (City|Prefecture)$/, ""));
  return name ? nameCache.get(k)! : null;
}
export function useAreaNames(areas: Area[]): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const sig = areas.map((a) => cacheKey(a.center)).join("|");
  useEffect(() => {
    let live = true;
    (async () => {
      for (const a of areas) {
        const n = await areaName(a.center).catch(() => null);
        if (!live) return;
        if (n) setNames((m) => (m.get(cacheKey(a.center)) === n ? m : new Map(m).set(cacheKey(a.center), n)));
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return new Map(areas.map((a) => [a.key, names.get(cacheKey(a.center)) ?? nameCache.get(cacheKey(a.center)) ?? ""]));
}

/* ---- Near-duplicates while typing: existing ideas and stops whose names look like the text ---- */
const norm = (t: string) =>
  t
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const STOP_WORDS = new Set(["the", "a", "of", "and", "in", "at", "japan"]);
const tokens = (t: string) => norm(t).split(" ").filter((w) => w && !STOP_WORDS.has(w));
/** "nara park" ~ "Nara Park", "Nara Park Deer Area", "park nara"; not "Nara Hotel" */
export function looksLike(query: string, name: string): boolean {
  const q = norm(query);
  const n = norm(name);
  if (q.length < 3 || !n) return false;
  if (n.includes(q) || (q.includes(n) && n.length >= 4)) return true;
  const a = tokens(query);
  const b = new Set(tokens(name));
  if (!a.length || !b.size) return false;
  const hit = a.filter((w) => b.has(w) || [...b].some((x) => x.startsWith(w) && w.length >= 3)).length;
  return hit / Math.min(a.length, b.size) >= 0.75 && hit >= Math.min(2, a.length);
}

/** "Kyoto, Japan": the town from the address when there is one, else the idea's area, plus the country */
export function placeLine(it: Item, area: string | undefined, country: string | undefined): string {
  const parts = (it.address ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const town = parts.length >= 3 ? parts[parts.length - 3] : parts.length ? parts[0] : area;
  const ctry = parts.length >= 2 ? parts[parts.length - 1] : country;
  return [town?.replace(/ (City|Prefecture)$/, ""), ctry].filter(Boolean).join(", ");
}

/* ---- Booking state: does the trip have a booking for this idea? ---- */
export type BookingState =
  | { kind: "none" }
  | { kind: "needed" }
  | { kind: "booked"; res: Reservation; date?: string; time?: string };

/** A booking matches an idea when it's at the same spot (within ~300 m) or its title names the place */
export function bookingFor(it: Item, reservations: Reservation[]): Reservation | undefined {
  return reservations.find((r) => {
    if (r.type === "flight" || r.type === "car" || r.type === "train") return false;
    if (r.lat != null && r.lng != null && it.lat != null && it.lng != null && distanceKm([r.lng, r.lat], [it.lng, it.lat]) < 0.3) return true;
    return looksLike(it.name, r.title);
  });
}
export function bookingState(it: Item, reservations: Reservation[], needsBooking: boolean): BookingState {
  const res = bookingFor(it, reservations);
  if (res) return { kind: "booked", res, date: res.startDate, time: res.startTime };
  return needsBooking ? { kind: "needed" } : { kind: "none" };
}
