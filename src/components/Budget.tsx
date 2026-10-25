import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DateField } from "./DatePicker";
import type * as Y from "yjs";
import { ArrowLeft, ArrowRight, Check, BedDouble, Car, ChevronDown, ChevronRight, Fuel, Landmark, Pencil, Plane, Plus, Receipt, ShoppingBag, ShoppingCart, Ticket, TrainFront, Trash2, Users, Utensils, Wine, X } from "lucide-react";
import { removeExpense, saveExpense, saveReservation, updateItem, updateMeta, type CostSplit, type Expense, type ExpenseCategory, type TripState } from "../lib/trips";
import { CURRENCIES, formatMoney, useConverter } from "../lib/fx";
import { budgetLines, CATEGORIES, CATEGORY_LABEL, settleUp, totals, travelersOf, type Line } from "../lib/budget";
import { formatShort, todayISO } from "../lib/dates";

export const CAT_COLOR: Record<ExpenseCategory, string> = {
  flights: "#6aa8ff",
  lodging: "#c58cff",
  car: "#46c7c7",
  transit: "#3fb5e0",
  transport: "#3fb5e0",
  food: "#f2a65a",
  drinks: "#e07a9f",
  sightseeing: "#5fd68b",
  activities: "#9ad65f",
  shopping: "#f06b8b",
  gas: "#d6c25f",
  groceries: "#7fc8a9",
  other: "#9aa59f",
};

export const CAT_ICON: Record<ExpenseCategory, React.ReactNode> = {
  flights: <Plane />,
  lodging: <BedDouble />,
  car: <Car />,
  transit: <TrainFront />,
  transport: <TrainFront />,
  food: <Utensils />,
  drinks: <Wine />,
  sightseeing: <Landmark />,
  activities: <Ticket />,
  shopping: <ShoppingBag />,
  gas: <Fuel />,
  groceries: <ShoppingCart />,
  other: <Receipt />,
};

