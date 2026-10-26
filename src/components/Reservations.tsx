import { airportsNow, flightAirports, flightInstant, localToUtc } from "../lib/airports";
import { useState } from "react";
import { CurrencySelect } from "./CurrencySelect";
import { DateField } from "./DatePicker";
import { TimeField } from "./TimeField";
import { AddressSearch } from "./AddressSearch";
import type * as Y from "yjs";
import { BedDouble, Car, ChevronDown, Inbox, Loader2, Mail, PenLine, Pencil, Plane, Plus, Ticket, TrainFront, Trash2, Utensils, X } from "lucide-react";
import { PlaceSearch } from "./PlaceSearch";
import { ForwardDialog } from "./ForwardDialog";
import { askConfirm } from "./ConfirmDialog";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import type { PlaceResult } from "../lib/photon";
import { removeFromEmail, removeReservation, saveReservation, sortReservations, type Reservation, type ReservationType, type TripState } from "../lib/trips";
import { searchPlaces } from "../lib/photon";
import { formatMoney } from "../lib/fx";
import { inputCls } from "./NewTripDialog";

export const RES_ICON: Record<ReservationType, React.ReactNode> = {
  flight: <Plane className="size-4" />,
  lodging: <BedDouble className="size-4" />,
  car: <Car className="size-4" />,
  train: <TrainFront className="size-4" />,
  restaurant: <Utensils className="size-4" />,
  other: <Ticket className="size-4" />,
};

export const RES_LABEL: Record<ReservationType, string> = {
  flight: "Flights",
  lodging: "Lodging",
  car: "Rental cars",
  train: "Trains & buses",
  restaurant: "Restaurants",
  other: "Other",
};

export const RES_SINGULAR: Record<ReservationType, string> = {
  flight: "Flight",
  lodging: "Lodging",
  car: "Rental car",
  train: "Train / bus",
  restaurant: "Restaurant",
  other: "Other",
};

/** Field labels per type; a missing label hides that field. */
const FIELDS: Record<ReservationType, Partial<Record<"title" | "from" | "to" | "address" | "start" | "end", string>>> = {
  flight: { title: "Flight (e.g. AC1 Air Canada)", from: "From (airport)", to: "To (airport)", start: "Departs", end: "Arrives" },
  lodging: { title: "Name", address: "Address", start: "Check-in", end: "Check-out" },
  car: { title: "Company", from: "Pick-up location", to: "Drop-off location", start: "Pick-up", end: "Drop-off" },
  train: { title: "Train / bus (e.g. Nozomi 21)", from: "From", to: "To", start: "Departs", end: "Arrives" },
  restaurant: { title: "Restaurant", address: "Address", start: "Reservation" },
  other: { title: "Title", address: "Address", start: "Starts", end: "Ends" },
};

const GEOCODE: ReservationType[] = ["lodging", "restaurant", "other"];


const ADD_LABEL: Record<ReservationType, string> = {
  flight: "flight",
  lodging: "lodging",
  car: "rental car",
  train: "train or bus",
  restaurant: "restaurant",
  other: "reservation",
};
const SECTION_TITLE: Record<ReservationType, string> = { ...RES_LABEL, lodging: "Hotels and lodging", train: "Trains and buses", other: "Other reservations" };
/** Types where "search for a place" makes sense (a venue with an address). */
const SEARCHABLE: ReservationType[] = ["lodging", "car", "restaurant", "other"];

