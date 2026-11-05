/** Just the field this needs, so the module stays free of Worker-only imports (and testable). */
type Booking = { traveler?: string; cost?: number };

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
