import type { CostSplit, Expense, ExpenseCategory, Item, Reservation, ReservationType, TripState } from "./trips";

export const CATEGORIES: ExpenseCategory[] = ["flights", "lodging", "car", "transit", "food", "drinks", "sightseeing", "activities", "shopping", "gas", "groceries", "other"];

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  flights: "Flights",
  lodging: "Lodging",
  car: "Car rental",
  transit: "Transit",
  transport: "Transit",
  food: "Food",
  drinks: "Drinks",
  sightseeing: "Sightseeing",
  activities: "Activities",
  shopping: "Shopping",
  gas: "Gas",
  groceries: "Groceries",
  other: "Other",
};

export const normCategory = (c?: ExpenseCategory): ExpenseCategory => (c === "transport" ? "transit" : c && c in CATEGORY_LABEL ? c : "other");

const RES_CATEGORY: Record<ReservationType, ExpenseCategory> = {
  flight: "flights",
  lodging: "lodging",
  car: "car",
  train: "transit",
  restaurant: "food",
  other: "other",
};

export interface Line {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  converted: number | null; // in trip currency
  date?: string;
  paidBy: string;
  splitWith: string[];
  fromReservation?: Reservation;
  fromItem?: boolean;
  item?: Item;
  expense?: Expense;
}

const people = (c: CostSplit, travelers: string[]) => {
  const split = c.costSplit?.filter((t) => travelers.includes(t));
  return { paidBy: c.costPaidBy && travelers.includes(c.costPaidBy) ? c.costPaidBy : travelers[0], splitWith: split?.length ? split : travelers };
};

/** Expenses plus reservation costs, normalised into one list in the trip currency. */
export function budgetLines(state: TripState, convert: (a: number, c: string) => number | null): Line[] {
  const travelers = travelersOf(state);
  const tripCurrency = state.meta.currency ?? "CAD";
  const lines: Line[] = state.expenses.map((e) => ({
    id: e.id,
    title: e.title,
    category: normCategory(e.category),
    amount: e.amount,
    currency: e.currency,
    converted: convert(e.amount, e.currency),
    date: e.date,
    paidBy: e.paidBy && travelers.includes(e.paidBy) ? e.paidBy : travelers[0],
    splitWith: e.splitWith?.filter((t) => travelers.includes(t)).length ? e.splitWith.filter((t) => travelers.includes(t)) : travelers,
    expense: e,
  }));
  for (const r of state.reservations) {
    if (!r.cost) continue;
    const cur = r.costCurrency ?? tripCurrency;
    lines.push({
      id: `res:${r.id}`,
      title: r.title,
      category: normCategory(r.costCategory ?? RES_CATEGORY[r.type]),
      amount: r.cost,
      currency: cur,
      converted: convert(r.cost, cur),
      date: r.startDate,
      ...people(r, travelers),
      fromReservation: r,
    });
  }
  for (const it of state.items) {
    if (it.cost == null) continue;
    const cur = it.costCurrency ?? tripCurrency;
    lines.push({
      id: `item:${it.id}`,
      title: it.name,
      category: normCategory(it.costCategory ?? itemCategory(it.category)),
      amount: it.cost,
      currency: cur,
      converted: convert(it.cost, cur),
      date: it.section.startsWith("day:") ? it.section.slice(4) : undefined,
      ...people(it, travelers),
      fromItem: true,
      item: it,
    });
  }
  return sortByItinerary(lines, state);
}

/**
 * Chronological, the way the trip happens: by date, then by time of day. Stops without a time
 * take the time of a neighbouring stop, so a day reads in itinerary order; untimed bookings close
 * the day. Undated last.
 */