// "Fri, 2nd Dec"
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
function niceDate(d?: string) {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00Z`);
  const wd = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(dt);
  const mo = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(dt);
  return `${wd}, ${ordinal(dt.getUTCDate())} ${mo}`;
}
const niceTime = (t?: string) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, h, m));
};
const at = (d?: string, t?: string) => [niceDate(d), niceTime(t)].filter(Boolean).join(" • ");

export function ReservationsPanel({ doc, state, readOnly, tripId, canForward }: { doc: Y.Doc; state: TripState; readOnly: boolean; tripId?: string; canForward?: boolean }) {
  const [editing, setEditing] = useState<Partial<Reservation> | null>(null);
  const [forward, setForward] = useState<"forward" | "history" | null>(null);
  const [collapsed, setCollapsed] = useState<Set<ReservationType>>(new Set());
  const types = Object.keys(RES_LABEL) as ReservationType[];
  const currency = state.meta.currency ?? "CAD";
  const tripTitles = useLiveQuery(async () => Object.fromEntries((await db.trips.toArray()).map((t) => [t.id, t.title])), []);

  return (
    <div className="px-2 pt-6 pb-4">
      {canForward && !readOnly && (
        <div className="mb-2 flex flex-wrap gap-2">
          <button onClick={() => setForward("forward")} className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[15px] font-semibold text-muted hover:border-accent hover:text-fg">
            <Mail className="size-4" /> Forward a confirmation
          </button>
          <button onClick={() => setForward("history")} className="flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
            <Inbox className="size-4" /> Imported emails
          </button>
        </div>
      )}

      {types.map((t) => {
        const list = sortReservations(state.reservations.filter((r) => r.type === t));
        if (readOnly && !list.length) return null;
        const open = !collapsed.has(t);
        return (
          <section key={t} id={`res-${t}`} className="scroll-mt-28 border-b border-line/70 py-7 last:border-b-0">
            <button
              onClick={() => setCollapsed((c) => (c.has(t) ? new Set([...c].filter((x) => x !== t)) : new Set(c).add(t)))}
              className="flex w-full items-center gap-2.5 text-left"
            >
              <ChevronDown className={`size-5 text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
              <h3 className="font-display text-[26px] leading-tight">{SECTION_TITLE[t]}</h3>
              {list.length > 0 && <span className="text-[15px] text-muted tabular-nums">{list.length}</span>}
            </button>

            {open && (
              <>
                <ul className="mt-5 space-y-4">
                  {list.map((r) => (
                    <ReservationCard key={r.id} r={r} currency={currency} readOnly={readOnly} onEdit={() => setEditing(r)} onDelete={async () => (await askConfirm({ title: `Delete ${r.title}?`, body: "Its cost leaves the budget too." })) && removeReservation(doc, r.id)} />
                  ))}
                </ul>
                {!readOnly && (
                  <AddRow
                    type={t}
                    hasAny={list.length > 0}
                    near={state.meta.center}
                    onManual={() => setEditing({ type: t, startDate: state.meta.startDate })}
                    onPlace={(p) => setEditing({ type: t, startDate: state.meta.startDate, title: p.name, address: p.address, lat: p.lat, lng: p.lng })}
                    onForward={canForward ? () => setForward("forward") : undefined}
                  />
                )}
              </>
            )}
          </section>
        );
      })}

      {editing && <ReservationForm doc={doc} state={state} initial={editing} onClose={() => setEditing(null)} />}
      {forward && (
        <ForwardDialog
          tripId={tripId}
          tripTitles={tripTitles}
          initialView={forward}
          onClose={() => setForward(null)}
          onDeleteEmail={readOnly ? undefined : (rows) => removeFromEmail(doc, rows.map((r) => r.id), rows.filter((r) => r.status === "added").map((r) => ({ title: r.booking.title, startDate: r.booking.start_date })))}
        />
      )}
    </div>
  );
}

