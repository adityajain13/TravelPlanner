import { useMemo, useRef, useState } from "react";
import { CurrencySelect } from "./CurrencySelect";
import { useNavigate } from "react-router-dom";
import { FileUp, Loader2, MapPin, X } from "lucide-react";
import { parseWanderlog, type RawItem, type WanderlogTrip } from "../lib/wanderlog/parse";
import { extractPdf } from "../lib/wanderlog/extract";
import { importWanderlog, type Progress } from "../lib/wanderlog/importTrip";
import { formatRange } from "../lib/dates";
import { inputCls } from "./NewTripDialog";

const SYMBOL_CURRENCY: Record<string, string> = { "€": "EUR", "£": "GBP", "¥": "JPY", "₩": "KRW", "₹": "INR", $: "CAD" };

/** Places in the trip: the stops on each day (notes excluded) plus the stops in lists. */
const countStops = (trip: WanderlogTrip) => trip.days.reduce((n, d) => n + d.stops.filter((s) => !s.note).length, 0) + trip.lists.reduce((n, l) => n + l.stops.length, 0);
/** How many bookings of one type the PDF has. */
const countType = (trip: WanderlogTrip, type: string) => trip.reservations.filter((r) => r.type === type).length;

/** The parsed trip for the PDF pages read so far; null until there are pages, or when parsing throws. */
function parseOrNull(pages: RawItem[][] | null, year?: number): WanderlogTrip | null {
  if (!pages) return null;
  try {
    return parseWanderlog(pages, year);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Home → Import from Wanderlog: PDF from "Print this trip", parsed in the browser. No AI, no upload. */
export function WanderlogImport({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [pages, setPages] = useState<RawItem[][] | null>(null);
  const [year, setYear] = useState<number | undefined>();
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [currency, setCurrency] = useState("CAD");
  const [findPins, setFindPins] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const trip: WanderlogTrip | null = useMemo(() => parseOrNull(pages, year), [pages, year]);

  async function pick(file?: File) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const { pages: p, title: pdfTitle } = await extractPdf(file);
      const t = parseWanderlog(p);
      if (!t.days.length && !t.reservations.length) throw new Error("This doesn't look like a Wanderlog trip PDF (use ⋯ → Print this trip → Save as PDF).");
      setPages(p);
      setYear(t.year);
      setTitle(pdfTitle || t.title);
      setDestination((pdfTitle || t.title).replace(/^(trip|travel|vacation|holiday)s? (to|in) /i, ""));
      setCurrency(SYMBOL_CURRENCY[t.currencySymbol] ?? "CAD");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!trip) return;
    ctrl.current = new AbortController();
    setBusy(true);
    try {
      const { id, unpinned } = await importWanderlog(trip, { title: title.trim() || trip.title, destination: destination.trim() || trip.title, currency, findPins }, setProgress, ctrl.current.signal);
      if (unpinned.length) sessionStorage.setItem(`tp-unpinned-${id}`, JSON.stringify(unpinned));
      navigate(`/trip/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Import from Wanderlog</h2>
          {!busy && (
            <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">
              <X className="size-5" />
            </button>
          )}
        </div>

        {!trip && <PickStep busy={busy} onFile={pick} />}

        {trip && !progress && (
          <div className="space-y-4">
            <ImportFields title={title} destination={destination} year={year} onTitle={setTitle} onDestination={setDestination} onYear={setYear} />
            <ReviewSummary trip={trip} />
            <ImportOptions findPins={findPins} currency={currency} onFindPins={setFindPins} onCurrency={setCurrency} />
            {trip.warnings.map((w) => (
              <p key={w} className="text-xs text-muted">
                {w}
              </p>
            ))}
            <button onClick={run} disabled={busy} className="w-full rounded-xl bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-60">
              Import trip
            </button>
          </div>
        )}

        {progress && <ProgressStep progress={progress} onSkip={() => ctrl.current?.abort()} />}

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}

/** Step 1: choose the PDF (read on this device). */
function PickStep({ busy, onFile }: { busy: boolean; onFile: (file?: File) => void }) {
  return (
    <>
      <p className="text-sm text-muted">
        In Wanderlog, open the trip → <span className="text-fg">⋯ → Print this trip</span> → Save as PDF. The file is read on this device; nothing is uploaded.
      </p>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line p-8 text-sm text-muted hover:border-accent hover:text-fg">
        {busy ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" />}
        {busy ? "Reading PDF…" : "Choose the PDF"}
        <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
    </>
  );
}

/** Step 2: the editable trip name, destination and year. */
function ImportFields({
  title,
  destination,
  year,
  onTitle,
  onDestination,
  onYear,
}: {
  title: string;
  destination: string;
  year?: number;
  onTitle: (v: string) => void;
  onDestination: (v: string) => void;
  onYear: (v: number | undefined) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="col-span-2 block space-y-1">
        <span className="text-xs text-muted">Trip name</span>
        <input value={title} onChange={(e) => onTitle(e.target.value)} className={inputCls} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Destination</span>
        <input value={destination} onChange={(e) => onDestination(e.target.value)} className={inputCls} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Year</span>
        <input type="number" value={year ?? ""} onChange={(e) => onYear(Number(e.target.value) || undefined)} className={inputCls} />
      </label>
    </div>
  );
}

/** What was found in the PDF: dates, places, bookings and other expenses. */
function ReviewSummary({ trip }: { trip: WanderlogTrip }) {
  const stops = countStops(trip);
  return (
    <ul className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
      <li>{formatRange(trip.startDate, trip.endDate)} · {trip.days.length} days</li>
      <li>{stops} places{trip.lists.length ? ` (incl. ${trip.lists.length} list${trip.lists.length > 1 ? "s" : ""})` : ""}</li>
      {(countType(trip, "flight") || countType(trip, "lodging") || countType(trip, "car")) > 0 && (
        <li>
          {[countType(trip, "flight") && `${countType(trip, "flight")} flights`, countType(trip, "lodging") && `${countType(trip, "lodging")} stays`, countType(trip, "car") && `${countType(trip, "car")} car rental`, countType(trip, "other") + countType(trip, "restaurant") + countType(trip, "train") && "more bookings"]
            .filter(Boolean)
            .join(" · ")}
        </li>
      )}
      {trip.expenses.length > 0 && <li>{trip.expenses.length} other expenses</li>}
    </ul>
  );
}

/** Find-pins checkbox and the currency the costs are shown in. */
function ImportOptions({ findPins, currency, onFindPins, onCurrency }: { findPins: boolean; currency: string; onFindPins: (v: boolean) => void; onCurrency: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={findPins} onChange={(e) => onFindPins(e.target.checked)} className="accent-[var(--accent)]" />
        Find map pins <span className="text-muted">(~1 min)</span>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-muted">Costs in</span>
        <CurrencySelect value={currency} onChange={onCurrency} className="bg-surface-2" />
      </label>
    </div>
  );
}

/** Step 3: the import running, with a bar and a way to skip the rest. */
function ProgressStep({ progress, onSkip }: { progress: Progress; onSkip: () => void }) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin text-accent" />
        {progress.phase === "creating" ? "Creating trip…" : `Placing pins ${progress.done}/${progress.total}`}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <MapPin className="size-3.5" /> Each place is matched near the previous stop, preferring countries the trip visits.
      </p>
      <button onClick={onSkip} className="text-xs text-muted hover:text-fg">
        Skip the rest. You can pin them later.
      </button>
    </div>
  );
}
