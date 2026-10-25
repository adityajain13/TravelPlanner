import { useMemo, useState } from "react";
import type * as Y from "yjs";
import { ArrowRight, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { removeExpense, saveExpense, updateMeta, type Expense, type ExpenseCategory, type TripState } from "../lib/trips";
import { CURRENCIES, formatMoney, useConverter } from "../lib/fx";
import { budgetLines, CATEGORY_LABEL, settleUp, totals, travelersOf } from "../lib/budget";
import { formatShort, todayISO } from "../lib/dates";
import { inputCls } from "./NewTripDialog";

const CAT_COLOR: Record<ExpenseCategory, string> = {
  flights: "#6aa8ff",
  lodging: "#c58cff",
  transport: "#46c7c7",
  food: "#f2a65a",
  activities: "#5fd68b",
  shopping: "#f06b8b",
  other: "#9aa59f",
};

export function BudgetPanel({ doc, state, readOnly }: { doc: Y.Doc; state: TripState; readOnly: boolean }) {
  const currency = state.meta.currency ?? "CAD";
  const fx = useConverter(currency);
  const travelers = travelersOf(state);
  const lines = useMemo(() => budgetLines(state, fx.convert), [state, fx]);
  const { total, byCategory, unconverted } = totals(lines);
  const settle = useMemo(() => settleUp(lines, travelers), [lines, travelers]);
  const [editing, setEditing] = useState<Partial<Expense> | null>(null);
  const [newTraveler, setNewTraveler] = useState("");
  const budget = state.meta.budget;
  const pct = budget ? Math.min(100, (total / budget) * 100) : 0;

  return (
    <div className="space-y-6 px-2 py-4">
      {/* Summary */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-wide text-muted uppercase">Spent</p>
            <p className="font-display text-3xl">{formatMoney(total, currency)}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Budget</span>
            <input
              type="number"
              min="0"
              step="any"
              disabled={readOnly}
              key={budget}
              defaultValue={budget ?? ""}
              placeholder="—"
              onBlur={(e) => updateMeta(doc, { budget: e.target.value ? Number(e.target.value) : undefined })}
              className="w-24 rounded-md bg-surface-2 px-2 py-1 text-right outline-none"
            />
            <select
              value={currency}
              disabled={readOnly}
              onChange={(e) => updateMeta(doc, { currency: e.target.value })}
              className="rounded-md bg-surface-2 px-1.5 py-1 outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {budget ? (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className={`h-full rounded-full ${total > budget ? "bg-danger" : "bg-accent"}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {total > budget ? `${formatMoney(total - budget, currency)} over budget` : `${formatMoney(budget - total, currency)} left`}
            </p>
          </div>
        ) : null}
        {byCategory.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {byCategory.map(([cat, amt]) => (
              <li key={cat} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: CAT_COLOR[cat] }} />
                <span className="flex-1">{CATEGORY_LABEL[cat]}</span>
                <span className="w-24 text-right tabular-nums">{formatMoney(amt, currency)}</span>
                <span className="w-10 text-right text-xs text-muted tabular-nums">{Math.round((amt / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
        {unconverted > 0 && (
          <p className="mt-3 text-xs text-muted">
            {unconverted} expense{unconverted > 1 ? "s" : ""} not counted: no exchange rate yet (go online once).
          </p>
        )}
      </section>

      {/* Travelers + settle up */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 font-display text-lg">
          <Users className="size-4 text-muted" /> Splitting with
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {travelers.map((t, i) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm">
              {t}
              {!readOnly && travelers.length > 1 && i > 0 && (
                <button onClick={() => updateMeta(doc, { travelers: travelers.filter((x) => x !== t) })} className="text-muted hover:text-danger" aria-label={`Remove ${t}`}>
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          ))}
          {!readOnly && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = newTraveler.trim();
                if (n && !travelers.includes(n)) updateMeta(doc, { travelers: [...travelers, n] });
                setNewTraveler("");
              }}
            >
              <input value={newTraveler} onChange={(e) => setNewTraveler(e.target.value)} placeholder="+ Add person" className="w-28 rounded-full bg-transparent px-3 py-1 text-sm outline-none focus:bg-surface-2" />
            </form>
          )}
        </div>
        {travelers.length > 1 && (
          <div className="mt-3 rounded-xl border border-line p-3 text-sm">
            {settle.transfers.length === 0 ? (
              <p className="text-muted">All square.</p>
            ) : (
              <ul className="space-y-1">
                {settle.transfers.map((t, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {t.from} <ArrowRight className="size-3.5 text-muted" /> {t.to}
                    <span className="ml-auto font-semibold tabular-nums">{formatMoney(t.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Expenses */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-lg">Expenses</h3>
          {!readOnly && (
            <button
              onClick={() => setEditing({ currency, category: "food", date: todayISO() >= state.meta.startDate && todayISO() <= state.meta.endDate ? todayISO() : state.meta.startDate, paidBy: travelers[0] })}
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent"
            >
              <Plus className="size-3.5" /> Add expense
            </button>
          )}
        </div>
        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No expenses yet. Reservation costs show up here automatically.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {lines.map((l) => (
              <li key={l.id} className="group flex items-center gap-3 px-3 py-2.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: CAT_COLOR[l.category] }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.title}</p>
                  <p className="text-xs text-muted">
                    {[l.date && formatShort(l.date), CATEGORY_LABEL[l.category], travelers.length > 1 && `${l.paidBy} paid`, l.fromReservation && "from reservation"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums">{l.converted != null ? formatMoney(l.converted, currency) : "—"}</p>
                  {l.currency !== currency && <p className="text-xs text-muted tabular-nums">{formatMoney(l.amount, l.currency)}</p>}
                </div>
                {!readOnly && !l.expense && <div className="w-[60px] shrink-0" />}
                {!readOnly && l.expense && (
                  <div className="flex w-[60px] shrink-0 justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                    <button onClick={() => setEditing(l.expense!)} className="grid size-7 place-items-center rounded-md text-muted hover:text-fg" title="Edit">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => removeExpense(doc, l.id)} className="grid size-7 place-items-center rounded-md text-muted hover:text-danger" title="Delete">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {fx.fetchedAt && <p className="mt-2 text-[10px] text-muted/70">Rates: European Central Bank via Frankfurter, {new Date(fx.fetchedAt).toLocaleDateString()}</p>}
      </section>

      {editing && <ExpenseForm doc={doc} travelers={travelers} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ExpenseForm({ doc, travelers, initial, onClose }: { doc: Y.Doc; travelers: string[]; initial: Partial<Expense>; onClose: () => void }) {
  const [e, setE] = useState<Partial<Expense>>({ splitWith: travelers, ...initial });
  const set = (p: Partial<Expense>) => setE((x) => ({ ...x, ...p }));
  const split = e.splitWith?.length ? e.splitWith : travelers;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onClick={(ev) => ev.stopPropagation()}
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!e.title?.trim() || !e.amount) return;
          saveExpense(doc, {
            ...(e as Expense),
            title: e.title.trim(),
            splitWith: split.length === travelers.length ? undefined : split,
          });
          onClose();
        }}
        className="w-full max-w-md space-y-3 rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">{initial.id ? "Edit" : "Add"} expense</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <input autoFocus required placeholder="What was it?" value={e.title ?? ""} onChange={(ev) => set({ title: ev.target.value })} className={inputCls} />
        <div className="flex gap-2">
          <input
            required
            type="number"
            step="any"
            min="0"
            placeholder="Amount"
            value={e.amount ?? ""}
            onChange={(ev) => set({ amount: ev.target.value === "" ? undefined : Number(ev.target.value) })}
            className={inputCls}
          />
          <select value={e.currency} onChange={(ev) => set({ currency: ev.target.value })} className={`${inputCls} w-28`}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <select value={e.category} onChange={(ev) => set({ category: ev.target.value as ExpenseCategory })} className={inputCls}>
            {(Object.keys(CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <input type="date" value={e.date ?? ""} onChange={(ev) => set({ date: ev.target.value })} className={inputCls} />
        </div>
        {travelers.length > 1 && (
          <>
            <label className="block space-y-1">
              <span className="text-xs text-muted">Paid by</span>
              <select value={e.paidBy} onChange={(ev) => set({ paidBy: ev.target.value })} className={inputCls}>
                {travelers.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <div className="space-y-1">
              <span className="text-xs text-muted">Split between</span>
              <div className="flex flex-wrap gap-2">
                {travelers.map((t) => {
                  const on = split.includes(t);
                  return (
                    <button
                      type="button"
                      key={t}
                      onClick={() => set({ splitWith: on ? split.filter((x) => x !== t) : [...split, t] })}
                      className={`rounded-full px-3 py-1 text-sm ${on ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"}`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
        <button className="w-full rounded-xl bg-accent py-2.5 font-semibold text-on-accent">Save</button>
      </form>
    </div>
  );
}
