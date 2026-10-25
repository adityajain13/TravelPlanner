import { useState } from "react";
import { DateRangeField } from "./DatePicker";
import { X } from "lucide-react";
import { addDays, todayISO } from "../lib/dates";
import { searchPlaces } from "../lib/photon";
import { createTrip } from "../lib/trips";

export function NewTripDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStart] = useState(addDays(todayISO(), 30));
  const [endDate, setEnd] = useState(addDays(todayISO(), 36));
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!destination.trim()) return;
    setBusy(true);
    // Centre the map on the destination; offline or no match just means no initial centre
    let center: [number, number] | undefined;
    let countryCode: string | undefined;
    try {
      const [hit] = await searchPlaces(destination);
      if (hit) (center = [hit.lng, hit.lat]), (countryCode = hit.countryCode);
    } catch {
      /* offline */
    }
    const id = await createTrip({
      title: title.trim() || `Trip to ${destination.trim()}`,
      destination: destination.trim(),
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
      center,
      countryCode,
    });
    onCreated(id);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Plan a new trip</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <Field label="Where to?">
          <input autoFocus required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Kyoto, Japan" className={inputCls} />
        </Field>
        <Field label="Trip name (optional)">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={destination ? `Trip to ${destination}` : "Trip to …"} className={inputCls} />
        </Field>
        <Field label="Dates">
          <DateRangeField start={startDate} end={endDate} onChange={(s, e) => (setStart(s), setEnd(e))} className={`${inputCls} w-full`} />
        </Field>
        <button disabled={busy} className="w-full rounded-xl bg-accent py-2.5 font-semibold text-on-accent transition-opacity disabled:opacity-60">
          {busy ? "Creating…" : "Start planning"}
        </button>
      </form>
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}
