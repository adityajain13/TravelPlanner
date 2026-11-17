// Form state and create for the new-trip pop-up.
import { useState } from "react";
import { addDays, todayISO } from "../../lib/dates";
import { createTrip } from "../../lib/trips";
import { hasCoords, type Destination } from "../../lib/destinations";

export function useNewTrip() {
  const [dest, setDest] = useState<{ text: string; place: Destination | null; freeform: boolean }>({ text: "", place: null, freeform: false });
  const [title, setTitle] = useState("");
  const [startDate, setStart] = useState(addDays(todayISO(), 30));
  const [endDate, setEnd] = useState(addDays(todayISO(), 36));
  const [busy, setBusy] = useState(false);
  /** The highlighted suggestion while typing, for the globe to lean toward. */
  const [preview, setPreview] = useState<Destination | null>(null);

  const destination = dest.place?.name ?? dest.text.trim();
  const ready = !!dest.place || (dest.freeform && !!dest.text.trim());
  // Only once a place is chosen, so a half-typed "japam" never shows up as the title
  const autoTitle = ready ? `Trip to ${destination}` : "";

  async function create(): Promise<string | null> {
    if (!ready || busy) return null;
    setBusy(true);
    const p = dest.place;
    return createTrip({
      title: title.trim() || autoTitle,
      destination,
      startDate,
      endDate,
      center: p && hasCoords(p) ? [p.lng, p.lat] : undefined,
      countryCode: p?.countryCode,
    });
  }

  return {
    dest,
    setDest,
    title,
    setTitle,
    autoTitle,
    startDate,
    endDate,
    setDates: (s: string, e: string) => (setStart(s), setEnd(e)),
    preview,
    setPreview,
    ready,
    busy,
    create,
  };
}
