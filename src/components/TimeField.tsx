import { dtf } from "../lib/intl";
import { useEffect, useRef, useState } from "react";
import { Clock, Hourglass, X } from "lucide-react";
import { DEFAULT_STAY, fmtStay, parseStay } from "../lib/autoTime";
import { Popover } from "./DatePicker";

/** "13:05" → "1:05 PM" (or "13:05" where the locale uses a 24-hour clock). */
export function fmtTime(t?: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  return dtf(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, h, m || 0));
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
      if (el && list.current) list.current.scrollTop += el.getBoundingClientRect().top - list.current.getBoundingClientRect().top - el.clientHeight - 4; // second row: one earlier slot stays visible above it
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

/**
 * Start + end in one popover (Wanderlog-style): two time boxes on top, a 15-minute list below.
 * Picking a slot fills the active box; after the start it moves on to the end.
 */
export function TimeRangeField({
  start,
  end,
  onChange,
  disabled,
  className = "",
  children,
  title,
  after,
}: {
  /** Latest time earlier in the day; with nothing set, the list opens on it (the previous stop's end). */
  after?: string;
  start?: string;
  end?: string;
  onChange: (start: string | undefined, end: string | undefined) => void;
  disabled?: boolean;
  className?: string;
  /** Trigger contents; defaults to "9:00 AM – 11:00 AM" / "Add time". */
  children?: React.ReactNode;
  title?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  const [active, setActive] = useState<"start" | "end">("start");
  const [text, setText] = useState({ start: "", end: "" });

  useEffect(() => {
    if (!open) return;
    setS(start);
    setE(end);
    setActive(start && !end ? "end" : "start");
    setText({ start: start ? fmtTime(start) : "", end: end ? fmtTime(end) : "" });
  }, [open, start, end]);

  // Keep the list scrolled to the active value
  const nextSlot = (t?: string) => {
    if (!t || !/^\d{1,2}:\d{2}/.test(t)) return undefined;
    const [h, m] = t.split(":").map(Number);
    const n = Math.min(95, Math.ceil((h * 60 + m) / 15)); // that slot (1 pm → 1:00 pm), or the next one
    return `${String(Math.floor(n / 4)).padStart(2, "0")}:${String((n % 4) * 15).padStart(2, "0")}`;
  };
  const focusVal = (active === "start" ? s : (e ?? s)) ?? nextSlot(after) ?? "09:00";
  useEffect(() => {
    if (!open) return;
    const [h, m] = focusVal.split(":").map(Number);
    const idx = Math.min(95, h * 4 + Math.floor((m || 0) / 15));
    requestAnimationFrame(() => {
      const el = list.current?.children[idx] as HTMLElement | undefined;
      if (el && list.current) list.current.scrollTop += el.getBoundingClientRect().top - list.current.getBoundingClientRect().top - el.clientHeight - 4; // second row: one earlier slot stays visible above it
    });
  }, [open, active, focusVal]);

  const choose = (v: string) => {
    if (active === "start") {
      setS(v);
      setText((t) => ({ ...t, start: fmtTime(v) }));
      // No made-up end time; only drop an end that the new start has passed
      if (e && e <= v) {
        setE(undefined);
        setText((t) => ({ ...t, end: "" }));
      }
      setActive("end");
    } else {
      setE(v);
      setText((t) => ({ ...t, end: fmtTime(v) }));
    }
  };
  const save = () => {
    onChange(s, e); // either can be set on its own
    setOpen(false);
  };

  const box = (k: "start" | "end", label: string) => (
    <label className={`flex-1 rounded-xl border px-3 py-2 ${active === k ? "border-accent bg-accent/5" : "border-line bg-bg"}`}>
      <span className="block text-[11px] font-bold tracking-wide text-muted uppercase">{label}</span>
      <input
        value={text[k]}
        onFocus={() => setActive(k)}
        onChange={(ev) => setText((t) => ({ ...t, [k]: ev.target.value }))}
        onBlur={(ev) => {
          const v = parseTime(ev.target.value);
          if (v) (k === "start" ? setS : setE)(v), setText((t) => ({ ...t, [k]: fmtTime(v) }));
          else if (!ev.target.value.trim()) (k === "start" ? setS : setE)(undefined);
        }}
        onKeyDown={(ev) => ev.key === "Enter" && (ev.preventDefault(), (ev.target as HTMLInputElement).blur(), k === "end" && save())}
        placeholder="--:--"
        className="w-full bg-transparent text-[16px] font-semibold outline-none placeholder:text-muted/50"
      />
    </label>
  );

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        title={title}
        onClick={(ev) => (ev.stopPropagation(), setOpen((o) => !o))}
        className={`flex items-center gap-1.5 whitespace-nowrap disabled:cursor-default ${className}`}
      >
        {children ?? (
          <>
            <Clock className="size-3.5 shrink-0 opacity-70" />
            {start ? (
              `${fmtTime(start)}${end ? ` – ${fmtTime(end)}` : ""}`
            ) : end ? (
              `Until ${fmtTime(end)}`
            ) : (
              <span className="text-muted/70">Add time</span>
            )}
          </>
        )}
      </button>
      {open && btn.current && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)}>
          <div className="w-72 p-3">
            <div className="flex items-center gap-2">
              {box("start", "Start")}
              <span className="text-muted">–</span>
              {box("end", "End")}
            </div>
            <ul ref={list} className="mt-3 h-56 overflow-y-auto rounded-xl border border-line bg-bg p-1 [scrollbar-width:thin]">
              {SLOTS.map((v) => {
                const cur = active === "start" ? s : e;
                const inRange = s && e && v > s && v < e;
                return (
                  <li key={v}>
                    <button
                      type="button"
                      onClick={() => choose(v)}
                      className={`w-full rounded-lg px-3 py-1.5 text-left text-[14px] ${
                        v === cur ? "bg-accent font-bold text-on-accent" : v === s || v === e ? "bg-accent/20 text-fg" : inRange ? "bg-accent/5 text-fg" : v.endsWith(":00") ? "text-fg hover:bg-surface-2" : "text-muted hover:bg-surface-2 hover:text-fg"
                      }`}
                    >
                      {fmtTime(v)}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex justify-end gap-2">
              {(start || end) && (
                <button type="button" onClick={() => (onChange(undefined, undefined), setOpen(false))} className="rounded-full border border-line px-4 py-1.5 text-[14px] font-semibold text-muted hover:text-fg">
                  Clear
                </button>
              )}
              <button type="button" onClick={save} className="rounded-full bg-accent px-5 py-1.5 text-[14px] font-bold text-on-accent">
                Save
              </button>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

/** Durations offered in the list: every 15 minutes up to 12 h. */
const STAY_SLOTS = Array.from({ length: 48 }, (_, i) => (i + 1) * 15);

/** "How long will you be here": the same look as the time picker — type one, or pick from the list. */
export function StayField({ value, isDefault, onChange, disabled, className = "", children }: { value: number; isDefault?: boolean; onChange: (min: number | undefined) => void; disabled?: boolean; className?: string; children?: React.ReactNode }) {
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!open) return;
    setText("");
    setBad(false);
    // Open on the current length, in the second row (one shorter option stays visible above it)
    const idx = Math.max(0, Math.min(STAY_SLOTS.length - 1, Math.ceil(value / 15) - 1));
    requestAnimationFrame(() => {
      const el = list.current?.children[idx] as HTMLElement | undefined;
      if (el && list.current) list.current.scrollTop += el.getBoundingClientRect().top - list.current.getBoundingClientRect().top - el.clientHeight - 4;
    });
  }, [open, value]);
  const commit = (v: number | undefined) => (onChange(v), setOpen(false));
  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
        title="How long you'll be here"
        className={`flex items-center gap-1.5 whitespace-nowrap disabled:cursor-default ${className}`}
      >
        {children ?? (
          <>
            <Hourglass className="size-3.5 shrink-0 text-accent" />
            <span className={isDefault ? "text-muted" : ""}>{fmtStay(value)}</span>
          </>
        )}
      </button>
      {open && btn.current && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)}>
          <div className="w-52 p-2" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={text}
              onChange={(e) => (setText(e.target.value), setBad(false))}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const m = parseStay(text);
                m ? commit(m) : setBad(true);
              }}
              placeholder="Type, e.g. 1h 20m"
              className={`w-full rounded-lg border bg-bg px-2.5 py-1.5 text-[14px] outline-none ${bad ? "border-danger" : "border-line focus:border-accent"}`}
            />
            <ul ref={list} className="mt-2 h-56 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {STAY_SLOTS.map((m) => {
                const on = !isDefault && m === value;
                return (
                  <li key={m}>
                    <button
                      type="button"
                      onClick={() => commit(m)}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[14px] ${on ? "bg-accent font-bold text-on-accent" : m % 60 === 0 ? "text-fg hover:bg-surface-2" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
                    >
                      {fmtStay(m)}
                    </button>
                  </li>
                );
              })}
            </ul>
            {!isDefault && (
              <button type="button" onClick={() => commit(undefined)} className="mt-1.5 flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
                <X className="size-3.5" /> Reset to {fmtStay(DEFAULT_STAY)}
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
