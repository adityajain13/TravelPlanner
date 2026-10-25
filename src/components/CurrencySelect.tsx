import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { CURRENCIES } from "../lib/fx";
import { Popover } from "./DatePicker";

const symbolCache = new Map<string, string>();
/** "JPY" → "¥", "CAD" → "$", falling back to the code. */
export function currencySymbol(code: string) {
  if (!symbolCache.has(code)) {
    let sym = code;
    try {
      sym = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code;
    } catch {
      /* unknown code */
    }
    symbolCache.set(code, sym);
  }
  return symbolCache.get(code)!;
}

let names: Intl.DisplayNames | null = null;
const currencyName = (code: string) => {
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "currency" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
};

/** Compact currency picker: "¥ JPY ▾" opening a short, searchable, scrollable list. */
export function CurrencySelect({ value, onChange, disabled, className = "" }: { value: string; onChange: (c: string) => void; disabled?: boolean; className?: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const shown = CURRENCIES.filter((c) => !q || c.toLowerCase().includes(q.toLowerCase()) || currencyName(c).toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    setQ("");
    const i = CURRENCIES.indexOf(value);
    setActive(Math.max(0, i));
    requestAnimationFrame(() => (list.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({ block: "center" }));
  }, [open, value]);

  const pick = (c: string) => {
    onChange(c);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-semibold whitespace-nowrap hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent ${className}`}
      >
        <span className="text-muted">{currencySymbol(value)}</span>
        {value}
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      {open && btn.current && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)}>
          <div className="w-64 p-2">
            <label className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2.5 py-1.5 focus-within:border-accent">
              <Search className="size-3.5 text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => (setQ(e.target.value), setActive(0))}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(shown.length - 1, a + 1)));
                  else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
                  else if (e.key === "Enter" && shown[active]) (e.preventDefault(), pick(shown[active]));
                }}
                placeholder="Search currency"
                className="w-full bg-transparent text-[14px] outline-none placeholder:text-muted/60"
              />
            </label>
            <ul ref={list} className="mt-2 max-h-60 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
              {shown.map((c, i) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] ${c === value ? "bg-accent/15 text-fg" : i === active ? "bg-surface-2 text-fg" : "text-muted"}`}
                  >
                    <span className="w-7 shrink-0 text-center font-semibold text-fg">{currencySymbol(c)}</span>
                    <span className="w-10 shrink-0 font-bold text-fg">{c}</span>
                    <span className="truncate">{currencyName(c)}</span>
                  </button>
                </li>
              ))}
              {!shown.length && <li className="px-3 py-3 text-[13px] text-muted">No match</li>}
            </ul>
          </div>
        </Popover>
      )}
    </>
  );
}
