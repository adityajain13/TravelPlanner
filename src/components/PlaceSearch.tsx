import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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

// The same place from both sources: keep Google's (it brings details and photos)
const fold = (t?: string) => (t ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const placeWords = (t?: string) => new Set(fold(t).split(" ").filter((w) => w.length >= 4));
const rowCls = (on: boolean) => `flex w-full items-start gap-3 px-3 py-2 text-left ${on ? "bg-surface-2" : ""}`;

interface SearchKeyContext {
  rows: Row[];
  active: number;
  setActive: Dispatch<SetStateAction<number>>;
  choose: (row: Row) => void;
  onCancel?: () => void;
  setOpen: (open: boolean) => void;
}

/** Keys in the search box: arrows move through the rows, Enter picks the active one, Escape closes. */
function handleSearchKey(e: React.KeyboardEvent, { rows, active, setActive, choose, onCancel, setOpen }: SearchKeyContext) {
  if (!rows.length) return;
  if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => (a + 1) % rows.length));
  else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => (a - 1 + rows.length) % rows.length));
  else if (e.key === "Enter") (e.preventDefault(), rows[active] && choose(rows[active]));
  else if (e.key === "Escape") (setOpen(false), onCancel?.());
}

/** One list ranked by how well each name matches what was typed, wherever it came from: a
 * Google suggestion named exactly "Drum Tao Theater Kyoto" beats OSM's "Sugi Drug". Loose OSM
 * matches are dropped when Google has a good one. */
function buildRows(term: string, results: PlaceResult[], google: GoogleSuggestion[], isLink: boolean): Row[] {
  const scored = [
    ...results.map((r) => ({ row: { kind: "osm" as const, r }, score: textScore(term, r) })),
    ...google.map((g) => ({ row: { kind: "google" as const, s: g }, score: textScore(term, { name: g.main, address: g.secondary }) + 0.02 })),
  ];
  const bestGoogle = Math.max(-1, ...scored.filter((x) => x.row.kind === "google").map((x) => x.score));
  const dupOfGoogle = (r: PlaceResult) =>
    google.some((g) => {
      if (fold(g.main) !== fold(r.name)) return false;
      const gw = placeWords(g.secondary);
      return [...placeWords(r.address)].some((w) => gw.has(w));
    });
  const ranked = scored
    .filter((x) => !(x.row.kind === "osm" && ((bestGoogle >= 0.75 && x.score < 0.5) || dupOfGoogle(x.row.r))))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.row as Row);
  return [...ranked, ...(isLink ? [] : [{ kind: "note" as const }])];
}

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

  const reset = () => (setQ(""), setResults([]), setGoogle([]), setOpen(false));
  // Touch screens: put the keyboard away once a place is picked (desktop keeps focus for the next search)
  const dropKeyboard = () => {
    if (matchMedia("(pointer: coarse)").matches) wrap.current?.querySelector("input")?.blur();
  };
  const pick = (p: PlaceResult) => (onPick(p), reset(), dropKeyboard());
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
  const note = () => (q.trim() && onNote(q.trim()), reset());

  const rows = buildRows(q.trim(), results, google, isLink);
  const choose = (row: Row) => (row.kind === "osm" ? pick(row.r) : row.kind === "google" ? void pickGoogle(row.s) : note());

  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <SearchBox
        busy={loading || !!resolving}
        value={q}
        onChange={(v) => (setQ(v), setOpen(true))}
        onFocus={() => setOpen(true)}
        onBlur={() => !q.trim() && onCancel?.()}
        autoFocus={autoFocus}
        onKeyDown={(e) => handleSearchKey(e, { rows, active, setActive, choose, onCancel, setOpen })}
        placeholder={placeholder ?? (onCancel ? "Add a place or note here" : "Add a place or paste a Google Maps link")}
      />
      {open && q.trim().length >= 2 && (
        <SuggestionMenu
          rows={rows} active={active} resolving={resolving} isLink={isLink} loading={loading} error={error} q={q} googleCount={google.length}
          onHover={setActive} onOsm={pick} onGoogle={pickGoogle} onNote={note}
        />
      )}
    </div>
  );
}

