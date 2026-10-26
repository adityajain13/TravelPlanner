import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Mail, Trash2, X } from "lucide-react";
import type { TripIndexRow } from "../lib/db";
import { patchInbox, type InboxItem } from "../lib/inbox";
import { formatShort } from "../lib/dates";
import { formatMoney } from "../lib/fx";
import { BOOKING_ICON } from "./InboxPanel";

/** Home: "N unmatched emails" button, opening a sheet to send each to a trip or delete it. */
export function UnmatchedInbox({ items, trips, onChange }: { items: InboxItem[]; trips: TripIndexRow[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20"
        title="Forwarded emails that didn't match a trip"
      >
        <Mail className="size-4" /> {items.length}
        <span className="max-sm:hidden"> unmatched</span>
      </button>
      {open && <UnmatchedSheet items={items} trips={trips} onChange={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}

function UnmatchedSheet({ items, trips, onChange, onClose }: { items: InboxItem[]; trips: TripIndexRow[]; onChange: () => void; onClose: () => void }) {
  const mine = trips.filter((t) => !t.shareToken).sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  useEffect(() => {
    if (!items.length) onClose();
  }, [items.length, onClose]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const act = async (id: string, body: Parameters<typeof patchInbox>[1]) => {
    setBusy(id);
    try {
      await patchInbox(id, body);
      onChange();
    } finally {
      setBusy(null);
      setPicking(null);
    }
  };

  // Suggest trips whose dates are near the booking
  const near = (date?: string) =>
    date ? mine.filter((t) => t.startDate && t.endDate && Math.abs(new Date(date).getTime() - new Date(t.startDate).getTime()) < 45 * 86400000).slice(0, 2) : [];

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-3xl border border-line bg-surface p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 grid size-9 place-items-center rounded-full border border-line text-muted hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </button>
        <h2 className="pr-10 font-display text-[24px]">Unmatched emails</h2>
        <p className="mt-1 text-[14px] text-muted">These didn't fit any trip's dates. Send each to a trip to review it there, or delete it.</p>
        <ul className="-mx-1 mt-4 min-h-0 space-y-2.5 overflow-y-auto px-1">
          {items.map((it) => {
            const b = it.booking;
            const sugg = near(b.start_date);
            return (
              <li key={it.id} className="rounded-2xl border border-line bg-bg p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-muted [&>svg]:size-5">{BOOKING_ICON[b.type] ?? BOOKING_ICON.other}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-bold">{b.title}</p>
                    <p className="truncate text-[13px] text-muted">
                      {[b.start_date && formatShort(b.start_date), b.cost != null && formatMoney(b.cost, b.currency ?? "CAD"), it.subject].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    disabled={busy === it.id}
                    onClick={() => act(it.id, { status: "dismissed" })}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                    title="Delete"
                    aria-label="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(picking === it.id ? mine : sugg.length ? sugg : mine.slice(0, 3)).map((t) => (
                    <button
                      key={t.id}
                      disabled={busy === it.id}
                      onClick={() => act(it.id, { trip_id: t.id })}
                      className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[13px] font-semibold text-muted hover:border-accent hover:text-fg disabled:opacity-50"
                    >
                      <Check className="size-3.5" /> {t.title}
                    </button>
                  ))}
                  {picking !== it.id && mine.length > (sugg.length || 3) && (
                    <button onClick={() => setPicking(it.id)} className="rounded-full px-3 py-1 text-[13px] font-semibold text-muted hover:text-fg">
                      Other trip…
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
