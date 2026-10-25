import { useEffect, useRef, useState } from "react";
import { Clock, X } from "lucide-react";
import { Popover } from "./DatePicker";

/** "13:05" → "1:05 PM" (or "13:05" where the locale uses a 24-hour clock). */
export function fmtTime(t?: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, h, m || 0));
}

/** Lenient parsing: "930", "9:30", "9.30pm", "9 pm", "21:15", "noon". */
export function parseTime(s: string): string | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  if (t === "noon") return "12:00";
  if (t === "midnight") return "00:00";
  const m = t.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(am?|pm?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.[0];
  if (min > 59 || h > 24) return null;
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h === 24) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const SLOTS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

interface Props {
  value?: string;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Start the list near this time when empty (e.g. the start time, for an end time). */
  near?: string;
}

/** Time picker: type a time ("930am") or pick from 15-minute slots. */
export function TimeField({ value, onChange, placeholder = "Add time", disabled, className = "", near }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText("");
    setBad(false);
    const target = value ?? near ?? "09:00";
    const [h, m] = target.split(":").map(Number);
    const idx = Math.min(95, h * 4 + Math.floor((m || 0) / 15));
    requestAnimationFrame(() => {
      const el = list.current?.children[idx] as HTMLElement | undefined;
      if (el && list.current) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2;
    });
  }, [open, value, near]);

  const commit = (v: string | undefined) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 whitespace-nowrap disabled:cursor-default ${value ? "text-fg" : "text-muted/70"} ${className}`}
      >
        <Clock className="size-3.5 shrink-0 opacity-70" />
        {value ? fmtTime(value) : placeholder}
      </button>
      {open && btn.current && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)}>
          <div className="w-52 p-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => (setText(e.target.value), setBad(false))}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const t = parseTime(text);
                t ? commit(t) : setBad(true);
              }}
              placeholder="Type, e.g. 9:30am"
              className={`w-full rounded-lg border bg-bg px-2.5 py-1.5 text-[14px] outline-none ${bad ? "border-danger" : "border-line focus:border-accent"}`}
            />
            <ul ref={list} className="mt-2 h-56 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {SLOTS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => commit(s)}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[14px] ${
                      s === value ? "bg-accent font-bold text-on-accent" : s.endsWith(":00") ? "text-fg hover:bg-surface-2" : "text-muted hover:bg-surface-2 hover:text-fg"
                    }`}
                  >
                    {fmtTime(s)}
                  </button>
                </li>
              ))}
            </ul>
            {value && (
              <button type="button" onClick={() => commit(undefined)} className="mt-1.5 flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
                <X className="size-3.5" /> Clear
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
