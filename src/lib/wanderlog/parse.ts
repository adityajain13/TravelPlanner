/*
 * Wanderlog "Print this trip" PDF → structured trip. No AI: it reads pdf.js text items with
 * their positions and font sizes, which follow a stable layout:
 *   h≈27  trip title / "Itinerary" / "Budgeting"      h≈18  section + day headings
 *   x≈217 stop number, x≈236 stop name (h12)           x≈237 descriptions + your notes
 *   h≈9   travel times, day totals, "to/from X"        x≈222 reservation echo rows in days
 * The year isn't printed, so it's inferred from the weekday on the day headings.
 */

import type { ExpenseCategory, Reservation } from "../trips";

export interface RawItem {
  str: string;
  x: number;
  y: number;
  h: number;
}

interface Seg {
  x: number;
  h: number;
  s: string;
}

interface Line {
  page: number;
  y: number;
  segs: Seg[];
  text: string;
  x: number;
  h: number;
}

export interface ParsedStop {
  name: string;
  /** Day-level text that isn't a numbered place. */
  note?: boolean;
  notes?: string;
  cost?: number;
}

export interface ParsedExpense {
  title: string;
  amount: number;
  date?: string;
  category: ExpenseCategory;
}

export type ParsedReservation = Omit<Reservation, "id" | "createdAt">;

export interface WanderlogTrip {
  title: string;
  year: number;
  startDate: string;
  endDate: string;
  currencySymbol: string;
  reservations: ParsedReservation[];
  days: { date: string; stops: ParsedStop[] }[];
  lists: { title: string; stops: ParsedStop[] }[];
  expenses: ParsedExpense[];
  warnings: string[];
}

/* ---------- text helpers ---------- */

// Ligature glyphs without a Unicode mapping come through as \0. Most are "ff"; a few words need "ft".
const FT_WORDS = /^(gift|gifts|craft|crafts|crafted|aft|after|afternoon|left|loft|lofts|soft|shaft|raft|draft|swift|lift|lifts|shift|theft|tuft|drift|rift|sift|oft|often)$/i;
export function fixLigatures(s: string) {
  if (!s.includes("\u0000")) return s;
  return s.replace(/[\p{L}\u0000]+/gu, (word) => {
    if (!word.includes("\u0000")) return word;
    const ft = word.replace(/\u0000/g, "ft");
    return FT_WORDS.test(ft) ? ft : word.replace(/\u0000/g, "ff");
  });
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthIdx = (m: string) => MONTHS.findIndex((x) => x.startsWith(m.toLowerCase().slice(0, 3)));
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const pad = (n: number) => String(n).padStart(2, "0");

function to24h(t?: string) {
  const m = t?.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return undefined;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return `${pad(h)}:${m[2]}`;
}

const money = (s: string) => {
  const m = s.match(/^(?:[A-Z]{0,3})?([$€£¥₩₹])\s?([\d,]+(?:\.\d+)?)$/);
  return m ? { symbol: m[1], amount: Number(m[2].replace(/,/g, "")) } : null;
};

const DAY_RE = /^(sun|mon|tues|wednes|thurs|fri|satur)day, (\d{1,2})(?:st|nd|rd|th)? ([a-z]+)$/i;
// Travel-time rows ("21 min · 8.7 km", "< 1 min · 130 m"); "to/from X" rows are small text and skipped by size
const TRAVEL_RE = /^(<\s*)?\d+\s*(hrs?|mins?)\b.*·.*\b(km|mi|m|ft)$/i;
const DESC_START_RE = /^(From the web:|Open 24 hours|Open \d|Opens |Closed|Hours:)/;
const HINTS = new Set(["Consider booking ahead", "Plan airport transit", "Popular", "Book now", "Reserve a table"]);
const RES_SECTIONS: Record<string, Reservation["type"]> = {
  flights: "flight",
  "hotels and lodging": "lodging",
  lodging: "lodging",
  "rental cars": "car",
  "car rentals": "car",
  restaurants: "restaurant",
  "trains and buses": "train",
  transit: "train",
  other: "other",
  "other reservations": "other",
};
const SKIP_SECTIONS = new Set(["attachments", "notes", "expenses"]);

/* ---------- layout → lines ---------- */

function toLines(pages: RawItem[][]): Line[] {
  const out: Line[] = [];
  pages.forEach((items, pi) => {
    const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; segs: Seg[] }[] = [];
    for (const it of sorted) {
      const l = lines.find((x) => Math.abs(x.y - it.y) <= 3);
      const seg = { x: it.x, h: it.h, s: fixLigatures(it.str.trim()) };
      if (l) l.segs.push(seg);
      else lines.push({ y: it.y, segs: [seg] });
    }
    for (const l of lines) {
      l.segs.sort((a, b) => a.x - b.x);
      const text = l.segs.map((s) => s.s).join(" ");
      // Browser print header/footer
      if (/wanderlog\.com\/plan|\s–\sWanderlog$/.test(text) || /^\d+ of \d+\b/.test(text)) continue;
      // Repeated trip date stamp ("1/12 - 7/12") next to headings
      if (/^\d{1,2}\/\d{1,2}\s*-\s*\d{1,2}\/\d{1,2}$/.test(text)) continue;
      out.push({ page: pi, y: l.y, segs: l.segs, text, x: l.segs[0].x, h: Math.max(...l.segs.map((s) => s.h)) });
    }
  });
  return out;
}

