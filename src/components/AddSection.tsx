import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

const PRESETS = ["Notes", "Restaurants", "Shopping list", "Packing list", "Things to try"];

/** "+ Add section" under the trip's lists (Notes, Restaurants…), like Wanderlog's overview. */
export function AddSection({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  const add = (t: string) => {
    if (!t.trim()) return;
    onAdd(t.trim());
    setOpen(false);
    setCustom("");
  };
  return (
    <div ref={ref} className="relative border-b border-line/70 px-2 py-3" {...(open ? { "data-popover": "" } : {})}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[15px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
        <Plus className="size-4" /> Add section
      </button>
      {open && (
        <div className="absolute top-full left-2 z-40 -mt-1 w-64 rounded-xl border border-line bg-surface p-2 shadow-2xl">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((t) => (
              <button key={t} onClick={() => add(t)} className="rounded-full border border-line px-3 py-1 text-[13px] font-semibold text-muted hover:border-accent hover:text-fg">
                {t}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => (e.preventDefault(), add(custom))} className="mt-2 flex gap-1.5">
            <input
              autoFocus
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Or name it…"
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[14px] outline-none focus:border-accent"
            />
            <button className="rounded-lg bg-accent px-3 text-[13px] font-bold text-on-accent">Add</button>
          </form>
        </div>
      )}
    </div>
  );
}