export function BudgetPanel({ doc, state, readOnly }: { doc: Y.Doc; state: TripState; readOnly: boolean }) {
  const currency = state.meta.currency ?? "CAD";
  const fx = useConverter(currency);
  const travelers = travelersOf(state);
  const lines = useMemo(() => budgetLines(state, fx.convert), [state, fx]);
  const { total, byCategory, unconverted } = totals(lines);
  const settle = useMemo(() => settleUp(lines, travelers), [lines, travelers]);
  const [editing, setEditing] = useState<Partial<Expense> | null>(null);
  const [linked, setLinked] = useState<Line | null>(null);
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
                <span className="grid size-8 shrink-0 place-items-center rounded-full [&>svg]:size-4" style={{ background: `${CAT_COLOR[l.category]}26`, color: CAT_COLOR[l.category] }}>
                  {CAT_ICON[l.category]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.title}</p>
                  <p className="text-xs text-muted">
                    {[l.date && formatShort(l.date), CATEGORY_LABEL[l.category], travelers.length > 1 && `${l.paidBy} paid`, l.fromReservation && "from reservation", l.fromItem && "from itinerary"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums">{l.converted != null ? formatMoney(l.converted, currency) : "—"}</p>
                  {l.currency !== currency && <p className="text-xs text-muted tabular-nums">{formatMoney(l.amount, l.currency)}</p>}
                </div>
                {!readOnly && !l.expense && (
                  <div className="flex w-[60px] shrink-0 justify-end opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                    <button onClick={() => setLinked(l)} className="grid size-7 place-items-center rounded-md text-muted hover:text-fg" title="Category and split">
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                )}
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
      {linked && (
        <ExpenseForm
          doc={doc}
          travelers={travelers}
          linked={linked}
          initial={{ title: linked.title, amount: linked.amount, currency: linked.currency, category: linked.category, paidBy: linked.paidBy, splitWith: linked.splitWith, date: linked.date }}
          onClose={() => setLinked(null)}
        />
      )}
    </div>
  );
}

/**
 * Wanderlog-style expense editor: amount + currency, category grid, description, paid by,
 * split (everyone or chosen people, with the per-person share), date. People can be added
 * right here. For a cost that lives on a stop or reservation (`linked`), the amount is edited
 * there; this sets its category and split.
 */
export function ExpenseForm({ doc, travelers, initial, linked, onClose }: { doc: Y.Doc; travelers: string[]; initial: Partial<Expense>; linked?: Line; onClose: () => void }) {
  const [e, setE] = useState<Partial<Expense>>({ splitWith: travelers, ...initial });
  const [view, setView] = useState<"form" | "category">("form");
  const [people, setPeople] = useState(travelers);
  const [newPerson, setNewPerson] = useState("");
  const set = (p: Partial<Expense>) => setE((x) => ({ ...x, ...p }));
  const split = (e.splitWith?.length ? e.splitWith : people).filter((t) => people.includes(t));
  const everyone = split.length === people.length;
  type SplitMode = "everyone" | "individuals" | "none";
  const [mode, setMode] = useState<SplitMode>(everyone ? "everyone" : split.length === 1 && split[0] === (initial.paidBy ?? travelers[0]) ? "none" : "individuals");
  const cat = (e.category ?? "other") as ExpenseCategory;
  const per = e.amount && split.length ? e.amount / split.length : 0;

  const addPerson = () => {
    const n = newPerson.trim();
    if (!n || people.includes(n)) return setNewPerson("");
    const next = [...people, n];
    setPeople(next);
    updateMeta(doc, { travelers: next });
    set({ splitWith: [...split, n] });
    setNewPerson("");
  };

  const save = () => {
    const splitWith = everyone ? undefined : split;
    if (linked) {
      const patch: CostSplit = { costCategory: cat, costPaidBy: e.paidBy, costSplit: splitWith };
      if (linked.item) updateItem(doc, linked.item.id, { ...patch, cost: e.amount, costCurrency: e.currency });
      else if (linked.fromReservation) saveReservation(doc, { ...linked.fromReservation, ...patch, cost: e.amount, costCurrency: e.currency });
      return onClose();
    }
    if (!e.title?.trim() || !e.amount) return;
    saveExpense(doc, { ...(e as Expense), category: cat, title: e.title.trim(), splitWith });
    onClose();
  };

  const box = "rounded-2xl border border-line bg-bg";
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(ev) => ev.stopPropagation()} className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 grid size-9 place-items-center rounded-full border border-line text-muted hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </button>

        {view === "category" ? (
          <>
            <div className="mb-5 flex items-center gap-3 pr-10">
              <button onClick={() => setView("form")} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Back">
                <ArrowLeft className="size-4" />
              </button>
              <h2 className="font-display text-[24px]">Select category</h2>
            </div>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => (set({ category: c }), setView("form"))}
                  className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 text-[13px] font-semibold transition-colors [&>svg]:size-5 ${
                    c === cat ? "border-accent bg-accent/10 text-fg" : "border-line bg-bg text-muted hover:border-line hover:text-fg"
                  }`}
                >
                  <span style={{ color: CAT_COLOR[c] }}>{CAT_ICON[c]}</span>
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={(ev) => (ev.preventDefault(), save())} className="space-y-3">
            <h2 className="pr-10 text-center font-display text-[24px]">{linked ? "Cost details" : initial.id ? "Edit expense" : "Add expense"}</h2>

            <div className={`${box} flex items-center gap-2 px-3 py-2.5`}>
              <select
                value={e.currency}
                onChange={(ev) => set({ currency: ev.target.value })}
                className="rounded-lg bg-surface-2 px-2 py-1.5 text-[14px] font-bold outline-none disabled:opacity-70"
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input
                required
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                autoFocus={!linked && !initial.id}
                placeholder="0.00"
                value={e.amount ?? ""}
                onChange={(ev) => set({ amount: ev.target.value === "" ? undefined : Number(ev.target.value) })}
                className="min-w-0 flex-1 bg-transparent text-[22px] font-bold outline-none placeholder:text-muted/50 disabled:opacity-80"
              />
            </div>

            <button type="button" onClick={() => setView("category")} className={`${box} flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:border-accent/50`}>
              <span className="[&>svg]:size-5" style={{ color: CAT_COLOR[cat] }}>
                {CAT_ICON[cat]}
              </span>
              <span className="flex-1">{CATEGORY_LABEL[cat]}</span>
              <ChevronRight className="size-4 text-muted" />
            </button>

            <label className={`${box} block px-4 py-2.5`}>
              <span className="text-[12px] font-bold text-muted">Description</span>
              <textarea
                required={!linked}
                disabled={!!linked}
                rows={1}
                value={e.title ?? ""}
                onChange={(ev) => set({ title: ev.target.value })}
                placeholder="What was it?"
                className="block w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-muted/50 disabled:opacity-80 [field-sizing:content]"
              />
            </label>

            <div className={`${box} flex items-center justify-between gap-3 px-4 py-3`}>
              <span className="text-[15px] font-bold">Paid by</span>
              <Menu
                label={
                  <>
                    <Avatar name={e.paidBy ?? people[0]} /> {e.paidBy ?? people[0]}
                  </>
                }
                options={people.map((t) => ({ key: t, label: t, icon: <Avatar name={t} />, on: (e.paidBy ?? people[0]) === t }))}
                onPick={(t) => set({ paidBy: t, ...(mode === "none" ? { splitWith: [t] } : {}) })}
              />
            </div>

            <div className={box}>
              <div className="flex items-center justify-between px-4 pt-3">
                <span className="text-[15px] font-bold">Split</span>
                <Menu
                  label={mode === "everyone" ? "Everyone" : mode === "none" ? "Don't split" : "Individuals"}
                  options={[
                    { key: "individuals", label: "Individuals", hint: "Choose who shares it", on: mode === "individuals" },
                    { key: "everyone", label: "Everyone", hint: "Split evenly", on: mode === "everyone" },
                    { key: "none", label: "Don't split", hint: "The payer covers it", on: mode === "none" },
                  ]}
                  onPick={(k) => {
                    setMode(k as SplitMode);
                    set({ splitWith: k === "none" ? [e.paidBy ?? people[0]] : people });
                  }}
                />
              </div>
              <ul className="space-y-1 px-4 py-2.5">
                {people.map((t) => {
                  if (mode !== "individuals" && !split.includes(t)) return null;
                  const on = split.includes(t);
                  return (
                    <li key={t}>
                      <label className="flex cursor-pointer items-center gap-3 py-1 text-[15px]">
                        {mode === "individuals" && (
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              const next = on ? split.filter((x) => x !== t) : [...split, t];
                              set({ splitWith: next });
                              if (next.length === people.length) setMode("everyone");
                            }}
                            className="size-[18px] accent-[var(--accent)]"
                          />
                        )}
                        <Avatar name={t} />
                        <span className="flex-1">{t}</span>
                        {on && per > 0 && <span className="text-[13px] text-muted tabular-nums">{formatMoney(per, e.currency ?? "CAD")}</span>}
                      </label>
                    </li>
                  );
                })}
                <li className="flex items-center gap-2 pt-1">
                  <Plus className="size-4 text-muted" />
                  <input
                    value={newPerson}
                    onChange={(ev) => setNewPerson(ev.target.value)}
                    onKeyDown={(ev) => ev.key === "Enter" && (ev.preventDefault(), addPerson())}
                    onBlur={addPerson}
                    placeholder="Add person"
                    className="min-w-0 flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-muted/60"
                  />
                </li>
              </ul>
              <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[13px]">
                <span className="font-bold">{per > 0 ? `${formatMoney(per, e.currency ?? "CAD")}/person` : "—"}</span>
                <span className="text-muted">
                  {split.length} {split.length === 1 ? "person" : "people"}
                </span>
              </div>
            </div>

            {!linked && (
              <div className="flex items-center gap-2 px-1 text-[14px]">
                <span className="font-bold text-muted">Date:</span>
                <DateField value={e.date} onChange={(v) => set({ date: v })} clearable placeholder="No date" className="rounded-full px-2.5 py-1 font-semibold hover:bg-surface-2" />
              </div>
            )}

            <div className="flex justify-center gap-2 pt-2">
              {initial.id && !linked && (
                <button
                  type="button"
                  onClick={() => confirm("Delete this expense?") && (removeExpense(doc, initial.id!), onClose())}
                  className="flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-[15px] font-bold text-muted hover:text-danger"
                >
                  <Trash2 className="size-4" /> Delete
                </button>
              )}
              <button className="rounded-full bg-accent px-8 py-2.5 text-[15px] font-bold text-on-accent">Save</button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Avatar({ name }: { name: string }) {
  return <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-bold text-fg">{name.slice(0, 1).toUpperCase()}</span>;
}

/** Small styled dropdown (replaces native selects in the expense editor). */
function Menu({ label, options, onPick }: { label: React.ReactNode; options: { key: string; label: string; hint?: string; icon?: React.ReactNode; on?: boolean }[]; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full py-1 pr-1 pl-2 text-[15px] font-semibold text-fg hover:bg-surface-2">
        {label}
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="absolute top-full right-0 z-10 mt-1 min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
          {options.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                onClick={() => (onPick(o.key), setOpen(false))}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[15px] hover:bg-surface-2 ${o.on ? "text-fg" : "text-muted"}`}
              >
                {o.icon}
                <span className="min-w-0 flex-1">
                  <span className="block">{o.label}</span>
                  {o.hint && <span className="block text-[12px] text-muted">{o.hint}</span>}
                </span>
                {o.on && <Check className="size-4 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