/* ---------- main ---------- */

interface Block {
  name: string;
  lines: Line[];
}

interface Dates {
  iso: (day: number, month: number) => string;
  shortDate: (s: string) => string | undefined;
}

/** What the section readers fill in as they go. */
interface Sections {
  currencySymbol: string;
  reservations: ParsedReservation[];
  days: WanderlogTrip["days"];
  lists: WanderlogTrip["lists"];
  expenses: ParsedExpense[];
}

export function parseWanderlog(pages: RawItem[][], yearOverride?: number): WanderlogTrip {
  const lines = toLines(pages);
  const warnings: string[] = [];

  // Title: first big line
  const titleLine = lines.find((l) => l.h >= 22);
  const title = titleLine?.text ?? "Imported trip";

  const blocks = groupBlocks(lines, titleLine);

  // Year from weekday + date on day headings
  const dayHeads = lines.filter((l) => DAY_RE.test(l.segs[0].s)).map((l) => l.segs[0].s.match(DAY_RE)!);
  const year = yearOverride ?? inferYear(dayHeads);
  if (!yearOverride && dayHeads.length === 0) warnings.push("No day headings found, so the year is a guess.");
  const dates = makeDates(year);

  const out: Sections = { currencySymbol: "$", reservations: [], days: [], lists: [], expenses: [] };
  for (const b of blocks) readSection(b, out, dates);
  const { reservations, days } = out;
  const expenses = reconcileExpenses(out.expenses, reservations, days);

  const allDates = [...days.map((d) => d.date), ...reservations.flatMap((r) => [r.startDate, r.endDate]).filter((d): d is string => !!d)].sort();
  return {
    title,
    year,
    startDate: days[0]?.date ?? allDates[0] ?? `${year}-01-01`,
    endDate: days.at(-1)?.date ?? allDates.at(-1) ?? `${year}-01-01`,
    currencySymbol: out.currencySymbol,
    reservations,
    days,
    lists: out.lists,
    expenses,
    warnings,
  };
}

/** Group lines under section headings (h≥16, excluding day headings and money totals). */
function groupBlocks(lines: Line[], titleLine: Line | undefined): Block[] {
  const blocks: Block[] = [];
  let cur: Block = { name: "_header", lines: [] };
  for (const l of lines) {
    if (l === titleLine) continue;
    const isHeading = l.h >= 16 && l.segs[0].h >= 16 && !DAY_RE.test(l.segs[0].s) && !money(l.segs[0].s);
    if (isHeading) {
      blocks.push(cur);
      cur = { name: l.segs[0].s.trim(), lines: [] };
    } else cur.lines.push(l);
  }
  blocks.push(cur);
  return blocks;
}

function makeDates(year: number): Dates {
  const iso = (day: number, month: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
  const shortDate = (s: string) => {
    const m = s.match(/(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]{3,})/);
    if (!m) return undefined;
    const mi = monthIdx(m[2]);
    return mi >= 0 ? iso(Number(m[1]), mi) : undefined;
  };
  return { iso, shortDate };
}

function readSection(b: Block, out: Sections, dates: Dates) {
  const key = b.name.toLowerCase();
  if (RES_SECTIONS[key]) readReservations(b.lines, RES_SECTIONS[key], out, dates.shortDate);
  else if (key === "itinerary") readItinerary(b.lines, out.days, dates.iso);
  else if (key === "expenses") readExpenseBlock(b.lines, out, dates.shortDate);
  // Budget headings are handled with the "Expenses" block that follows
  else if (key !== "_header" && key !== "budgeting" && key !== "budget" && !SKIP_SECTIONS.has(key)) readList(b, out.lists);
}

