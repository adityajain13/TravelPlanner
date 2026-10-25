import { Mail, X } from "lucide-react";
import type { TripIndexRow } from "../lib/db";
import { patchInbox, type InboxItem } from "../lib/inbox";
import { formatShort } from "../lib/dates";
import { BOOKING_ICON } from "./InboxPanel";

/** Home screen: forwarded bookings that didn't match a trip. Assigning one moves it into that trip's inbox. */
export function UnmatchedInbox({ items, trips, onChange }: { items: InboxItem[]; trips: TripIndexRow[]; onChange: () => void }) {
  if (items.length === 0) return null;
  const mine = trips.filter((t) => !t.shareToken);
  return (
    <section className="mb-10">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-widest text-accent uppercase">
        <Mail className="size-3.5" /> From your email — pick a trip
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="text-muted">{BOOKING_ICON[it.booking.type] ?? BOOKING_ICON.other}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{it.booking.title}</p>
              <p className="text-xs text-muted">{it.booking.start_date ? formatShort(it.booking.start_date) : it.subject}</p>
            </div>
            <select
              defaultValue=""
              onChange={async (e) => {
                if (!e.target.value) return;
                await patchInbox(it.id, { trip_id: e.target.value });
                onChange();
              }}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm"
            >
              <option value="" disabled>
                Add to trip…
              </option>
              {mine.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button
              onClick={async () => (await patchInbox(it.id, { status: "dismissed" }), onChange())}
              className="text-muted hover:text-fg"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
