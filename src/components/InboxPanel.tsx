import { useEffect, useRef, useState } from "react";
import { BedDouble, Car, Mail, Plane, Ticket, TrainFront, Utensils } from "lucide-react";
import type * as Y from "yjs";
import type { TripState } from "../lib/trips";
import type { Booking, InboxItem } from "../lib/inbox";
import { ReservationForm } from "./Reservations";
import { InboxCard } from "./inbox/InboxCard";
import { targetOf, useInboxActions } from "./inbox/useInboxActions";

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
export function InboxPanel({ items, doc, state, onDone, autoExpandFirst = false }: { items: InboxItem[]; doc: Y.Doc; state: TripState; onDone: (id: string) => void; autoExpandFirst?: boolean }) {
  const { busy, editing, setEditing, add, dismiss, edit, finishEdit } = useInboxActions(doc, state, onDone);
  const [openId, setOpenId] = useState<string | null>(null);
  // Expands the first card once, when opened from the review link
  const expandedFirst = useRef(false);
  useEffect(() => {
    if (!autoExpandFirst || expandedFirst.current || !items[0]) return;
    expandedFirst.current = true;
    setOpenId(items[0].id);
  }, [autoExpandFirst, items]);
  if (items.length === 0 && !editing) return null;

  return (
    <>
      {items.length > 0 && (
        <div id="inbox-review" className="mx-2 mt-4 scroll-mt-28 rounded-xl border border-accent/30 bg-accent/5 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-accent uppercase">
            <Mail className="size-3.5" /> From your email · {items.length}
          </p>
          <ul className="space-y-2">
            {items.map((it) => (
              <InboxCard
                key={it.id}
                item={it}
                icon={BOOKING_ICON[it.booking.type] ?? BOOKING_ICON.other}
                label={targetOf(it.booking, state).label}
                expanded={openId === it.id}
                onToggle={() => setOpenId(openId === it.id ? null : it.id)}
                busy={busy === it.id}
                center={state.meta.center}
                onAdd={() => add(it)}
                onEdit={() => edit(it)}
                onDismiss={() => dismiss(it)}
              />
            ))}
          </ul>
        </div>
      )}
      {editing && <ReservationForm doc={doc} state={state} initial={editing.res} onClose={() => setEditing(null)} onSaved={() => finishEdit(editing.item.id)} />}
    </>
  );
}
