import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Camera, Check, Loader2, MapPin, Plus, Receipt as ReceiptIcon, Trash2, X } from "lucide-react";
import type * as Y from "yjs";
import { saveExpense, type Expense, type ExpenseCategory, type Item, type Receipt, type ReceiptItem, type TripState } from "../lib/trips";
import { travelersOf } from "../lib/budget";
import { formatMoney } from "../lib/fx";
import { lineCosts, matchStop, parseReceipt, photoToJpeg, sharesByItem } from "../lib/receipt";
import { CurrencySelect } from "./CurrencySelect";
import { DateField } from "./DatePicker";
import { Menu } from "./Menu";
import { formatShort } from "../lib/dates";

const CATS: { key: ExpenseCategory; label: string }[] = [
  { key: "food", label: "Food" },
  { key: "groceries", label: "Groceries" },
  { key: "drinks", label: "Drinks" },
  { key: "shopping", label: "Shopping" },
  { key: "activities", label: "Activities" },
  { key: "transit", label: "Transit" },
  { key: "other", label: "Other" },
];

type Step = "reading" | "details" | "paid" | "split" | "items";

interface Props {
  doc: Y.Doc;
  state: TripState;
  /** A new photo to read… */
  file?: File;
  /** …or an existing receipt to edit. */
  expense?: Expense;
  /** Opened from a stop: it's the stop's receipt (no matching needed). */
  stop?: Item;
  onClose: () => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Scan a receipt into Budget → Receipts: Claude reads the photo, you check it, say who paid and
 * who's charged (just the payer, an even split, or item by item, with tax/tip spread per item).
 */
export function ReceiptFlow({ doc, state, file, expense, stop, onClose }: Props) {
  const people = travelersOf(state);
  const currency0 = state.meta.currency ?? "CAD";
  const [step, setStep] = useState<Step>(file ? "reading" : "details");
  const [err, setErr] = useState<string | null>(null);
  const [r, setR] = useState<Receipt>(expense?.receipt ?? { merchant: "", items: [] });
  const [total, setTotal] = useState<number | undefined>(expense?.amount);
  const [cur, setCur] = useState(expense?.currency ?? currency0);
  const [date, setDate] = useState<string | undefined>(expense?.date ?? stopDate(stop) ?? clampDate(todayISO(), state));
  const [cat, setCat] = useState<ExpenseCategory>(expense?.category ?? "food");
  const [itemId, setItemId] = useState<string | undefined>(expense?.itemId ?? stop?.id);
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? people[0]);
  const [split, setSplit] = useState<Receipt["split"]>(expense?.receipt?.split ?? (people.length > 1 ? "even" : "payer"));
  const [evenWith, setEvenWith] = useState<string[]>(expense?.splitWith?.length ? expense.splitWith : people);
  const started = useRef(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // Read the photo
  useEffect(() => {
    if (!file || started.current) return;
    started.current = true;
    (async () => {
      try {
        const img = await photoToJpeg(file);
        const out = await parseReceipt(img, { destination: state.meta.destination, currency: currency0 });
        const items = (out.items ?? []).filter((i) => i && typeof i.price === "number");
        setR({ merchant: out.merchant ?? "", items, subtotal: out.subtotal, tax: out.tax_included ? undefined : out.tax, tip: out.tip, taxIncluded: !!out.tax_included });
        const sum = items.reduce((a, b) => a + b.price, 0) + (out.tax_included ? 0 : (out.tax ?? 0)) + (out.tip ?? 0);
        setTotal(out.total ?? Math.round(sum * 100) / 100);
        if (out.currency) setCur(out.currency.toUpperCase());
        if (out.date) setDate(out.date);
        if (out.category) setCat(out.category);
        // From Budget: find the stop it belongs to
        if (!stop) setItemId(matchStop(out.merchant, out.date ?? date, state.items)?.id);
        setStep("details");
      } catch (e) {
        setErr((e as Error).message || "Couldn't read the receipt");
        setStep("details");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const costs = useMemo(() => lineCosts(r, total), [r, total]);
  const itemShares = useMemo(() => sharesByItem(r, total ?? 0), [r, total]);
  const unassigned = r.items.filter((i) => !i.who?.length).length;
  const linked = state.items.find((i) => i.id === itemId);
  const setItem = (k: number, patch: Partial<ReceiptItem>) => setR((x) => ({ ...x, items: x.items.map((it, j) => (j === k ? { ...it, ...patch } : it)) }));

  const save = () => {
    if (total == null || !Number.isFinite(total)) return;
    const base = {
      id: expense?.id,
      createdAt: expense?.createdAt,
      kind: "receipt" as const,
      title: r.merchant.trim() || "Receipt",
      amount: total,
      currency: cur,
      category: cat,
      date,
      paidBy,
      itemId,
      receipt: { ...r, split },
    };
    if (split === "payer") saveExpense(doc, { ...base, splitWith: [paidBy], shares: undefined });
    else if (split === "even") saveExpense(doc, { ...base, splitWith: evenWith.length && evenWith.length < people.length ? evenWith : undefined, shares: undefined });
    else saveExpense(doc, { ...base, splitWith: Object.keys(itemShares), shares: itemShares });
    onClose();
  };

  const stops = state.items.filter((i) => i.kind === "place" && !i.section.startsWith("draft:"));
  const sameDay = stops.filter((i) => date && i.section === `day:${date}`);
  const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-[14px] font-semibold ${on ? "bg-accent text-on-accent" : "bg-surface-2 text-muted hover:text-fg"}`;
  const money = (n: number) => formatMoney(n, cur);
  const back: Partial<Record<Step, Step>> = { paid: "details", split: "paid", items: "split" };

  return createPortal(
    <div className="fixed inset-0 z-[100] grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label="Receipt" onClick={(e) => e.stopPropagation()} className="flex max-h-[100dvh] w-full max-w-md flex-col border border-line bg-surface shadow-2xl max-sm:h-[100dvh] sm:max-h-[92vh] sm:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {back[step] ? (
            <button onClick={() => setStep(back[step]!)} className="grid size-9 place-items-center rounded-full text-muted hover:text-fg" aria-label="Back">
              <ArrowLeft className="size-5" />
            </button>
          ) : (
            <span className="grid size-9 place-items-center text-accent">
              <ReceiptIcon className="size-5" />
            </span>
          )}
          <h2 className="min-w-0 flex-1 truncate font-display text-[20px]">
            {step === "reading" ? "Reading receipt…" : step === "details" ? "Check the receipt" : step === "paid" ? "Who paid?" : step === "split" ? "Who's it for?" : "Who had what?"}
          </h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full border border-line text-muted hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {step === "reading" && (
            <div className="grid place-items-center gap-3 py-16 text-center text-muted">
              <Loader2 className="size-8 animate-spin text-accent" />
              <p>Reading every line, the tax and the total…</p>
            </div>
          )}

          {step === "details" && (
            <div className="space-y-4">
              {err && <p className="rounded-xl bg-danger/10 px-3 py-2 text-[13px] text-danger">{err}. Fill it in by hand, or try a clearer photo.</p>}
              <input value={r.merchant} onChange={(e) => setR({ ...r, merchant: e.target.value })} placeholder="Where (shop or restaurant)" className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[16px] font-semibold outline-none focus:border-accent" />
              <div className="flex gap-2">
                <DateField value={date} onChange={setDate} placeholder="Date" className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px]" />
                <CurrencySelect value={cur} onChange={setCur} className="rounded-xl border border-line bg-bg px-3 text-[15px]" />
              </div>

              {/* The stop it was spent at */}
              <div className="flex items-center gap-2 text-[14px]">
                <MapPin className="size-4 shrink-0 text-muted" />
                <Menu
                  label={<span className="max-w-[16rem] truncate">{linked ? linked.name : "Not linked to a stop"}</span>}
                  options={[
                    { key: "", label: "Not linked to a stop", on: !itemId },
                    ...[...sameDay, ...stops.filter((s) => !sameDay.includes(s)).sort((a, b) => a.section.localeCompare(b.section))].map((s) => ({
                      key: s.id,
                      label: s.name,
                      hint: s.section.startsWith("day:") ? formatShort(s.section.slice(4)) : "List",
                      on: s.id === itemId,
                    })),
                  ]}
                  onPick={(k) => setItemId(k || undefined)}
                  searchable
                  align="left"
                />
                {linked && !stop && !expense && <span className="text-[12px] text-accent">matched</span>}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CATS.map((c) => (
                  <button key={c.key} onClick={() => setCat(c.key)} className={chip(cat === c.key).replace("py-2", "py-1.5").replace("text-[14px]", "text-[13px]")}>
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Line items */}
              <div className="rounded-2xl border border-line">
                {r.items.map((it, k) => (
                  <div key={k} className="flex items-center gap-2 border-b border-line/70 px-3 py-1.5 last:border-b-0">
                    <input value={it.name} onChange={(e) => setItem(k, { name: e.target.value })} className="min-w-0 flex-1 bg-transparent py-1 text-[14px] outline-none" aria-label="Item" />
                    {!r.taxIncluded && r.tax ? (
                      <button onClick={() => setItem(k, { taxable: it.taxable === false })} title={it.taxable === false ? "No tax on this line" : "Taxed"} className={`rounded px-1.5 text-[11px] font-bold ${it.taxable === false ? "text-muted/50 line-through" : "text-muted"}`}>
                        TAX
                      </button>
                    ) : null}
                    <input
                      type="number"
                      step="any"
                      value={Number.isFinite(it.price) ? it.price : ""}
                      onChange={(e) => setItem(k, { price: Number(e.target.value) })}
                      className="w-20 bg-transparent py-1 text-right text-[14px] tabular-nums outline-none"
                      aria-label="Price"
                    />
                    <button onClick={() => setR({ ...r, items: r.items.filter((_, j) => j !== k) })} className="text-muted hover:text-danger" aria-label="Remove line">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setR({ ...r, items: [...r.items, { name: "", price: 0 }] })} className="flex w-full items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-muted hover:text-fg">
                  <Plus className="size-3.5" /> Add line
                </button>
              </div>

              <div className="space-y-1.5 text-[14px]">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-muted">{r.taxIncluded ? "Tax (included in prices)" : "Tax added on top"}</span>
                  <input type="number" step="any" value={r.tax ?? ""} onChange={(e) => setR({ ...r, tax: e.target.value === "" ? undefined : Number(e.target.value) })} disabled={r.taxIncluded} className="w-24 rounded-lg bg-bg px-2 py-1 text-right tabular-nums outline-none disabled:opacity-50" />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-muted">Tip</span>
                  <input type="number" step="any" value={r.tip ?? ""} onChange={(e) => setR({ ...r, tip: e.target.value === "" ? undefined : Number(e.target.value) })} className="w-24 rounded-lg bg-bg px-2 py-1 text-right tabular-nums outline-none" />
                </label>
                <label className="flex items-center justify-between gap-3 text-[16px] font-bold">
                  <span>Total</span>
                  <input type="number" step="any" value={total ?? ""} onChange={(e) => setTotal(e.target.value === "" ? undefined : Number(e.target.value))} className="w-28 rounded-lg bg-bg px-2 py-1 text-right tabular-nums outline-none focus:ring-1 focus:ring-accent" />
                </label>
                <button onClick={() => setR({ ...r, taxIncluded: !r.taxIncluded })} className="text-[12px] font-semibold text-muted underline-offset-2 hover:text-fg hover:underline">
                  {r.taxIncluded ? "Tax is added on top instead" : "Prices already include tax"}
                </button>
              </div>
            </div>
          )}

          {step === "paid" && (
            <div className="flex flex-wrap gap-2">
              {people.map((t) => (
                <button key={t} onClick={() => (setPaidBy(t), setStep(people.length > 1 ? "split" : "split"))} className={chip(paidBy === t)}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {step === "split" && (
            <div className="space-y-3">
              {(
                [
                  ["payer", `Just ${paidBy}`, "Nobody owes anything"],
                  ["even", "Split evenly", "Pick who shares it"],
                  ["items", "By item", "Say who had each line; tax and tip follow the items"],
                ] as const
              ).map(([k, title, hint]) => (
                <button key={k} onClick={() => setSplit(k)} className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left ${split === k ? "border-accent bg-accent/10" : "border-line hover:border-muted/50"}`}>
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${split === k ? "border-accent bg-accent text-on-accent" : "border-line"}`}>{split === k && <Check className="size-3" />}</span>
                  <span>
                    <span className="block text-[15px] font-bold">{title}</span>
                    <span className="block text-[13px] text-muted">{hint}</span>
                  </span>
                </button>
              ))}
              {split === "even" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {people.map((t) => {
                    const on = evenWith.includes(t);
                    return (
                      <button key={t} onClick={() => setEvenWith(on ? evenWith.filter((x) => x !== t) : [...evenWith, t])} className={chip(on)}>
                        {t}
                      </button>
                    );
                  })}
                  {total != null && evenWith.length > 0 && <p className="w-full text-[13px] text-muted">{money(total / evenWith.length)} each</p>}
                </div>
              )}
            </div>
          )}

          {step === "items" && (
            <div className="space-y-2">
              {r.items.map((it, k) => (
                <div key={k} className="rounded-2xl border border-line p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-[15px] font-semibold">{it.name || "Item"}</p>
                    <p className="shrink-0 text-[14px] tabular-nums">{money(costs[k] ?? it.price)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {people.map((t) => {
                      const on = !!it.who?.includes(t);
                      return (
                        <button key={t} onClick={() => setItem(k, { who: on ? (it.who ?? []).filter((x) => x !== t) : [...(it.who ?? []), t] })} className={chip(on).replace("py-2", "py-1.5").replace("text-[14px]", "text-[13px]")}>
                          {t}
                        </button>
                      );
                    })}
                    <button onClick={() => setItem(k, { who: people })} className="rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:text-fg">
                      Shared
                    </button>
                  </div>
                </div>
              ))}
              {/* Running totals per person */}
              <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 pt-3 pb-1">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
                  {people.map((t) => (
                    <span key={t}>
                      <span className="text-muted">{t}</span> <span className="font-semibold tabular-nums">{money(itemShares[t] ?? 0)}</span>
                    </span>
                  ))}
                </div>
                {unassigned > 0 && <p className="mt-1 text-[12px] text-danger">{unassigned} line{unassigned > 1 ? "s" : ""} not given to anyone yet</p>}
              </div>
            </div>
          )}
        </div>

        {step !== "reading" && (
          <div className="border-t border-line p-4">
            {step === "details" && (
              <button disabled={total == null} onClick={() => setStep(people.length > 1 ? "paid" : "split")} className="w-full rounded-xl bg-accent py-3 font-bold text-on-accent disabled:opacity-50">
                {people.length > 1 ? "Next: who paid" : "Next"}
              </button>
            )}
            {step === "paid" && (
              <button onClick={() => setStep("split")} className="w-full rounded-xl bg-accent py-3 font-bold text-on-accent">
                Next: who it's for
              </button>
            )}
            {step === "split" && (
              <button
                disabled={split === "even" && !evenWith.length}
                onClick={() => (split === "items" ? setStep("items") : save())}
                className="w-full rounded-xl bg-accent py-3 font-bold text-on-accent disabled:opacity-50"
              >
                {split === "items" ? "Next: who had what" : `Save ${total != null ? money(total) : ""}`}
              </button>
            )}
            {step === "items" && (
              <button disabled={unassigned > 0 || !r.items.length} onClick={save} className="w-full rounded-xl bg-accent py-3 font-bold text-on-accent disabled:opacity-50">
                Save {total != null ? money(total) : ""}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const stopDate = (s?: Item) => (s?.section.startsWith("day:") ? s.section.slice(4) : undefined);
const clampDate = (d: string, state: TripState) => (d < state.meta.startDate ? state.meta.startDate : d > state.meta.endDate ? state.meta.endDate : d);

/**
 * The camera button: a label around a hidden file input, so the phone's camera opens straight
 * from the tap (a programmatic click wouldn't count as one on iOS).
 */
export function ReceiptButton({ onFile, className = "", children, title = "Scan a receipt" }: { onFile: (f: File) => void; className?: string; children?: React.ReactNode; title?: string }) {
  return (
    <label className={`cursor-pointer ${className}`} title={title} onClick={(e) => e.stopPropagation()}>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      {children ?? <Camera className="size-3.5" />}
    </label>
  );
}
