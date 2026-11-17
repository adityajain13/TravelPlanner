// PROTOTYPE (proto/new-trip): destination input with suggestions and validation.
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Globe2, AlertCircle } from "lucide-react";
import { localDestinations, resolveDestination, searchDestinations, type Destination } from "../../lib/destinations";
import { inputCls } from "../NewTripDialog";

type Status = "idle" | "searching" | "results" | "none" | "offline";
export type DestValue = { text: string; place: Destination | null; freeform: boolean };

/**
 * Typing shows matching countries, regions and cities: built-in matches instantly (forgiving of nicknames
 * and typos), the wider search a moment later. A destination only counts once one is picked (click,
 * arrows + Enter, or Enter for the top match). While typing, the highlighted suggestion is sent to
 * onPreview so the globe can start heading there. Nothing found: an error, with "use anyway".
 */
export function DestinationField({
  value,
  onChange,
  onPreview,
  autoFocus,
  large,
}: {
  value: DestValue;
  onChange: (v: DestValue) => void;
  onPreview?: (d: Destination | null) => void;
  autoFocus?: boolean;
  large?: boolean;
}) {
  const [results, setResults] = useState<Destination[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const previewFor = useRef<Destination | null>(null);

  const q = value.text.trim();
  const chosen = !!value.place || value.freeform;

  // Built-in matches straight away, then the merged list after a short pause
  useEffect(() => {
    if (chosen || q.length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const local = localDestinations(q);
    setResults(local);
    setActive(0);
    setStatus(local.length ? "results" : "searching");
    const ctl = new AbortController();
    const t = setTimeout(() => {
      if (!local.length) setStatus("searching");
      searchDestinations(q, ctl.signal)
        .then((r) => {
          setResults(r);
          setStatus(r.length ? "results" : "none");
        })
        .catch((e) => {
          if ((e as Error).name !== "AbortError") setStatus(navigator.onLine ? "none" : "offline");
        });
    }, 180);
    return () => (clearTimeout(t), ctl.abort());
  }, [q, chosen]);

  // Preview the highlighted suggestion on the globe (built-in countries need their coordinates first)
  const highlighted = !chosen && open ? (results[active] ?? null) : null;
  useEffect(() => {
    if (!onPreview || chosen) return;
    if (!highlighted) return;
    previewFor.current = highlighted;
    const ctl = new AbortController();
    resolveDestination(highlighted, ctl.signal)
      .then((d) => previewFor.current === highlighted && onPreview(d))
      .catch(() => {});
    return () => ctl.abort();
  }, [highlighted, chosen, onPreview]);

  // Close suggestions on outside click
  useEffect(() => {
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const pick = async (d: Destination) => {
    setOpen(false);
    setTouched(true);
    onChange({ text: d.name, place: d, freeform: false });
    const full = await resolveDestination(d).catch(() => d);
    if (full !== d) onChange({ text: full.name, place: full, freeform: false });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setOpen(true), setActive((a) => Math.min(a + 1, results.length - 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter" && !chosen) {
      e.preventDefault();
      if (results[active]) void pick(results[active]);
      else setTouched(true);
    }
  };

  const showError = touched && !chosen && q.length > 0 && (status === "none" || status === "offline");
  const needsPick = touched && !chosen && status === "results";

  return (
    <div ref={wrap} className="relative">
      <div className="relative">
        <MapPin className={`pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted ${large ? "size-5" : "size-4"}`} />
        <input
          autoFocus={autoFocus}
          value={value.text}
          onChange={(e) => {
            onChange({ text: e.target.value, place: null, freeform: false });
            setOpen(true);
            setTouched(false);
            if (!e.target.value.trim()) onPreview?.(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => q && setTouched(true)}
          onKeyDown={onKey}
          placeholder="Kyoto, Japan"
          aria-invalid={showError}
          className={`${inputCls} ${large ? "py-3 pl-10 text-lg" : "pl-9"} ${showError ? "border-danger focus:border-danger" : ""}`}
        />
        {status === "searching" && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted" />}
      </div>

      {open && !chosen && results.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          {results.map((d, i) => (
            <li key={`${d.name}-${d.context}-${d.countryCode}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(d)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${i === active ? "bg-surface-2" : ""}`}
              >
                {d.kind === "country" ? <Globe2 className="size-4 shrink-0 text-accent" /> : <MapPin className="size-4 shrink-0 text-muted" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{d.name}</span>
                  <span className="block truncate text-xs text-muted">{[cap(d.kind), d.context].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showError && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>
            {status === "offline" ? "You're offline, so we can't look this up." : <>We couldn't find “{q}”. Check the spelling.</>}{" "}
            <button type="button" className="text-muted underline hover:text-fg" onClick={() => onChange({ ...value, freeform: true })}>
              Use “{q}” anyway
            </button>
          </span>
        </p>
      )}
      {needsPick && <p className="mt-2 text-sm text-muted">Pick a place from the list.</p>}
      {value.freeform && <p className="mt-2 text-xs text-muted">Not on the map. You can still plan, and the map starts zoomed out.</p>}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
