import { useState } from "react";
import { BedDouble, Car, Check, Loader2, Mail, Plane, Ticket, TrainFront, Utensils, X } from "lucide-react";
import type * as Y from "yjs";
import { addItem, daySection, saveReservation, type TripState } from "../lib/trips";
import { bookingToItem, bookingToReservation, patchInbox, reservationTypeFor, type Booking, type InboxItem } from "../lib/inbox";
import { formatShort } from "../lib/dates";

export const BOOKING_ICON: Record<Booking["type"], React.ReactNode> = {
  flight: <Plane className="size-4" />,
  hotel: <BedDouble className="size-4" />,
  train: <TrainFront className="size-4" />,
  bus: <TrainFront className="size-4" />,
  car: <Car className="size-4" />,
  restaurant: <Utensils className="size-4" />,
  activity: <Ticket className="size-4" />,
  other: <Mail className="size-4" />,
};

/** Bookings forwarded to trips@ that matched this trip, waiting to be added. */
export function InboxPanel({ items, doc, state, onDone }: { items: InboxItem[]; doc: Y.Doc; state: TripState; onDone: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (items.length === 0) return null;

  const target = (b: Booking) => {
    if (reservationTypeFor(b)) return { section: "", label: "Add to reservations" };
    const d = b.start_date;
    if (d && d >= state.meta.startDate && d <= state.meta.endDate) return { section: daySection(d), label: `Add to ${formatShort(d)}` };
    const list = state.lists[0];
    return { section: `list:${list?.id}`, label: `Add to ${list?.title ?? "list"}` };
  };

  async function add(it: InboxItem) {
    setBusy(it.id);
    try {
      if (reservationTypeFor(it.booking)) {
        saveReservation(doc, await bookingToReservation(it.booking, state.meta.center), { by: "email" });
      } else {
        addItem(doc, target(it.booking).section, await bookingToItem(it.booking, state.meta.center), { by: "email" });
      }
      await patchInbox(it.id, { status: "added" });
      onDone(it.id);
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(it: InboxItem) {
    setBusy(it.id);
    await patchInbox(it.id, { status: "dismissed" }).catch(() => undefined);
    onDone(it.id);
    setBusy(null);
  }

  return (
    <div className="mx-2 mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-accent uppercase">
        <Mail className="size-3.5" /> From your email · {items.length}
      </p>
      <ul className="space-y-2">
        {items.map((it) => {
          const b = it.booking;
          const t = target(b);
          return (
            <li key={it.id} className="flex items-start gap-2.5 rounded-lg bg-surface p-2.5">
              <span className="mt-0.5 text-muted">{BOOKING_ICON[b.type] ?? BOOKING_ICON.other}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{b.title}</p>
                <p className="text-xs text-muted">
                  {[b.start_date && formatShort(b.start_date), b.start_time, b.confirmation && `#${b.confirmation}`].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => add(it)}
                    disabled={busy === it.id}
                    className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-on-accent disabled:opacity-60"
                  >
                    {busy === it.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    {t.label}
                  </button>
                  <button onClick={() => dismiss(it)} disabled={busy === it.id} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:text-fg">
                    <X className="size-3.5" /> Dismiss
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
