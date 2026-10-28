import { dtf } from "../lib/intl";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { Line } from "../lib/budget";
import { CATEGORIES, CATEGORY_LABEL, shareOf, travelersOf } from "../lib/budget";
import { formatMoney } from "../lib/fx";
import { parseISODate } from "../lib/dates";
import { dayColor } from "../lib/colors";
import { CAT_COLOR } from "./Budget";
import type { ExpenseCategory, TripState } from "../lib/trips";

type Row = { key: string; label: string; sub?: string; color?: string; paid?: number; amount: number; count: number; parts: Map<ExpenseCategory, number> };
type Tab = "category" | "day" | "people";

const dayFmt = (d: string) => dtf(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(parseISODate(d));

/** Adds one line's amount to its row (creating the row on first use). */
function addLine(m: Map<string, Row>, key: string, init: () => Row, l: Line) {
  const r = m.get(key) ?? m.set(key, init()).get(key)!;
  r.amount += l.converted!;
  r.count++;
  r.parts.set(l.category, (r.parts.get(l.category) ?? 0) + l.converted!);
}

/** "Category" tab: one bar per category, biggest first. */
function categoryRows(counted: Line[]): Row[] {
  const m = new Map<string, Row>();
  for (const l of counted) addLine(m, l.category, () => ({ key: l.category, label: CATEGORY_LABEL[l.category], color: CAT_COLOR[l.category], amount: 0, count: 0, parts: new Map() }), l);
  return CATEGORIES.map((c) => m.get(c)).filter((r): r is Row => !!r).sort((a, b) => b.amount - a.amount);
}

/** "People" tab: each traveller's part of the cost, labelled with whether they owe or are owed. */
function peopleRows(counted: Line[], travelers: string[], currency: string): Row[] {
  // Bar = each person's part of the cost (equal split of what they're in on), stacked by category;
  // the label says whether they owe or are owed once what they actually paid is counted
  const m = new Map<string, Row>();
  const paid = new Map<string, number>();
  for (const t of travelers) m.set(t, { key: t, label: t, amount: 0, count: 0, parts: new Map() });
  for (const l of counted) {
    paid.set(l.paidBy, (paid.get(l.paidBy) ?? 0) + l.converted!);
    for (const t of l.splitWith) {
      const share = shareOf(l, t);
      const r = m.get(t) ?? m.set(t, { key: t, label: t, amount: 0, count: 0, parts: new Map() }).get(t)!;
      r.amount += share;
      r.count++;
      r.parts.set(l.category, (r.parts.get(l.category) ?? 0) + share);
    }
  }
  for (const r of m.values()) {
    r.paid = paid.get(r.key) ?? 0;
    const bal = r.paid - r.amount;
    r.sub = Math.abs(bal) < 0.005 ? "settled" : bal > 0 ? `is owed ${formatMoney(bal, currency)}` : `owes ${formatMoney(-bal, currency)}`;
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

/** "Day by day" tab: every trip day in order (empty days included), then anything outside the dates / undated. */
function dayRows(counted: Line[], state: TripState): Row[] {
  const m = new Map<string, Row>();
  const days: string[] = [];
  for (let d = parseISODate(state.meta.startDate); d <= parseISODate(state.meta.endDate); d = new Date(d.getTime() + 86400000)) days.push(d.toISOString().slice(0, 10));
  for (const d of days) m.set(d, { key: d, label: dayFmt(d), sub: `Day ${days.indexOf(d) + 1}`, color: dayColor(days.indexOf(d), d, state.meta.dayColors), amount: 0, count: 0, parts: new Map() });
  for (const l of counted) {
    const k = l.date && m.has(l.date) ? l.date : l.date ? "outside" : "none";
    addLine(m, k, () => ({ key: k, label: k === "outside" ? "Other dates" : "No date", amount: 0, count: 0, parts: new Map() }), l);
  }
  return [...days.map((d) => m.get(d)!), ...["outside", "none"].map((k) => m.get(k)).filter((r): r is Row => !!r)];
}

/**
 * Spending breakdown, Wanderlog-style but readable: horizontal bars (each bar in its category's icon colour or
 * its day's pin colour), the amount and share printed at the end of every bar, and a hover card with
 * the biggest items. "Day by day" shows every trip day, so quiet days read as gaps.
 */
export function BudgetCharts({ lines, state, currency }: { lines: Line[]; state: TripState; currency: string }) {
  const [tab, setTab] = useState<Tab>("category");
  const [hover, setHover] = useState<string | null>(null);
  const counted = lines.filter((l) => l.converted != null);
  const travelers = travelersOf(state);
  if (tab === "people" && travelers.length < 2) setTab("category");
  const total = counted.reduce((s, l) => s + l.converted!, 0);

  const rows: Row[] = useMemo(() => {
    if (tab === "category") return categoryRows(counted);
    if (tab === "people") return peopleRows(counted, travelers, currency);
    return dayRows(counted, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, lines, state.meta.startDate, state.meta.endDate, travelers.join("|"), currency]);

  const max = Math.max(1, ...rows.map((r) => r.amount));
  if (!counted.length) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="font-display text-lg whitespace-nowrap">Spending breakdown</h3>
        <TabBar tab={tab} travelerCount={travelers.length} onTab={setTab} />
      </div>

      <ul className="space-y-[3px]" onMouseLeave={() => setHover(null)}>
        {rows.map((r) => (
          <BarRow key={r.key} r={r} tab={tab} max={max} total={total} currency={currency} on={hover === r.key} onHover={() => setHover(r.key)} />
        ))}
      </ul>
    </section>
  );
}

function TabBar({ tab, travelerCount, onTab }: { tab: Tab; travelerCount: number; onTab: (t: Tab) => void }) {
  return (
    <div className="flex max-w-full rounded-full border border-line p-0.5 text-[13px] font-semibold max-sm:w-full" role="tablist">
      {(
        [
          ["category", "Category"],
          ["day", "Day by day"],
          ["people", "People"],
        ] as const
      )
        .filter(([k]) => k !== "people" || travelerCount > 1)
        .map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => onTab(k)} className={`rounded-full px-3 py-1 whitespace-nowrap max-sm:flex-1 ${tab === k ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}>
            {label}
          </button>
        ))}
    </div>
  );
}

/** One row: label, bar, and the amount with its share; the hover card lists the biggest items. */
function BarRow({ r, tab, max, total, currency, on, onHover }: { r: Row; tab: Tab; max: number; total: number; currency: string; on: boolean; onHover: () => void }) {
  const pct = total ? (r.amount / total) * 100 : 0;
  const top = [...r.parts.entries()].sort((a, b) => b[1] - a[1]); // biggest first, in the bar and the hover card
  return (
    <li
      onMouseEnter={onHover}
      onFocus={onHover}
      tabIndex={0}
      className={`relative grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-3 rounded-lg px-1 py-1 outline-none max-sm:grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] max-sm:gap-2 ${on ? "bg-surface-2" : ""}`}
    >
      <span className="min-w-0 truncate text-right text-[13px] leading-tight">
        <span className={r.amount ? "text-fg" : "text-muted"}>{r.label}</span>
        {r.sub && <span className="block text-[11px] text-muted">{r.sub}</span>}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {/* The bar fills what the amount label leaves, so long amounts never run off the card */}
        <BarFill r={r} tab={tab} max={max} on={on} top={top} currency={currency} />
        {r.amount <= 0 && <span className="w-[16ch] shrink-0" />}
        {r.amount > 0 && (
          <span className="w-[16ch] shrink-0 text-[12.5px] whitespace-nowrap tabular-nums">
            {formatMoney(r.amount, currency)} <span className="text-muted">· {pct < 1 ? "<1" : Math.round(pct)}%</span>
          </span>
        )}
      </span>
      {on && r.amount > 0 && <HoverCard r={r} tab={tab} currency={currency} top={top} />}
    </li>
  );
}

/** The bar itself: the row's colour, or stacked by category on the day and people tabs. */
function BarFill({ r, tab, max, on, top, currency }: { r: Row; tab: Tab; max: number; on: boolean; top: [ExpenseCategory, number][]; currency: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center">
      <span
        // Category bars use the icon colour. Day bars are stacked by category; only
        // uncategorised ("Other") spending takes the day's pin colour. Brightens on hover.
        className={`flex h-[18px] shrink-0 overflow-hidden rounded-r-[4px] transition-opacity ${r.amount ? (on ? "opacity-100" : "opacity-80") : "bg-line"}`}
        style={{ width: r.amount ? `max(3px, ${(r.amount / max) * 100}%)` : "2px", background: r.amount && tab === "category" ? (r.color ?? "var(--muted)") : undefined }}
      >
        {tab !== "category" &&
          r.amount > 0 &&
          top.map(([c], i) => (
            <span
              key={c}
              title={`${CATEGORY_LABEL[c]}: ${formatMoney(r.parts.get(c)!, currency)}`}
              className={i ? "border-l border-surface" : ""}
              style={{ width: `${(r.parts.get(c)! / r.amount) * 100}%`, background: c === "other" ? (r.color ?? CAT_COLOR.other) : CAT_COLOR[c] }}
            />
          ))}
      </span>
    </span>
  );
}

/** Hover card: the row's total (or each person's paid and owed) and its biggest categories. */
function HoverCard({ r, tab, currency, top }: { r: Row; tab: Tab; currency: string; top: [ExpenseCategory, number][] }) {
  return (
    <div className="pointer-events-none absolute top-full left-[7.5rem] z-10 mt-1 w-60 rounded-xl border border-line bg-surface p-3 text-[13px] shadow-2xl">
      <p className="font-bold">{r.label}</p>
      <p className="text-muted">
        {tab === "people" ? (
          <>
            Their part of the trip <span className="text-fg tabular-nums">{formatMoney(r.amount, currency)}</span>
            <br />
            Paid out <span className="text-fg tabular-nums">{formatMoney(r.paid ?? 0, currency)}</span> · {r.sub}
          </>
        ) : (
          `${formatMoney(r.amount, currency)} · ${r.count} item${r.count > 1 ? "s" : ""}`
        )}
      </p>
      {tab !== "category" && (
        <ul className="mt-1.5 space-y-0.5">
          {top.slice(0, 5).map(([c, v]) => (
            <li key={c} className="flex justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: c === "other" ? (r.color ?? CAT_COLOR.other) : CAT_COLOR[c] }} />
                {CATEGORY_LABEL[c]}
              </span>
              <span className="tabular-nums">{formatMoney(v, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Download every budget line as a CSV (opens in Excel, Numbers or Google Sheets). */
export function exportBudgetCsv(lines: Line[], state: TripState, currency: string) {
  const esc = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const start = parseISODate(state.meta.startDate).getTime();
  const rows = [
    ["Date", "Day", "Description", "Category", "Amount", "Currency", `Amount (${currency})`, "Paid by", "Split between", "Source"],
    ...lines.map((l) => [
      l.date ?? "",
      l.date ? Math.round((parseISODate(l.date).getTime() - start) / 86400000) + 1 : "",
      l.title,
      CATEGORY_LABEL[l.category],
      l.amount.toFixed(2),
      l.currency,
      l.converted != null ? l.converted.toFixed(2) : "",
      l.paidBy,
      l.splitWith.join("; "),
      l.fromReservation ? "Reservation" : l.fromItem ? "Itinerary" : "Expense",
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${state.meta.title.replace(/[^\w\- ]+/g, "").trim() || "trip"} expenses.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-fg">
      <Download className="size-3.5" /> Export CSV
    </button>
  );
}
