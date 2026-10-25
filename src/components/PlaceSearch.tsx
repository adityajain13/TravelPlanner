import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, StickyNote } from "lucide-react";
import { searchPlaces, type PlaceResult } from "../lib/photon";

interface Props {
  near?: [number, number];
  countryCode?: string;
  onPick: (p: PlaceResult) => void;
  onNote: (text: string) => void;
}

/** "Add a place" box at the bottom of each day/list. Photon results, or save the text as a note. */
export function PlaceSearch({ near, countryCode, onPick, onNote }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        setResults(await searchPlaces(term, near, ctrl.signal, countryCode));
        setActive(0);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(navigator.onLine ? "Search failed" : "Offline — save it as a note instead");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, near, countryCode]);

  useEffect(() => {
    const close = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const reset = () => {
    setQ("");
    setResults([]);
    setOpen(false);
  };
  const pick = (p: PlaceResult) => {
    onPick(p);
    reset();
  };
  const note = () => {
    if (q.trim()) onNote(q.trim());
    reset();
  };

  function onKey(e: React.KeyboardEvent) {
    const n = results.length + 1; // +1 for the "add as note" row
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => (a + 1) % n));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => (a - 1 + n) % n));
    else if (e.key === "Enter") {
      e.preventDefault();
      if (active < results.length) pick(results[active]);
      else note();
    } else if (e.key === "Escape") setOpen(false);
  }

  const showMenu = open && q.trim().length >= 2;

  return (
    <div ref={wrap} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 focus-within:border-accent">
        {loading ? <Loader2 className="size-4 animate-spin text-muted" /> : <Search className="size-4 text-muted" />}
        <input
          value={q}
          onChange={(e) => (setQ(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Add a place"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted/80"
        />
      </div>
      {showMenu && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-2xl">
          {results.map((r, i) => (
            <li key={r.osmId}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-start gap-3 px-3 py-2 text-left ${i === active ? "bg-surface-2" : ""}`}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{r.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[r.category, r.address].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {error && <li className="px-3 py-2 text-xs text-muted">{error}</li>}
          <li>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={note}
              onMouseEnter={() => setActive(results.length)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${active === results.length ? "bg-surface-2" : ""}`}
            >
              <StickyNote className="size-4 shrink-0 text-muted" />
              Add “{q.trim()}” as a note
            </button>
          </li>
          <li className="px-3 pt-1 pb-1.5 text-[10px] text-muted/70">Search © OpenStreetMap contributors · Photon</li>
        </ul>
      )}
    </div>
  );
}
