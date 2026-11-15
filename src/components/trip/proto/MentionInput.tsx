// PROTOTYPE (proto/trip-focus): one-line text field with @mentions of the trip's people (Slack-style):
// type @ and a name, pick with ↑↓ and Enter/Tab. Enter saves, Escape cancels.
import { useRef, useState } from "react";

export function MentionInput({
  initial = "",
  people,
  placeholder,
  autoFocus,
  onSave,
  onCancel,
}: {
  initial?: string;
  people: string[];
  placeholder: string;
  autoFocus?: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [caret, setCaret] = useState(initial.length);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const token = value.slice(0, caret).match(/@([\p{L}\p{N}_-]*)$/u);
  const matches = token ? people.filter((p) => p.toLowerCase().startsWith(token[1].toLowerCase())) : [];
  const open = matches.length > 0;

  const pick = (name: string) => {
    if (!token) return;
    const start = caret - token[0].length;
    const next = `${value.slice(0, start)}@${name} ${value.slice(caret)}`;
    const at = start + name.length + 2;
    setValue(next);
    setCaret(at);
    setHi(0);
    requestAnimationFrame(() => ref.current?.setSelectionRange(at, at));
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => (setValue(e.target.value), setCaret(e.target.selectionStart ?? e.target.value.length), setHi(0))}
        onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
        onBlur={() => onSave(value)}
        onKeyDown={(e) => {
          if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setHi((h) => (h + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
          } else if (open && (e.key === "Enter" || e.key === "Tab")) {
            e.preventDefault();
            pick(matches[hi]);
          } else if (e.key === "Enter") {
            e.preventDefault();
            onSave(value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[13.5px] outline-none placeholder:text-muted/70 focus:border-accent"
      />
      {open && (
        <ul className="absolute top-full left-0 z-40 mt-1 min-w-40 rounded-xl border border-line bg-surface p-1 shadow-xl">
          {matches.map((p, i) => (
            <li key={p}>
              <button
                onMouseDown={(e) => (e.preventDefault(), pick(p))}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] ${i === hi ? "bg-accent/15 text-fg" : "text-muted"}`}
              >
                <Avatar name={p} /> {p}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const HUES = [150, 210, 25, 280, 340, 45, 190];
export function Avatar({ name, size = 20 }: { name: string; size?: number }) {
  const hue = HUES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span
      title={name}
      className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-surface"
      style={{ width: size, height: size, fontSize: size * 0.48, background: `hsl(${hue} 55% 45%)` }}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}