function sortByItinerary(lines: Line[], state: TripState): Line[] {
  const pos = new Map<string, { idx: number; time: string }>();
  const byDay = new Map<string, Item[]>();
  for (const it of state.items) if (it.section.startsWith("day:")) (byDay.get(it.section) ?? byDay.set(it.section, []).get(it.section)!).push(it);
  for (const items of byDay.values()) {
    items.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    // untimed stops take the previous stop's time, else the next one's, else midday
    const next: string[] = [];
    for (let i = items.length - 1, t = "12:00"; i >= 0; i--) next[i] = t = items[i].startTime ?? t;
    let carry = "";
    items.forEach((it, idx) => {
      if (it.startTime) carry = it.startTime;
      pos.set(it.id, { idx, time: carry || next[idx] });
    });
  }
  const key = (l: Line) => {
    const p = l.item ? pos.get(l.item.id) : undefined;
    // bookings without a time (e.g. a hotel) go at the end of their day
    const time = p?.time ?? l.fromReservation?.startTime ?? "23:59";
    return { date: l.date ?? "9999-99-99", time, idx: p?.idx ?? -1, created: l.expense?.createdAt ?? l.fromReservation?.createdAt ?? 0 };
  };
  return lines
    .map((l) => ({ l, k: key(l) }))
    .sort((a, b) => a.k.date.localeCompare(b.k.date) || a.k.time.localeCompare(b.k.time) || a.k.idx - b.k.idx || a.k.created - b.k.created)
    .map((x) => x.l);
}

// OSM / Google-ish place types → budget categories, for costs typed on itinerary stops
const RULES: [RegExp, ExpenseCategory][] = [
  [/bar|pub|wine|brewery|beer|cocktail|izakaya|night ?club|sake/i, "drinks"],
  [/restaurant|cafe|café|food|bakery|ramen|sushi|meal|lunch|dinner|breakfast|dessert|ice cream|cheesecake|confection/i, "food"],
  [/supermarket|grocery|convenience|greengrocer/i, "groceries"],
  [/fuel|gas station|petrol|charging/i, "gas"],
  [/car rental|car$|rental/i, "car"],
  [/hotel|guest ?house|hostel|motel|apartment|lodg|ryokan|camp/i, "lodging"],
  [/airport|aerodrome|terminal/i, "flights"],
  [/station|ferry|bus|train|tram|subway|metro|taxi|parking/i, "transit"],
  [/shop|market|mall|store|boutique|department|gift/i, "shopping"],
  [/museum|castle|temple|shrine|monument|memorial|attraction|viewpoint|gallery|historic|church|cathedral|palace|tower|garden|park|waterfall|mountain|beach|national/i, "sightseeing"],
];
function itemCategory(category?: string): ExpenseCategory {
  if (!category) return "activities";
  return RULES.find(([re]) => re.test(category))?.[1] ?? "activities";
}

/** The budget line for one stop's cost (for opening its cost details from the itinerary). */
export function lineForItem(it: Item, state: TripState): Line {
  const travelers = travelersOf(state);
  const cur = it.costCurrency ?? state.meta.currency ?? "CAD";
  return {
    id: `item:${it.id}`,
    title: it.name,
    category: normCategory(it.costCategory ?? itemCategory(it.category)),
    amount: it.cost ?? 0,
    currency: cur,
    converted: null,
    ...people(it, travelers),
    fromItem: true,
    item: it,
  };
}

export const travelersOf = (state: TripState) => (state.meta.travelers?.length ? state.meta.travelers : ["Me"]);

export function totals(lines: Line[]) {
  const byCategory = new Map<ExpenseCategory, number>();
  let total = 0;
  let unconverted = 0;
  for (const l of lines) {
    if (l.converted == null) {
      unconverted++;
      continue;
    }
    total += l.converted;
    byCategory.set(l.category, (byCategory.get(l.category) ?? 0) + l.converted);
  }
  return { total, byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]), unconverted };
}

/** Net balance per traveler (+ = is owed) and the fewest transfers to settle up. */
export function settleUp(lines: Line[], travelers: string[]) {
  const bal = new Map(travelers.map((t) => [t, 0]));
  for (const l of lines) {
    if (l.converted == null || l.splitWith.length === 0) continue;
    bal.set(l.paidBy, (bal.get(l.paidBy) ?? 0) + l.converted);
    const share = l.converted / l.splitWith.length;
    for (const t of l.splitWith) bal.set(t, (bal.get(t) ?? 0) - share);
  }
  const creditors = [...bal].filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  const debtors = [...bal].filter(([, v]) => v < -0.005).sort((a, b) => a[1] - b[1]);
  const transfers: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(-debtors[i][1], creditors[j][1]);
    transfers.push({ from: debtors[i][0], to: creditors[j][0], amount: amt });
    debtors[i][1] += amt;
    creditors[j][1] -= amt;
    if (debtors[i][1] > -0.005) i++;
    if (creditors[j][1] < 0.005) j++;
  }
  return { balances: [...bal], transfers };
}
