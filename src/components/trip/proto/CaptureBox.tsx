// PROTOTYPE (proto/trip-focus): the one box for getting ideas in. A place name searches (OpenStreetMap
// via his Photon search), a Google Maps link adds that place, and anything else (a thought, any other
// link) can be saved straight away as a rough idea that needs a place later.
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Lightbulb, Loader2, MapPin, Plus, Star } from "lucide-react";
import { searchPlaces, type PlaceResult } from "../../../lib/photon";
import { isMapsLink, placesFromLink } from "../../../lib/gmaps";
import { URL_RE } from "../../../lib/protoIdeas";

/** Something already on the trip that looks like what's being typed */
export type Existing = { id: string; name: string; sub: string; onDay: boolean };

export function CaptureBox({
  near,
  countryCode,
  placesOnly,
  initial = "",
  autoFocus,
  placeholder = "Add an idea: a place, a link, or a thought",
  onPlace,
  onRough,
  onCancel,
  existing,
  onExisting,
}: {
  near?: [number, number];
  countryCode?: string;
  /** Finding a place for a rough idea: no "save as rough" row */
  placesOnly?: boolean;
  initial?: string;
  autoFocus?: boolean;
  placeholder?: string;
  onPlace: (p: PlaceResult) => void;
  onRough?: (text: string) => void;
  onCancel?: () => void;
  /** Ideas and stops whose names look like the text: listed first, so a near-duplicate is the obvious pick */
  existing?: (text: string) => Existing[];
  onExisting?: (e: Existing) => void;
}) {
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [hi, setHi] = useState(0);
  const [focused, setFocused] = useState(!!autoFocus);
  const text = q.trim();
  const isLink = URL_RE.test(text);
  const isMaps = isMapsLink(text);
  const seq = useRef(0);

  useEffect(() => {
    setResults([]);
    setHi(0);
    if (text.length < 3 || (isLink && !isMaps)) return;
    const n = ++seq.current;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = isMaps ? await placesFromLink(text, ctl.signal) : await searchPlaces(text, near, ctl.signal, countryCode);
        if (n === seq.current) setResults(r.slice(0, 5));
      } catch {
        /* aborted or offline: the rough row still works */
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 250);
    return () => (clearTimeout(t), ctl.abort());
  }, [text, isLink, isMaps, near?.[0], near?.[1], countryCode]);

  const roughRow = !placesOnly && !!onRough && text.length > 0;
  const same = existing && onExisting && !isLink ? existing(text).slice(0, 3) : [];
  const rows = same.length + results.length + (roughRow ? 1 : 0);
  const choose = (i: number) => {
    if (i < same.length) onExisting!(same[i]);
    else if (i < same.length + results.length) onPlace(results[i - same.length]);
    else if (roughRow) onRough!(text);
    else return;
    setQ("");
    setResults([]);
  };

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 rounded-2xl border bg-surface px-3.5 py-2.5 transition-colors ${focused ? "border-accent shadow-[0_0_0_3px_rgb(31_157_85/.12)]" : "border-line"}`}>
        {busy ? <Loader2 className="size-[18px] shrink-0 animate-spin text-muted" /> : <Plus className="size-[18px] shrink-0 text-accent" />}
        <input
          autoFocus={autoFocus}
          value={q}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          // A prefilled box (finding a place for a rough idea) selects its text, so typing replaces it
          onFocus={(e) => (setFocused(true), initial && e.target.select())}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (rows) setHi((h) => (h + (e.key === "ArrowDown" ? 1 : rows - 1)) % rows);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(hi);
            } else if (e.key === "Escape") {
              setQ("");
              onCancel?.();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
        />
      </div>
      {focused && rows > 0 && (
        <ul className="absolute top-full right-0 left-0 z-40 mt-1.5 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-2xl">
          {same.map((x, i) => (
            <li key={`x-${x.id}`}>
              <button
                onMouseDown={(e) => (e.preventDefault(), choose(i))}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left ${i === hi ? "bg-amber-400/15" : ""}`}
              >
                {x.onDay ? <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" /> : <Star className="mt-0.5 size-4 shrink-0 text-amber-500" />}
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{x.name}</span>
                  <span className="block truncate text-[12px] text-muted">{x.sub}</span>
                </span>
              </button>
            </li>
          ))}
          {same.length > 0 && results.length > 0 && <li className="mx-3 my-1 border-t border-line" aria-hidden />}
          {results.map((r, j) => {
            const i = same.length + j;
            return (
            <li key={r.osmId}>
              <button
                onMouseDown={(e) => (e.preventDefault(), choose(i))}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left ${i === hi ? "bg-accent/12" : ""}`}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{r.name}</span>
                  <span className="block truncate text-[12px] text-muted">{r.address || r.category}</span>
                </span>
              </button>
            </li>
            );
          })}
          {roughRow && (
            <li>
              <button
                onMouseDown={(e) => (e.preventDefault(), choose(rows - 1))}
                onMouseEnter={() => setHi(rows - 1)}
                className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left ${hi === rows - 1 ? "bg-accent/12" : ""} ${rows > 1 ? "border-t border-line" : ""}`}
              >
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <span className="min-w-0">
                  <span className="block truncate text-[14px]">
                    Save {isLink ? "link" : "“" + text + "”"} as an idea
                  </span>
                  <span className="block text-[12px] text-muted">No place yet: find one later</span>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
