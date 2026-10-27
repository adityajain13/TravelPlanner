import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, StickyNote } from "lucide-react";
import { searchPlaces, type PlaceResult } from "../lib/photon";
import { textScore } from "../lib/geocode";
import { isMapsLink, placeFromSuggestion, placesFromLink } from "../lib/gmaps";
import { autocomplete, GOOGLE_KEY, type GoogleSuggestion } from "../lib/google";

interface Props {
  near?: [number, number];
  countryCode?: string;
  onPick: (p: PlaceResult) => void;
  onNote: (text: string) => void;
  autoFocus?: boolean;
  /** Escape, or leaving the box empty (used by the inline "insert here" search). */
  onCancel?: () => void;
  placeholder?: string;
}

type Row = { kind: "osm"; r: PlaceResult } | { kind: "google"; s: GoogleSuggestion } | { kind: "note" };

/**
 * "Add a place": OpenStreetMap results (nearby and worldwide, ranked by name match), Google
 * suggestions for what OSM doesn't know, a pasted Google Maps link, or the text as a note.
 */
export function PlaceSearch({ near, countryCode, onPick, onNote, autoFocus, onCancel, placeholder }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [google, setGoogle] = useState<GoogleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const isLink = isMapsLink(q);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setGoogle([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      if (isMapsLink(term)) {
        setGoogle([]);
        try {
          setResults(await placesFromLink(term, ctrl.signal));
        } catch (e) {
          if (!ctrl.signal.aborted) setError((e as Error).message);
        }
      } else {
        const [osm, g] = await Promise.allSettled([searchPlaces(term, near, ctrl.signal, countryCode), autocomplete(term, near, ctrl.signal)]);
        if (ctrl.signal.aborted) return;
        setResults(osm.status === "fulfilled" ? osm.value.slice(0, 6) : []);
        setGoogle(g.status === "fulfilled" ? g.value : []);
        if (osm.status === "rejected" && g.status !== "fulfilled") setError(navigator.onLine ? "Search failed" : "Offline — save it as a note instead");
      }
      setActive(0);
      if (!ctrl.signal.aborted) setLoading(false);
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
    setGoogle([]);
    setOpen(false);
  };
  const pick = (p: PlaceResult) => {
    onPick(p);
    reset();
  };
  const pickGoogle = async (s: GoogleSuggestion) => {
    setResolving(s.placeId);
    try {
      pick(await placeFromSuggestion(s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResolving(null);
    }
  };
  const note = () => {
    if (q.trim()) onNote(q.trim());
    reset();
  };

  // One list ranked by how well each name matches what was typed, wherever it came from: a
  // Google suggestion named exactly "Drum Tao Theater Kyoto" beats OSM's "Sugi Drug". Loose OSM
  // matches are dropped when Google has a good one.
  const term = q.trim();
  const scored = [
    ...results.map((r) => ({ row: { kind: "osm" as const, r }, score: textScore(term, r) })),
    ...google.map((g) => ({ row: { kind: "google" as const, s: g }, score: textScore(term, { name: g.main, address: g.secondary }) + 0.02 })),
  ];
  const bestGoogle = Math.max(-1, ...scored.filter((x) => x.row.kind === "google").map((x) => x.score));
  const ranked = scored
    .filter((x) => !(x.row.kind === "osm" && bestGoogle >= 0.75 && x.score < 0.5))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.row as Row);
  const rows: Row[] = [...ranked, ...(isLink ? [] : [{ kind: "note" as const }])];
  const choose = (row: Row) => (row.kind === "osm" ? pick(row.r) : row.kind === "google" ? void pickGoogle(row.s) : note());

  function onKey(e: React.KeyboardEvent) {
    if (!rows.length) return;
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => (a + 1) % rows.length));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => (a - 1 + rows.length) % rows.length));
    else if (e.key === "Enter") (e.preventDefault(), rows[active] && choose(rows[active]));
    else if (e.key === "Escape") (setOpen(false), onCancel?.());
  }

  const showMenu = open && q.trim().length >= 2;
  const rowCls = (i: number) => `flex w-full items-start gap-3 px-3 py-2 text-left ${i === active ? "bg-surface-2" : ""}`;

  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 focus-within:border-accent">
        {loading || resolving ? <Loader2 className="size-4 animate-spin text-muted" /> : <Search className="size-4 text-muted" />}
        <input
          value={q}
          onChange={(e) => (setQ(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onBlur={() => !q.trim() && onCancel?.()}
          autoFocus={autoFocus}
          onKeyDown={onKey}
          placeholder={placeholder ?? (onCancel ? "Add a place or note here" : "Add a place or paste a Google Maps link")}
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted/80"
        />
      </div>
      {showMenu && (
        <ul data-popover className="absolute inset-x-0 top-full z-30 mt-1 max-h-[22rem] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-2xl">
          {rows.map((row, i) =>
            row.kind === "osm" ? (
              <li key={`o-${row.r.osmId}`}>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(row.r)} onMouseEnter={() => setActive(i)} className={rowCls(i)}>
                  <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{row.r.name}</span>
                    <span className="block truncate text-xs text-muted">{[row.r.category && row.r.category[0].toUpperCase() + row.r.category.slice(1), row.r.address].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ) : row.kind === "google" ? (
              <li key={`g-${row.s.placeId}`}>
                <button disabled={!!resolving} onMouseDown={(e) => e.preventDefault()} onClick={() => pickGoogle(row.s)} onMouseEnter={() => setActive(i)} className={rowCls(i)}>
                  {resolving === row.s.placeId ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted" /> : <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />}
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{row.s.main}</span>
                    {row.s.secondary && <span className="block truncate text-xs text-muted">{row.s.secondary}</span>}
                  </span>
                </button>
              </li>
            ) : null,
          )}
          {isLink && loading && <li className="px-3 py-2 text-xs text-muted">Opening Google Maps link…</li>}
          {error && <li className="px-3 py-2 text-xs text-muted">{error}</li>}
          {!isLink && (
            <li>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={note}
                onMouseEnter={() => setActive(rows.length - 1)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${active === rows.length - 1 ? "bg-surface-2" : ""}`}
              >
                <StickyNote className="size-4 shrink-0 text-muted" />
                Add “{q.trim()}” as a note
              </button>
            </li>
          )}
          <li className="px-3 pt-1 pb-1.5 text-[10px] text-muted/70">
            Search © OpenStreetMap contributors · Photon{GOOGLE_KEY && google.length > 0 ? " · Places by Google" : ""}
          </li>
        </ul>
      )}
    </div>
  );
}
