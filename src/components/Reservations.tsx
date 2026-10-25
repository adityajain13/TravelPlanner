import { useState } from "react";
import type * as Y from "yjs";
import { BedDouble, Car, Loader2, MapPin, Pencil, Plane, Plus, Ticket, TrainFront, Trash2, Utensils, X } from "lucide-react";
import { removeReservation, saveReservation, type Reservation, type ReservationType, type TripState } from "../lib/trips";
import { searchPlaces } from "../lib/photon";
import { formatShort } from "../lib/dates";
import { CURRENCIES, formatMoney } from "../lib/fx";
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

const when = (d?: string, t?: string) => [d && formatShort(d), t].filter(Boolean).join(" ");

export function ReservationsPanel({ doc, state, readOnly }: { doc: Y.Doc; state: TripState; readOnly: boolean }) {
  const [editing, setEditing] = useState<Partial<Reservation> | null>(null);
  const types = Object.keys(RES_LABEL) as ReservationType[];

  return (
    <div className="space-y-6 px-2 py-4">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setEditing({ type: t, startDate: state.meta.startDate })}
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-fg"
            >
              <Plus className="size-3.5" />
              {RES_ICON[t]}
              {RES_SINGULAR[t]}
            </button>
          ))}
        </div>
      )}

      {state.reservations.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
          No reservations yet. Add one above, or forward a confirmation email to trips@adityajain.ca.
        </p>
      )}

      {types.map((t) => {
        const list = state.reservations.filter((r) => r.type === t);
        if (!list.length) return null;
        return (
          <section key={t}>
            <h3 className="mb-2 flex items-center gap-2 font-display text-lg">
              <span className="text-muted">{RES_ICON[t]}</span>
              {RES_LABEL[t]}
            </h3>
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id} className="group rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.title}</p>
                      {(r.from || r.to) && <p className="text-sm text-muted">{[r.from, r.to].filter(Boolean).join(" → ")}</p>}
                      {r.address && (
                        <p className="flex items-center gap-1 text-sm text-muted">
                          <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{r.address}</span>
                        </p>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                        <button onClick={() => setEditing(r)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" title="Edit">
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => confirm(`Delete "${r.title}"?`) && removeReservation(doc, r.id)}
                          className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {r.startDate && (
                      <div>
                        <p className="text-muted">{FIELDS[r.type].start}</p>
                        <p>{when(r.startDate, r.startTime)}</p>
                      </div>
                    )}
                    {r.endDate && FIELDS[r.type].end && (
                      <div>
                        <p className="text-muted">{FIELDS[r.type].end}</p>
                        <p>{when(r.endDate, r.endTime)}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {r.confirmation && (
                      <span>
                        Confirmation <span className="font-mono text-fg">{r.confirmation}</span>
                      </span>
                    )}
                    {r.cost != null && <span className="text-fg">{formatMoney(r.cost, r.costCurrency ?? state.meta.currency ?? "CAD")}</span>}
                  </div>
                  {r.notes && <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{r.notes}</p>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {editing && <ReservationForm doc={doc} state={state} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function ReservationForm({ doc, state, initial, onClose }: { doc: Y.Doc; state: TripState; initial: Partial<Reservation>; onClose: () => void }) {
  const [r, setR] = useState<Partial<Reservation>>({ costCurrency: state.meta.currency ?? "CAD", ...initial });
  const [busy, setBusy] = useState(false);
  const type = (r.type ?? "other") as ReservationType;
  const f = FIELDS[type];
  const set = (patch: Partial<Reservation>) => setR((x) => ({ ...x, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!r.title?.trim()) return;
    setBusy(true);
    let geo: Partial<Reservation> = {};
    const addressChanged = r.address !== initial.address || r.title !== initial.title;
    if (GEOCODE.includes(type) && (r.address || r.title) && (addressChanged || r.lat == null)) {
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
    <label className="block space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex gap-2">
        <input type="date" value={r[d] ?? ""} onChange={(e) => set({ [d]: e.target.value })} className={inputCls} />
        <input type="time" value={r[t] ?? ""} onChange={(e) => set({ [t]: e.target.value })} className={`${inputCls} w-32`} />
      </div>
    </label>
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
        {f.from && text(f.from, "from")}
        {f.to && text(f.to, "to")}
        {f.address && text(f.address, "address")}
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
            <select value={r.costCurrency} onChange={(e) => set({ costCurrency: e.target.value })} className={`${inputCls} w-28`}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
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
export function dayChips(reservations: Reservation[], date: string) {
  const chips: { r: Reservation; label: string }[] = [];
  for (const r of reservations) {
    const s = r.startDate;
    const e = r.endDate;
    const t = (x?: string) => (x ? ` ${x}` : "");
    switch (r.type) {
      case "flight":
      case "train":
        if (s === date) chips.push({ r, label: `${r.title} departs${t(r.startTime)}` });
        if (e === date && e !== s) chips.push({ r, label: `${r.title} arrives${t(r.endTime)}` });
        break;
      case "lodging":
        if (s === date) chips.push({ r, label: `Check-in ${r.title}${t(r.startTime)}` });
        else if (e === date) chips.push({ r, label: `Check-out ${r.title}${t(r.endTime)}` });
        else if (s && e && s < date && date < e) chips.push({ r, label: `Staying at ${r.title}` });
        break;
      case "car":
        if (s === date) chips.push({ r, label: `Pick up ${r.title}${t(r.startTime)}` });
        if (e === date && e !== s) chips.push({ r, label: `Drop off ${r.title}${t(r.endTime)}` });
        break;
      default:
        if (s === date) chips.push({ r, label: `${r.title}${t(r.startTime)}` });
    }
  }
  return chips;
}