function readReservations(lines: Line[], type: Reservation["type"], out: Sections, shortDate: Dates["shortDate"]) {
  for (const entry of splitEntries(lines)) {
    const r = parseReservation(type, entry, shortDate);
    if (r) {
      if (r.symbol) out.currencySymbol = r.symbol;
      out.reservations.push(r.res);
    }
  }
}

function readItinerary(lines: Line[], days: Sections["days"], iso: Dates["iso"]) {
  parseStops(lines, (date) => {
    const m = date.match(DAY_RE);
    if (!m) return []; // stray lines before the first day heading: dropped
    const d = { date: iso(Number(m[2]), monthIdx(m[3])), stops: [] as ParsedStop[] };
    days.push(d);
    return d.stops;
  });
}

function readExpenseBlock(lines: Line[], out: Sections, shortDate: Dates["shortDate"]) {
  const r = parseExpenses(lines, shortDate);
  out.expenses = r.expenses;
  if (r.symbol) out.currencySymbol = r.symbol;
}

/** Any other heading with numbered places is a Wanderlog list ("Places to visit", …). */
function readList(b: Block, lists: Sections["lists"]) {
  const stops: ParsedStop[] = [];
  parseStops(b.lines, () => stops);
  if (stops.length) lists.push({ title: b.name, stops });
}

/** Budget clean-up: reservation costs are already counted; expenses named like a stop become its cost. */
function reconcileExpenses(expenses: ParsedExpense[], reservations: ParsedReservation[], days: Sections["days"]): ParsedExpense[] {
  const resCosts = reservations.map((r) => r.cost).filter((c): c is number => c != null);
  return expenses.filter((e) => {
    const i = resCosts.findIndex((c) => Math.abs(c - e.amount) < 0.01);
    if (i >= 0) {
      resCosts.splice(i, 1);
      return false;
    }
    const day = days.find((d) => d.date === e.date) ?? undefined;
    const pool = day ? [day.stops] : days.map((d) => d.stops);
    for (const stops of pool) {
      const stop = stops.find((s) => s.cost == null && s.name.toLowerCase() === e.title.toLowerCase());
      if (stop) {
        stop.cost = e.amount;
        return false;
      }
    }
    return true;
  });
}

function inferYear(heads: RegExpMatchArray[]): number {
  const now = new Date().getFullYear();
  if (!heads.length) return now;
  // Latest year (up to next year) where every heading's weekday matches its date
  for (let y = now + 1; y >= now - 30; y--) {
    const ok = heads.every((m) => {
      const d = new Date(Date.UTC(y, monthIdx(m[3]), Number(m[2])));
      return WEEKDAYS[d.getUTCDay()] === m[1].slice(0, 3).toLowerCase();
    });
    if (ok) return y;
  }
  return now;
}

/** Reservation entries are separated by a big vertical gap (or a page break). */
function splitEntries(lines: Line[]): Line[][] {
  const out: Line[][] = [];
  let curr: Line[] = [];
  let prev: Line | null = null;
  for (const l of lines) {
    if (prev && (l.page !== prev.page || prev.y - l.y > 34)) {
      if (curr.length) out.push(curr);
      curr = [];
    }
    curr.push(l);
    prev = l;
  }
  if (curr.length) out.push(curr);
  return out;
}

/** One reservation entry, split into its detail column (`left`) and the fields every type shares (`base`). */
interface ResCtx {
  lines: Line[];
  segs: Seg[];
  left: Seg[];
  base: ParsedReservation;
  shortDate: Dates["shortDate"];
}

function parseReservation(type: Reservation["type"], lines: Line[], shortDate: Dates["shortDate"]) {
  const segs = lines.flatMap((l) => l.segs);
  const left = segs.filter((s) => s.x < 400);
  const { cost, symbol, confirmation } = readPriceColumn(segs.filter((s) => s.x >= 400));
  const base = { type, cost, confirmation } as ParsedReservation;
  const ctx: ResCtx = { lines, segs, left, base, shortDate };
  const res = type === "flight" ? parseFlight(ctx) : type === "car" ? parseCar(ctx) : parseStay(ctx);
  return res ? { symbol, res } : null;
}

/** Right-hand column: the price (last one wins) and the line after "CONFIRMATION". */
function readPriceColumn(right: Seg[]) {
  let cost: number | undefined;
  let symbol: string | undefined;
  for (const s of right) {
    const m = money(s.s);
    if (m) {
      cost = m.amount;
      symbol = m.symbol;
    }
  }
  const ci = right.findIndex((s) => /CONFIRMATION/i.test(s.s));
  const confirmation = ci >= 0 ? right.slice(ci + 1).find((s) => !money(s.s))?.s : undefined;
  return { cost, symbol, confirmation };
}

