import type { Expense, ExpenseCategory, Reservation, ReservationType, TripState } from "./trips";

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  flights: "Flights",
  lodging: "Lodging",
  transport: "Transport",
  food: "Food & drink",
  activities: "Activities",
  shopping: "Shopping",
  other: "Other",
};

const RES_CATEGORY: Record<ReservationType, ExpenseCategory> = {
  flight: "flights",
  lodging: "lodging",
  car: "transport",
  train: "transport",
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
  expense?: Expense;
}

/** Expenses plus reservation costs, normalised into one list in the trip currency. */
export function budgetLines(state: TripState, convert: (a: number, c: string) => number | null): Line[] {
  const travelers = travelersOf(state);
  const tripCurrency = state.meta.currency ?? "CAD";
  const lines: Line[] = state.expenses.map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category,
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
      category: RES_CATEGORY[r.type],
      amount: r.cost,
      currency: cur,
      converted: convert(r.cost, cur),
      date: r.startDate,
      paidBy: travelers[0],
      splitWith: travelers,
      fromReservation: r,
    });
  }
  return lines.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
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
