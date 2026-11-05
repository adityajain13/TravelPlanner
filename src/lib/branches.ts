import type { Item } from "./trips";

/*
 * Days where the group splits up. A place can be for some people only (`who`); no `who` = everyone.
 * Everyone's view shows the branches side by side; one person's view numbers just their stops.
 */

const isPlace = (it: Item) => it.kind === "place";
const isNumbered = (it: Item) => isPlace(it) && !it.waypoint;

/** Does a leg, stop or note with this `who` show in one person's view? Unset (or nobody listed) = everyone. */
export const visibleTo = (who: string[] | undefined, viewing?: string) => !viewing || !who?.length || who.includes(viewing);

/** Who goes to a place: its `who`, or everyone. Notes/checklists: everyone. */
export const goesTo = (it: Item, person: string) => visibleTo(it.who, person);

/** A place only some of the people go to. */
const partial = (it: Item, people: string[]) => isPlace(it) && !!it.who?.length && !people.every((p) => it.who!.includes(p));

/** Can sit inside a split run: a partial place, or something with no person (notes, checklists, waypoints nobody is set on). */
const inRun = (it: Item, people: string[]) => partial(it, people) || !isPlace(it) || (!!it.waypoint && !it.who?.length);

export const isSplitDay = (items: Item[], people: string[]) => people.length > 1 && items.some((it) => partial(it, people));

export type Segment = { kind: "shared"; items: Item[] } | { kind: "split"; columns: { who: string[]; items: Item[] }[] };

/**
 * A drop-off or pick-up made by withRides: a stop on the driver's route only, never written or numbered.
 * Not draggable and no card; its id is `drop:<place>` or `pick:<place>`.
 */
export const isRideStop = (it: Item) => !!it.rideKind;

/**
 * Adds the rides to a day's list. A place only some people go to can be driven there by someone
 * not in its `who`: a drop-off goes just before the place (on the driver's route), a pick-up after
 * the split run it sits in (where the riders are done). Used for routing and times only.
 */
export function withRides(items: Item[], people: string[]): Item[] {
  const before = new Map<number, Item[]>();
  const after = new Map<number, Item[]>();
  items.forEach((x, i) => {
    const r = x.ride;
    if (!r || !partial(x, people) || !people.includes(r.by) || x.who!.includes(r.by)) return;
    if (r.drop) (before.get(i) ?? before.set(i, []).get(i)!).push(rideStop(x, r.by, "drop"));
    if (r.pick) {
      // The run ends at its last partial place, as in segmentsOf
      let end = i;
      for (let k = i; k < items.length && inRun(items[k], people); k++) if (partial(items[k], people)) end = k;
      (after.get(end) ?? after.set(end, []).get(end)!).push(rideStop(x, r.by, "pick"));
    }
  });
  if (!before.size && !after.size) return items;
  const out: Item[] = [];
  items.forEach((it, i) => out.push(...(before.get(i) ?? []), it, ...(after.get(i) ?? [])));
  return out;
}

function rideStop(x: Item, by: string, kind: "drop" | "pick"): Item {
  return {
    id: `${kind}:${x.id}`,
    kind: "place",
    section: x.section,
    order: x.order,
    name: x.name,
    lat: x.lat,
    lng: x.lng,
    address: x.address,
    who: [by],
    waypoint: true,
    rideOf: x.id,
    rideKind: kind,
    rideWith: x.who,
    createdAt: 0,
  };
}

/** The day as runs: shared items in order, and split runs of side-by-side branches. */
export function segmentsOf(items: Item[], people: string[]): Segment[] {
  if (!isSplitDay(items, people)) return [{ kind: "shared", items }];
  const out: Segment[] = [];
  let shared: Item[] = [];
  let i = 0;
  while (i < items.length) {
    if (!partial(items[i], people)) {
      shared.push(items[i++]);
      continue;
    }
    // The run ends at its last partial place; trailing notes and the like go back to the shared list
    let end = i;
    for (let k = i; k < items.length && inRun(items[k], people); k++) if (partial(items[k], people)) end = k;
    if (shared.length) out.push({ kind: "shared", items: shared }), (shared = []);
    out.push({ kind: "split", columns: columnsOf(items.slice(i, end + 1), people) });
    i = end + 1;
  }
  if (shared.length) out.push({ kind: "shared", items: shared });
  return out;
}

/** Places grouped by who goes (first-appearance order); a non-place joins the column of the item before it. */
function columnsOf(run: Item[], people: string[]): { who: string[]; items: Item[] }[] {
  const cols = new Map<string, { who: string[]; items: Item[] }>();
  let last: string | undefined;
  for (const it of run) {
    let key = last;
    if (partial(it, people)) {
      key = it.who!.slice().sort().join("|");
      if (!cols.has(key)) cols.set(key, { who: it.who!, items: [] });
    }
    cols.get(key!)!.items.push(it);
    last = key;
  }
  return [...cols.values()];
}

/**
 * Number label per item id (absent = no number). Everyone: a split run's columns each number on from
 * where everyone left off, and the next shared stop follows the longest column. `viewing`: only that
 * person's stops are counted, in list order.
 */
export function stopLabels(items: Item[], people: string[], viewing?: string): Map<string, string> {
  const labels = new Map<string, string>();
  let n = 0;
  if (viewing) {
    for (const it of items) if (isNumbered(it) && goesTo(it, viewing)) labels.set(it.id, String(++n));
    return labels;
  }
  for (const seg of segmentsOf(items, people)) {
    if (seg.kind === "shared") {
      for (const it of seg.items) if (isNumbered(it)) labels.set(it.id, String(++n));
      continue;
    }
    let longest = 0;
    for (const col of seg.columns) {
      let c = n;
      for (const it of col.items) if (isNumbered(it)) labels.set(it.id, String(++c));
      longest = Math.max(longest, c - n);
    }
    n += longest;
  }
  return labels;
}

/** The legs (a Map by stop id) that one person's view shows. */
export function legsVisibleTo<T extends { who?: string[] }>(legs: Map<string, T> | undefined, viewing?: string) {
  if (!legs || !viewing) return legs;
  return new Map([...legs].filter(([, l]) => visibleTo(l.who, viewing)));
}