function parseFlight({ lines, segs, left, base, shortDate }: ResCtx): ParsedReservation {
  const codes = left.filter((s) => /^[A-Z]{3}$/.test(s.s));
  const cities = lines.find((_l, i) => i > 0 && lines[i - 1].segs.some((s) => /^[A-Z]{3}$/.test(s.s)))?.segs.filter((s) => s.x < 400).map((s) => s.s) ?? [];
  const dl = left.find((s) => /^\w{3}, \d{1,2} \w{3} •/.test(s.s));
  const m = dl?.s.match(/^\w{3}, (\d{1,2} \w{3}) • (\d{1,2}:\d{2} [AP]M)(?: — (\d{1,2}:\d{2} [AP]M))?/);
  const plusDays = Number(segs.find((s) => /^\+\d$/.test(s.s))?.s.slice(1) ?? 0);
  const startDate = m ? shortDate(m[1]) : undefined;
  const flightNo = left.find((s) => /^[A-Z][A-Z\s.&'-]+ [A-Z0-9]{2}\s?\d{1,4}$/.test(s.s))?.s;
  return {
    ...base,
    title: flightTitle(flightNo, codes),
    from: codes[0] ? `${codes[0].s}${cities[0] ? ` (${cities[0]})` : ""}` : undefined,
    to: codes[1] ? `${codes[1].s}${cities[1] ? ` (${cities[1]})` : ""}` : undefined,
    startDate,
    startTime: to24h(m?.[2]),
    endDate: shiftDate(startDate, plusDays),
    endTime: to24h(m?.[3]),
  };
}

/** "ICELANDAIR FI 602" → "Icelandair FI 602" (airline title-cased, flight code untouched). */
function flightTitle(flightNo: string | undefined, codes: Seg[]) {
  const fm = flightNo?.match(/^(.*?)\s+([A-Z0-9]{2})\s?(\d{1,4})$/);
  const airline = fm?.[1].toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return fm ? `${airline} ${fm[2]} ${fm[3]}` : `${codes[0]?.s ?? "?"} → ${codes[1]?.s ?? "?"}`;
}

/** Arrival date: the departure date plus any "+N" day marker. */
function shiftDate(startDate: string | undefined, plusDays: number) {
  if (!(startDate && plusDays)) return startDate;
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
}

/** "Pick up: Sat, 3rd Dec • 9:00 AM" → regex match with the date and time. */
const rentalStamp = (s?: string) => s?.match(/:\s*\w{3}, (\d{1,2} \w{3}) • (\d{1,2}:\d{2} [AP]M)/);

function parseCar({ left, base, shortDate }: ResCtx): ParsedReservation | null {
  const name = left.find((s) => s.h >= 11 && !/^(Pick up|Drop off|Drop of)/i.test(s.s))?.s;
  const pick = left.findIndex((s) => /^Pick ?up:/i.test(s.s));
  const drop = left.findIndex((s) => /^Drop ?o\w*:/i.test(s.s));
  const p = rentalStamp(left[pick]?.s);
  const d = rentalStamp(left[drop]?.s);
  if (!name) return null;
  return {
    ...base,
    title: name,
    startDate: p ? shortDate(p[1]) : undefined,
    startTime: to24h(p?.[2]),
    from: pick >= 0 ? left[pick + 1]?.s : undefined,
    endDate: d ? shortDate(d[1]) : undefined,
    endTime: to24h(d?.[2]),
    to: drop >= 0 ? left[drop + 1]?.s : undefined,
    address: pick >= 0 ? left[pick + 1]?.s : undefined,
  };
}

// Lodging, restaurants, other: name / address / "Fri, 2nd Dec — Sat, 3rd Dec" (or a single date • time)
function parseStay({ left, base, shortDate }: ResCtx): ParsedReservation | null {
  const dateIdx = left.findIndex((s) => /^\w{3}, \d{1,2}(st|nd|rd|th)? \w{3}/.test(s.s));
  const name = left.find((s, i) => i !== dateIdx && s.h >= 11)?.s;
  if (!name) return null;
  const address = left.find((s, i) => i !== dateIdx && s.s !== name && s.h < 11)?.s;
  const ds = left[dateIdx]?.s ?? "";
  const [a, b] = ds.split(/\s+[—–-]\s+/);
  return {
    ...base,
    title: name,
    address,
    startDate: a ? shortDate(a) : undefined,
    startTime: to24h(a),
    endDate: b ? shortDate(b) : undefined,
    endTime: to24h(b),
  };
}

/** Numbered stops with notes; Wanderlog's own descriptions, hints and travel times are dropped. */
function parseStops(lines: Line[], onDay: (heading: string) => ParsedStop[]) {
  let stops: ParsedStop[] | null = null;
  let current: ParsedStop | null = null;
  let inDesc = false;
  let lastNoteLine: string | null = null; // possible orphaned name before a page break

  const addNote = (s: ParsedStop, text: string) => (s.notes = s.notes ? `${s.notes}\n${text}` : text);

  for (const l of lines) {
    const first = l.segs[0];
    if (DAY_RE.test(first.s)) {
      stops = onDay(first.s);
      current = null;
      inDesc = false;
      lastNoteLine = null;
      continue;
    }
    if (!stops) stops = onDay("");
    if (!/[\p{L}\p{N}]/u.test(l.text)) continue; // lone separators like "·"
    if (l.h <= 10 && !/^\d+$/.test(first.s)) continue; // travel times, totals, to/from
    if (TRAVEL_RE.test(l.text) && !/^\d+$/.test(first.s)) continue;

    // Numbered stop: "12 | Name"  (or "13 | 40 min · 46 km" when the name fell on the previous page)
    if (/^\d+$/.test(first.s) && first.x < 228) {
      const rest = l.segs.slice(1).filter((s) => s.h >= 11 && s.x >= 228);
      let name = rest.map((s) => s.s).join(" ").trim();
      if (!name && lastNoteLine && current?.notes?.endsWith(lastNoteLine)) {
        current.notes = current.notes.slice(0, -lastNoteLine.length).replace(/\n$/, "") || undefined;
        name = lastNoteLine;
      }
      if (!name) continue;
      current = { name };
      stops.push(current);
      inDesc = false;
      lastNoteLine = null;
      continue;
    }

    if (first.x < 228) continue; // reservation echo rows ("Farmhouse Lodge · Check in")
    if (!current) {
      // Text before the first numbered stop of a day: a day note
      if (!HINTS.has(l.text)) stops.push({ name: l.text, note: true });
      continue;
    }
    if (inDesc) {
      if (/[.!)]$/.test(l.text)) inDesc = false;
      continue;
    }
    if (DESC_START_RE.test(l.text)) {
      inDesc = !/[.!)]$/.test(l.text);
      continue;
    }
    if (HINTS.has(l.text)) continue;
    addNote(current, l.text);
    lastNoteLine = l.text;
  }
}

