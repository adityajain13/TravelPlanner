/** Just the field this needs, so the module stays free of Worker-only imports (and testable). */
type Booking = { traveler?: string; cost?: number; type?: string; title?: string; start_date?: string; start_time?: string };

/**
 * Safety net for one entry carrying several passengers ("Manish, Nishi", "A and B"): one copy per
 * person, the group price on the first copy only. Airline "JAIN/MANISH" names keep their slash.
 * Two single words split by a comma could be "Last, First", so they're split only when one of them
 * is (the first name of) someone on the trip.
 */
export function splitPassengers<B extends Booking>(bookings: B[], people: string[]): B[] {
  const firstNames = new Set(people.flatMap((p) => p.split(/\s+/)));
  return bookings.flatMap((b) => {
    const raw = b.traveler?.trim();
    if (!raw) return [b];
    const parts = raw.split(/\s*(?:;|\n|,|&|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return [b];
    const singleWords = parts.every((x) => !/\s/.test(x));
    const twoByComma = parts.length === 2 && raw.includes(",") && !/;|&|\band\b/i.test(raw);
    if (twoByComma && singleWords && !parts.some((x) => firstNames.has(x.toLowerCase()))) return [b];
    return parts.map((name, i) => ({ ...b, traveler: name, ...(i > 0 ? { cost: undefined } : {}) }));
  });
}

/**
 * One booking for several people where one copy got the group total and the others their share
 * ($2,138.16 vs $1,069.08 for two): the total becomes the share, so the budget isn't counted 1.5×.
 */
export function evenGroupCosts<B extends Booking>(bookings: B[]): B[] {
  const groups = new Map<string, B[]>();
  for (const b of bookings) {
    const k = `${b.type}|${b.title}|${b.start_date}|${b.start_time}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(b);
  }
  for (const g of groups.values()) {
    const n = new Set(g.map((b) => (b.traveler ?? "").toLowerCase())).size;
    const costs = g.map((b) => b.cost).filter((c): c is number => c != null && c > 0);
    if (n < 2 || costs.length < 2) continue;
    const share = Math.min(...costs);
    const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, b * 0.01);
    for (const b of g) if (b.cost != null && !near(b.cost, share) && near(b.cost, share * n)) b.cost = share;
  }
  return bookings;
}
