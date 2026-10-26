import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { Line } from "../lib/budget";
import { CATEGORIES, CATEGORY_LABEL } from "../lib/budget";
import { formatMoney } from "../lib/fx";
import { parseISODate } from "../lib/dates";
import type { ExpenseCategory, TripState } from "../lib/trips";

type Row = { key: string; label: string; sub?: string; amount: number; count: number; parts: Map<ExpenseCategory, number> };

const dayFmt = (d: string) => new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(parseISODate(d));

/**
 * Spending breakdown, Wanderlog-style but readable: horizontal bars (one hue; the label says what
 * each bar is), the amount and share printed at the end of every bar, and a hover card with
 * the biggest items. "Day by day" shows every trip day, so quiet days read as gaps.
 */
export function BudgetCharts({ lines, state, currency }: { lines: Line[]; state: TripState; currency: string }) {
  const [tab, setTab] = useState<"category" | "day">("category");
  const [hover, setHover] = useState<string | null>(null);
  const counted = lines.filter((l) => l.converted != null);
  const total = counted.reduce((s, l) => s + l.converted!, 0);

  const rows: Row[] = useMemo(() => {
    const add = (m: Map<string, Row>, key: string, init: () => Row, l: Line) => {
      const r = m.get(key) ?? m.set(key, init()).get(key)!;
      r.amount += l.converted!;
      r.count++;
      r.parts.set(l.category, (r.parts.get(l.category) ?? 0) + l.converted!);
    };
    const m = new Map<string, Row>();
    if (tab === "category") {
      for (const l of counted) add(m, l.category, () => ({ key: l.category, label: CATEGORY_LABEL[l.category], amount: 0, count: 0, parts: new Map() }), l);
      return CATEGORIES.map((c) => m.get(c)).filter((r): r is Row => !!r).sort((a, b) => b.amount - a.amount);
    }
    // every trip day in order (empty days included), then anything outside the dates / undated
    const days: string[] = [];
    for (let d = parseISODate(state.meta.startDate); d <= parseISODate(state.meta.endDate); d = new Date(d.getTime() + 86400000)) days.push(d.toISOString().slice(0, 10));
    for (const d of days) m.set(d, { key: d, label: dayFmt(d), sub: `Day ${days.indexOf(d) + 1}`, amount: 0, count: 0, parts: new Map() });
    for (const l of counted) {
      const k = l.date && m.has(l.date) ? l.date : l.date ? "outside" : "none";
      add(m, k, () => ({ key: k, label: k === "outside" ? "Other dates" : "No date", amount: 0, count: 0, parts: new Map() }), l);
    }
    return [...days.map((d) => m.get(d)!), ...["outside", "none"].map((k) => m.get(k)).filter((r): r is Row => !!r)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, lines, state.meta.startDate, state.meta.endDate]);

  const max = Math.max(1, ...rows.map((r) => r.amount));
  if (!counted.length) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg">Spending breakdown</h3>
        <div className="flex rounded-full border border-line p-0.5 text-[13px] font-semibold" role="tablist">
          {(
            [
              ["category", "Category"],
              ["day", "Day by day"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1 ${tab === k ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-[3px]" onMouseLeave={() => setHover(null)}>
        {rows.map((r) => {
          const pct = total ? (r.amount / total) * 100 : 0;
          const on = hover === r.key;
          const top = [...r.parts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
          return (
            <li
              key={r.key}
              onMouseEnter={() => setHover(r.key)}
              onFocus={() => setHover(r.key)}
              tabIndex={0}
              className={`relative grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-lg px-1 py-1 outline-none ${on ? "bg-surface-2" : ""}`}
            >
              <span className="min-w-0 truncate text-right text-[13px] leading-tight">
                <span className={r.amount ? "text-fg" : "text-muted"}>{r.label}</span>
                {r.sub && <span className="block text-[11px] text-muted">{r.sub}</span>}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-[18px] shrink-0 rounded-r-[4px] transition-colors ${r.amount ? (on ? "bg-accent" : "bg-accent/75") : "bg-line"}`}
                  style={{ width: r.amount ? `max(3px, ${(r.amount / max) * 72}%)` : "2px" }}
                />
                {r.amount > 0 && (
                  <span className="shrink-0 text-[12.5px] whitespace-nowrap tabular-nums">
                    {formatMoney(r.amount, currency)} <span className="text-muted">· {pct < 1 ? "<1" : Math.round(pct)}%</span>
                  </span>
                )}
              </span>
              {on && r.amount > 0 && (
                <div className="pointer-events-none absolute top-full left-[7.5rem] z-10 mt-1 w-60 rounded-xl border border-line bg-surface p-3 text-[13px] shadow-2xl">
                  <p className="font-bold">{r.label}</p>
                  <p className="text-muted">
                    {formatMoney(r.amount, currency)} · {r.count} item{r.count > 1 ? "s" : ""}
                  </p>
                  {tab === "day" && (
                    <ul className="mt-1.5 space-y-0.5">
                      {top.map(([c, v]) => (
                        <li key={c} className="flex justify-between gap-2">
                          <span>{CATEGORY_LABEL[c]}</span>
                          <span className="tabular-nums">{formatMoney(v, currency)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
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