const CATEGORY: [RegExp, ExpenseCategory][] = [
  [/flight|airfare/i, "flights"],
  [/lodging|hotel|accommodation/i, "lodging"],
  [/car rental|rental car/i, "car"],
  [/gas|fuel|petrol/i, "gas"],
  [/grocer|supermarket/i, "groceries"],
  [/drink|bar|wine|beer/i, "drinks"],
  [/parking|transport|transit|taxi|train|bus|toll|car/i, "transit"],
  [/food|restaurant|dining|coffee/i, "food"],
  [/sightseeing|museum|tour/i, "sightseeing"],
  [/activit|entertain|ticket/i, "activities"],
  [/shop|souvenir/i, "shopping"],
];

function parseExpenses(lines: Line[], shortDate: (s: string) => string | undefined) {
  const expenses: ParsedExpense[] = [];
  let symbol: string | undefined;
  let curr: Partial<ParsedExpense> | null = null;
  const flush = () => {
    if (curr?.title && curr.amount != null) expenses.push({ category: "other", ...curr } as ParsedExpense);
    curr = null;
  };
  for (const l of lines) {
    if (/^Sort:/.test(l.text) || /^Sort: /.test(l.segs.at(-2)?.s ?? "")) continue;
    for (const s of l.segs) {
      const m = money(s.s);
      if (m) {
        if (curr) (curr.amount = m.amount), (symbol = m.symbol);
        continue;
      }
      if (s.h >= 12) {
        if (curr?.amount != null) flush();
        if (!curr) curr = { title: s.s };
        continue;
      }
      // detail line: "2 Dec • Activities" or just "Food"
      if (curr) {
        const [datePart, cat] = s.s.includes("•") ? s.s.split("•").map((x) => x.trim()) : [undefined, s.s];
        if (datePart) curr.date = shortDate(datePart);
        curr.category = CATEGORY.find(([re]) => re.test(cat ?? ""))?.[1] ?? "other";
        if (curr.amount != null) flush();
      }
    }
  }
  flush();
  return { expenses, symbol };
}