/** Wanderlog-style booking card: details on the left, confirmation # and cost on the right. */
function ReservationCard({ r, currency, readOnly, onEdit, onDelete }: { r: Reservation; currency: string; readOnly: boolean; onEdit: () => void; onDelete: () => void }) {
  const f = FIELDS[r.type];
  const route = r.from || r.to ? [r.from, r.to].filter(Boolean).join(" → ") : null;
  const twoStep = r.type === "car" || r.type === "flight" || r.type === "train";
  return (
    <li
      onClick={readOnly ? undefined : onEdit}
      className={`group relative flex gap-5 rounded-2xl border border-line/70 bg-surface p-5 transition-colors max-sm:flex-col max-sm:gap-3 ${readOnly ? "" : "cursor-pointer hover:border-line hover:bg-surface-2/60"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[18px] leading-snug font-bold">
          {r.title}
          {r.traveler && <span className="ml-2 inline-flex translate-y-[-2px] rounded-full bg-surface-2 px-2.5 py-0.5 align-middle text-[12px] font-semibold text-muted">{r.traveler}</span>}
        </p>
        {route && <p className="mt-0.5 text-[15px] text-muted">{route}</p>}
        {!twoStep && r.address && <p className="mt-0.5 truncate text-[14px] text-muted">{r.address}</p>}
        {twoStep ? (
          <div className="mt-3 space-y-2.5 text-[16px]">
            {r.startDate && (
              <div>
                <p>
                  <span className="text-muted">{f.start}: </span>
                  {at(r.startDate, r.startTime)}
                </p>
                {r.type === "car" && r.from && <p className="text-[13px] text-muted">{r.from}</p>}
              </div>
            )}
            {r.endDate && f.end && (
              <div>
                <p>
                  <span className="text-muted">{f.end}: </span>
                  {at(r.endDate, r.endTime)}
                </p>
                {r.type === "car" && r.to && <p className="text-[13px] text-muted">{r.to}</p>}
              </div>
            )}
          </div>
        ) : (
          (r.startDate || r.endDate) && (
            <p className="mt-3 text-[16px]">
              {at(r.startDate, r.startTime)}
              {r.endDate && f.end && r.endDate !== r.startDate ? ` — ${at(r.endDate, r.endTime)}` : ""}
            </p>
          )
        )}
        {r.notes && <p className="mt-3 text-[15px] whitespace-pre-wrap text-muted">{r.notes}</p>}
      </div>
      {(r.confirmation || r.cost != null) && (
        <div className="w-44 shrink-0 border-l border-line pl-5 max-sm:w-auto max-sm:border-t max-sm:border-l-0 max-sm:pt-3 max-sm:pl-0">
          {r.confirmation && (
            <>
              <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Confirmation #</p>
              <p className="mt-1 font-mono text-[17px] break-all">{r.confirmation}</p>
            </>
          )}
          {r.cost != null && (
            <span className="mt-3 inline-block rounded-full border border-line px-2.5 py-0.5 text-[13px] font-semibold text-muted">{formatMoney(r.cost, r.costCurrency ?? currency)}</span>
          )}
        </div>
      )}
      {!readOnly && (
        <div className="absolute top-3 right-3 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100" onClick={(e) => e.stopPropagation()}>
          <button onClick={onEdit} className="grid size-8 place-items-center rounded-full bg-surface text-muted hover:text-fg" title="Edit">
            <Pencil className="size-4" />
          </button>
          <button onClick={onDelete} className="grid size-8 place-items-center rounded-full bg-surface text-muted hover:text-danger" title="Delete">
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}

/** "+ Add another lodging" → search for the place, type it in, or forward the confirmation email. */
function AddRow({ type, hasAny, near, onManual, onPlace, onForward }: { type: ReservationType; hasAny: boolean; near?: [number, number]; onManual: () => void; onPlace: (p: PlaceResult) => void; onForward?: () => void }) {
  const [searching, setSearching] = useState(false);
  const btn = "flex items-center gap-2 rounded-full px-3 py-2 text-[15px] font-bold text-muted hover:bg-surface-2 hover:text-fg";
  if (searching)
    return (
      <div className="mt-4" data-popover>
        <PlaceSearch autoFocus near={near} onPick={(p) => (setSearching(false), onPlace(p))} onNote={() => (setSearching(false), onManual())} onCancel={() => setSearching(false)} />
      </div>
    );
  return (
    <div className={`${hasAny ? "mt-4" : "mt-3"} -ml-3 flex flex-wrap items-center gap-1`}>
      {SEARCHABLE.includes(type) ? (
        <button onClick={() => setSearching(true)} className={btn}>
          <Plus className="size-4" /> Add {hasAny ? "another " : ""}
          {ADD_LABEL[type]}
        </button>
      ) : (
        <button onClick={onManual} className={btn}>
          <Plus className="size-4" /> Add {hasAny ? "another " : ""}
          {ADD_LABEL[type]}
        </button>
      )}
      {SEARCHABLE.includes(type) && (
        <button onClick={onManual} className={btn}>
          <PenLine className="size-4" /> Enter details
        </button>
      )}
      {onForward && (
        <button onClick={onForward} className={btn}>
          <Mail className="size-4" /> Forward email
        </button>
      )}
    </div>
  );
}

export function ReservationForm({ doc, state, initial, onClose }: { doc: Y.Doc; state: TripState; initial: Partial<Reservation>; onClose: () => void }) {
  const [r, setR] = useState<Partial<Reservation>>({ costCurrency: state.meta.currency ?? "CAD", ...initial });
  const [busy, setBusy] = useState(false);
  const type = (r.type ?? "other") as ReservationType;
  const f = FIELDS[type];
  const set = (patch: Partial<Reservation>) => setR((x) => ({ ...x, ...patch }));

  const [picked, setPicked] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!r.title?.trim()) return;
    setBusy(true);
    let geo: Partial<Reservation> = {};
    const addressChanged = r.address !== initial.address || r.title !== initial.title;
    // A result picked from the address search is already pinned exactly
    if (!picked && GEOCODE.includes(type) && (r.address || r.title) && (addressChanged || r.lat == null)) {
      try {
        const [hit] = await searchPlaces([r.title, r.address].filter(Boolean).join(", "), state.meta.center);
        if (hit) geo = { lat: hit.lat, lng: hit.lng, address: r.address || hit.address };
      } catch {
        /* offline: save without a pin */
      }
    }
    saveReservation(doc, { ...(r as Reservation), ...geo, type, title: r.title.trim() });
    onClose();
  }

  const date = (label: string, d: "startDate" | "endDate", t: "startTime" | "endTime") => (
    <div className="block space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex gap-2">
        <DateField value={r[d]} onChange={(v) => set({ [d]: v })} min={d === "endDate" ? r.startDate : undefined} clearable placeholder="Date" className={`${inputCls} min-w-0 flex-1`} />
        <TimeField value={r[t]} onChange={(v) => set({ [t]: v })} near={t === "endTime" ? r.startTime : undefined} placeholder="Time" className={`${inputCls} !w-36 shrink-0`} />
      </div>
    </div>
  );
  const text = (label: string, k: "title" | "from" | "to" | "address" | "confirmation", required = false) => (
    <label className="block space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input required={required} value={(r[k] as string) ?? ""} onChange={(e) => set({ [k]: e.target.value })} className={inputCls} />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <span className="text-muted">{RES_ICON[type]}</span>
            {initial.id ? "Edit" : "Add"} {RES_SINGULAR[type].toLowerCase()}
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {f.title && text(f.title, "title", true)}
        <div className="block space-y-1">
          <span className="text-xs text-muted">For (passenger / guest, optional)</span>
          {/* Chips for the trip's people instead of a native suggestion list; type any other name */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[undefined, ...(state.meta.travelers ?? [])].map((t) => (
              <button
                key={t ?? "everyone"}
                type="button"
                onClick={() => set({ traveler: t })}
                className={`rounded-full px-3 py-1 text-[13px] font-semibold ${r.traveler === t ? "bg-accent text-on-accent" : "bg-surface-2 text-muted hover:text-fg"}`}
              >
                {t ?? "Everyone"}
              </button>
            ))}
            <input
              value={r.traveler && !(state.meta.travelers ?? []).includes(r.traveler) ? r.traveler : ""}
              onChange={(e) => set({ traveler: e.target.value || undefined })}
              placeholder="Someone else"
              className="min-w-0 flex-1 rounded-full bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-muted/60 focus:bg-surface-2"
            />
          </div>
        </div>
        {f.from && text(f.from, "from")}
        {f.to && text(f.to, "to")}
        {f.address && (
          <div className="block space-y-1">
            <span className="text-xs text-muted">{f.address}</span>
            <AddressSearch
              value={r.address}
              pinned={r.lat != null}
              near={state.meta.center}
              className={inputCls}
              onType={(address) => (set({ address, lat: undefined, lng: undefined }), setPicked(false))}
              onPick={(p) => (set({ address: p.address, lat: p.lat, lng: p.lng, ...(r.title?.trim() ? {} : { title: p.name }) }), setPicked(true))}
            />
          </div>
        )}
        {f.start && date(f.start, "startDate", "startTime")}
        {f.end && date(f.end, "endDate", "endTime")}
        {text("Confirmation #", "confirmation")}
        <label className="block space-y-1">
          <span className="text-xs text-muted">Cost (counts toward the budget)</span>
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              min="0"
              value={r.cost ?? ""}
              onChange={(e) => set({ cost: e.target.value === "" ? undefined : Number(e.target.value) })}
              className={inputCls}
            />
            <CurrencySelect value={r.costCurrency ?? "CAD"} onChange={(c) => set({ costCurrency: c })} className={`${inputCls} !w-auto`} />
          </div>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted">Notes</span>
          <textarea rows={2} value={r.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
        </label>
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-60">
          {busy && <Loader2 className="size-4 animate-spin" />} Save
        </button>
      </form>
    </div>
  );
}

/** Small chips shown under a day heading for bookings touching that date. */
/**
 * Chips for the bookings touching a day, in the order they happen: by the time of *that* event
 * (a flight's arrival uses its arrival time). Check-outs open the day and check-ins close it
 * (you check in after the travel that gets you there), "staying at" comes first.
 */
export function dayChips(reservations: Reservation[], date: string) {
  // time: the event's real clock time, when known (used to slot the chip between stops)
  const chips: { r: Reservation; label: string; at: string; time?: string }[] = [];
  for (const r of sortReservations(reservations)) {
    const s = r.startDate;
    const e = r.endDate;
    const t = (x?: string) => (x ? ` ${x}` : "");
    const at = (x?: string, fallback = "12:00") => x ?? fallback;
    switch (r.type) {
      case "flight":
      case "train":
        if (s === date) chips.push({ r, label: `${r.title} departs${t(r.startTime)}`, at: at(r.startTime), time: r.startTime });
        if (e === date && e !== s) chips.push({ r, label: `${r.title} arrives${t(r.endTime)}`, at: at(r.endTime), time: r.endTime });
        break;
      case "lodging":
        if (s === date) chips.push({ r, label: `Check-in ${r.title}${t(r.startTime)}`, at: "~2" + at(r.startTime) });
        else if (e === date) chips.push({ r, label: `Check-out ${r.title}${t(r.endTime)}`, at: "!" + at(r.endTime, "10:00") });
        else if (s && e && s < date && date < e) chips.push({ r, label: `Staying at ${r.title}`, at: "!" });
        break;
      case "car":
        if (s === date) chips.push({ r, label: `Pick up ${r.title}${t(r.startTime)}`, at: at(r.startTime), time: r.startTime });
        if (e === date && e !== s) chips.push({ r, label: `Drop off ${r.title}${t(r.endTime)}`, at: at(r.endTime), time: r.endTime });
        break;
      default:
        if (s === date) chips.push({ r, label: `${r.title}${t(r.startTime)}`, at: at(r.startTime), time: r.startTime });
    }
  }
  // "!" sorts before digits (morning hotel), "~" after them (evening check-in)
  // Real instants where time zones differ: a flight's own airports; other bookings that day use the
  // zone of the day's first flight airport (Tokyo 18:30 → Calgary 12:30 lands before Calgary 14:30 leaves)
  const db = airportsNow();
  const inst = new Map<(typeof chips)[number], number>();
  let dayZone: { tz?: string; lng: number } | undefined;
  for (const c of chips) {
    if (c.r.type !== "flight" || !db) continue;
    const dep = c.r.startDate === date && c.label.includes(" departs");
    const ms = flightInstant(c.r, dep ? "dep" : "arr");
    if (ms != null) inst.set(c, ms);
    const ends = flightAirports(c.r, db);
    if (ends && !dayZone) dayZone = ends[dep ? 0 : 1];
  }
  if (dayZone) for (const c of chips) if (!inst.has(c) && !/^[!~]/.test(c.at)) inst.set(c, localToUtc(date, c.time ?? c.at, dayZone));
  const rank = (c: (typeof chips)[number]) => (c.at.startsWith("!") ? 0 : c.at.startsWith("~") ? 2 : 1);
  chips.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const x = inst.get(a);
    const y = inst.get(b);
    if (x != null && y != null && x !== y) return x - y;
    return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; // plain code-point order (localeCompare ignores "!"/"~")
  });
  // One chip per booking when several travellers each have their own copy
  const merged: { r: Reservation; label: string; at: string; time?: string }[] = [];
  const count = new Map<string, number>();
  for (const c of chips) count.set(c.label, (count.get(c.label) ?? 0) + 1);
  const seen = new Set<string>();
  for (const c of chips) {
    if (seen.has(c.label)) continue;
    seen.add(c.label);
    const n = count.get(c.label)!;
    merged.push(n > 1 ? { ...c, label: `${c.label} · ${n} people` } : c);
  }
  return merged;
}
