import type * as Y from "yjs";
import { api } from "./api";
import { readTrip, saveReservation, type Reservation } from "./trips";

/** Bookings that came in by forwarded email and have notes. */
export const importedWithNotes = (rs: Reservation[]) => rs.filter((r) => r.inboxId && r.notes?.trim());

/** Still in the old free-text shape (never tidied, no "**Label:**" lines). */
export const needsTidy = (r: Reservation) => !!r.inboxId && !!r.notes?.trim() && !r.notes.trimStart().startsWith("**") && !r.notesTidy;

/**
 * Sort each booking's notes into the standard layout ("**Seat:** 12A"… in a fixed order per type),
 * one at a time. A note edited meanwhile is left alone. Not one of your undo steps.
 * Returns how many were rewritten.
 */
export async function tidyNotes(doc: Y.Doc, list: Reservation[], onProgress?: (done: number, total: number) => void) {
  let changed = 0;
  for (const [i, r] of list.entries()) {
    onProgress?.(i, list.length);
    const out = await api<{ notes: string }>("/notes/tidy", { method: "POST", body: JSON.stringify({ type: r.type, title: r.title, notes: r.notes }) }).catch(() => null);
    const cur = readTrip(doc).reservations.find((x) => x.id === r.id);
    if (!out || !cur || cur.notes !== r.notes) continue;
    if (out.notes && out.notes !== cur.notes) changed++;
    saveReservation(doc, { ...cur, notes: out.notes || cur.notes, notesTidy: 1 }, { by: "claude", label: "Tidy notes" });
  }
  onProgress?.(list.length, list.length);
  return changed;
}
