// PROTOTYPE (proto/trip-focus): the ideas pool. Ideas are the places and rough notes in his lists (except
// prep lists); this file adds what the workflow needs on top: auto groups, votes, and the "why" note.
// Votes are stored on the item as `votes` (not in his Item type yet); the why note is his `notes` field,
// so it travels with the stop when the idea is put on a day.
import type * as Y from "yjs";
import { updateItem, type Item } from "./trips";

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