/** The dropdown under the search box: ranked places, the loading and error lines, and the note row. */
function SuggestionMenu({
  rows,
  active,
  resolving,
  isLink,
  loading,
  error,
  q,
  googleCount,
  onHover,
  onOsm,
  onGoogle,
  onNote,
}: {
  rows: Row[];
  active: number;
  resolving: string | null;
  isLink: boolean;
  loading: boolean;
  error: string | null;
  q: string;
  googleCount: number;
  onHover: (i: number) => void;
  onOsm: (r: PlaceResult) => void;
  onGoogle: (s: GoogleSuggestion) => void;
  onNote: () => void;
}) {
  return (
    <ul data-popover className="absolute inset-x-0 top-full z-30 mt-1 max-h-[22rem] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-2xl">
      {rows.map((row, i) =>
        row.kind === "osm" ? (
          <OsmRow key={`o-${row.r.osmId}`} r={row.r} on={i === active} onPick={() => onOsm(row.r)} onHover={() => onHover(i)} />
        ) : row.kind === "google" ? (
          <GoogleRow key={`g-${row.s.placeId}`} s={row.s} on={i === active} resolving={resolving} onPick={() => onGoogle(row.s)} onHover={() => onHover(i)} />
        ) : null,
      )}
      {isLink && loading && <li className="px-3 py-2 text-xs text-muted">Opening Google Maps link…</li>}
      {error && <li className="px-3 py-2 text-xs text-muted">{error}</li>}
      {!isLink && <NoteRow q={q} on={active === rows.length - 1} onNote={onNote} onHover={() => onHover(rows.length - 1)} />}
      <li className="px-3 pt-1 pb-1.5 text-[10px] text-muted/70">
        Search © OpenStreetMap contributors · Photon{GOOGLE_KEY && googleCount > 0 ? " · Places by Google" : ""}
      </li>
    </ul>
  );
}

function SearchBox({
  busy,
  value,
  onChange,
  onFocus,
  onBlur,
  autoFocus,
  onKeyDown,
  placeholder,
}: {
  busy: boolean;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  autoFocus?: boolean;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 focus-within:border-accent">
      {busy ? <Loader2 className="size-4 animate-spin text-muted" /> : <Search className="size-4 text-muted" />}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted/80"
      />
    </div>
  );
}

function OsmRow({ r, on, onPick, onHover }: { r: PlaceResult; on: boolean; onPick: () => void; onHover: () => void }) {
  return (
    <li>
      <button onMouseDown={(e) => e.preventDefault()} onClick={onPick} onMouseEnter={onHover} className={rowCls(on)}>
        <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
        <span className="min-w-0">
          <span className="block truncate text-[15px]">{r.name}</span>
          <span className="block truncate text-xs text-muted">{[r.category && r.category[0].toUpperCase() + r.category.slice(1), r.address].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
    </li>
  );
}

function GoogleRow({ s, on, resolving, onPick, onHover }: { s: GoogleSuggestion; on: boolean; resolving: string | null; onPick: () => void; onHover: () => void }) {
  return (
    <li>
      <button disabled={!!resolving} onMouseDown={(e) => e.preventDefault()} onClick={onPick} onMouseEnter={onHover} className={rowCls(on)}>
        {resolving === s.placeId ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted" /> : <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />}
        <span className="min-w-0">
          <span className="block truncate text-[15px]">{s.main}</span>
          {s.secondary && <span className="block truncate text-xs text-muted">{s.secondary}</span>}
        </span>
      </button>
    </li>
  );
}

function NoteRow({ q, on, onNote, onHover }: { q: string; on: boolean; onNote: () => void; onHover: () => void }) {
  return (
    <li>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onNote}
        onMouseEnter={onHover}
        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${on ? "bg-surface-2" : ""}`}
      >
        <StickyNote className="size-4 shrink-0 text-muted" />
        Add “{q.trim()}” as a note
      </button>
    </li>
  );
}
