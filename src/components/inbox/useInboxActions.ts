import { useState } from "react";
import type * as Y from "yjs";
import { addItem, daySection, matchTraveler, saveReservation, type Reservation, type TripState } from "../../lib/trips";
import { bookingToItem, bookingToReservation, patchInbox, reservationTypeFor, type Booking, type InboxItem } from "../../lib/inbox";
import { formatShort } from "../../lib/dates";

/** Where "Add" puts a booking that isn't a reservation: its day, else the trip's first list. */
export function targetOf(b: Booking, state: TripState) {
  if (reservationTypeFor(b)) return { section: "", label: "Add to reservations" };
  const d = b.start_date;
  if (d && d >= state.meta.startDate && d <= state.meta.endDate) return { section: daySection(d), label: `Add to ${formatShort(d)}` };
  const list = state.lists[0];
  return { section: `list:${list?.id}`, label: `Add to ${list?.title ?? "list"}` };
}

/** Add, dismiss and "Edit & add" for forwarded bookings. Every path ends with onDone(id). */
export function useInboxActions(doc: Y.Doc, state: TripState, onDone: (id: string) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  // "Edit & add": the reservation form, prefilled from the email, for this item
  const [editing, setEditing] = useState<{ item: InboxItem; res: Partial<Reservation> } | null>(null);
  const prefill = (r: Omit<Reservation, "id" | "createdAt">, id: string) => ({
    ...r,
    traveler: matchTraveler(r.traveler, state.meta.travelers ?? [], state.meta.travelerAliases),
    inboxId: id,
  });

  async function add(it: InboxItem) {
    setBusy(it.id);
    try {
      if (reservationTypeFor(it.booking)) {
        const r = await bookingToReservation(it.booking, state.meta.center);
        // "MR VISHAL MONTEIRO" on the ticket → the trip's "Vishal"
        saveReservation(doc, prefill(r, it.id), { by: "email" });
      } else {
        addItem(doc, targetOf(it.booking, state).section, { ...(await bookingToItem(it.booking, state.meta.center)), inboxId: it.id }, { by: "email" });
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

  // Same prefill as "Add", but the form opens first so the details can be changed
  async function edit(it: InboxItem) {
    setBusy(it.id);
    try {
      setEditing({ item: it, res: prefill(await bookingToReservation(it.booking, state.meta.center), it.id) });
    } finally {
      setBusy(null);
    }
  }

  const finishEdit = (id: string) => {
    patchInbox(id, { status: "added" }).catch(() => undefined);
    onDone(id);
  };

  return { busy, editing, setEditing, add, dismiss, edit, finishEdit };
}
