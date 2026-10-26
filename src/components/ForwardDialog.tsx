import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, Copy, Loader2, Mail, X } from "lucide-react";
import { fetchInboxHistory, type InboxItem } from "../lib/inbox";
import { BOOKING_ICON } from "./InboxPanel";

export const INBOX_ADDRESS = "trips@adityajain.ca";
/** This trip's own address: mail to trips+<id>@ goes straight to the trip (needs Email Routing subaddressing). */
export const tripAddress = (tripId?: string) => (tripId ? `trips+${tripId.toLowerCase()}@adityajain.ca` : INBOX_ADDRESS);

const STATUS: Record<NonNullable<InboxItem["status"]>, { label: string; cls: string }> = {
  pending: { label: "Waiting for review", cls: "bg-accent/15 text-accent" },
  added: { label: "Added", cls: "bg-surface-2 text-fg" },
  dismissed: { label: "Dismissed", cls: "bg-surface-2 text-muted" },
};

/** Wanderlog's "Forward your confirmation" sheet, plus the list of everything forwarded so far. */
export function ForwardDialog({ tripId, tripTitles, initialView = "forward", onClose }: { tripId?: string; tripTitles?: Record<string, string>; initialView?: "forward" | "history"; onClose: () => void }) {
  const [view, setView] = useState(initialView);
  const [copied, setCopied] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per trip by default: this trip's emails plus any that didn't match a trip; old trips stay out
  const [scope, setScope] = useState<"trip" | "all">(tripId ? "trip" : "all");

  useEffect(() => {
    if (view !== "history" || items) return;
    fetchInboxHistory()
      .then(setItems)
      .catch((e) => setError(e?.status === 401 ? "Sign in as the trip owner to see forwarded emails." : navigator.onLine ? "Couldn't load your emails." : "You're offline."));
  }, [view, items]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tripAddress(tripId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the address is selectable */
    }
  };

  const shown = items?.filter((it) => scope === "all" || it.trip_id === tripId || !it.trip_id);
  const when = (ms: number) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-3xl border border-line bg-surface p-7 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 grid size-9 place-items-center rounded-full border border-line text-muted hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </button>

        {view === "forward" ? (
          <div className="text-center">
            <Mail className="mx-auto size-8 text-accent" />
            <h2 className="mt-3 font-display text-[26px]">Forward your confirmation</h2>
            <p className="mx-auto mt-2 max-w-sm text-[16px] leading-relaxed text-muted">
              {tripId
                ? "Forward booking emails from your own address to this trip's address. They land in this trip and wait for you to review."
                : "Forward booking emails from your own address. They're matched to a trip by dates and destination, and wait for you to review."}
            </p>
            <div className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-bg p-2 pl-4">
              <span className="min-w-0 flex-1 truncate text-left text-[16px] select-all">{tripAddress(tripId)}</span>
              <button onClick={copy} className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-[15px] font-bold text-on-accent">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {tripId && (
              <p className="mt-2 text-[13px] text-muted">
                Not sure which trip? Plain <span className="text-fg">{INBOX_ADDRESS}</span> works too and matches by dates.
              </p>
            )}
            <button onClick={() => setView("history")} className="mt-5 rounded-full border border-accent/50 px-5 py-2.5 text-[15px] font-bold text-accent hover:bg-accent/10">
              Check imported emails
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 pr-10">
              {initialView === "forward" && (
                <button onClick={() => setView("forward")} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Back">
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <h2 className="font-display text-[24px]">Imported emails</h2>
            </div>
            {tripId && (
              <div className="mt-3 flex w-fit rounded-full border border-line p-1 text-[13px] font-semibold">
                {(
                  [
                    ["trip", "This trip"],
                    ["all", "All trips"],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} onClick={() => setScope(k)} className={`rounded-full px-3 py-1 ${scope === k ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="-mx-2 mt-4 min-h-0 overflow-y-auto px-2">
              {error ? (
                <p className="py-10 text-center text-muted">{error}</p>
              ) : !items ? (
                <div className="grid place-items-center py-12 text-muted">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : shown!.length === 0 ? (
                <p className="py-10 text-center text-muted">
                  {scope === "trip" && items.length ? "No emails for this trip yet." : "Nothing forwarded yet."} Send confirmations to <span className="break-all text-fg">{tripAddress(scope === "trip" ? tripId : undefined)}</span>.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {shown!.map((it) => {
                    const st = STATUS[it.status ?? "pending"];
                    const here = tripId && it.trip_id === tripId;
                    return (
                      <li key={it.id} className={`rounded-2xl border p-4 ${here ? "border-accent/40 bg-accent/5" : "border-line bg-bg"}`}>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 text-muted [&>svg]:size-5">{BOOKING_ICON[it.booking.type] ?? BOOKING_ICON.other}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[16px] font-bold">{it.booking.title}</p>
                            <p className="truncate text-[13px] text-muted">{it.subject}</p>
                            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                              <span className={`rounded-full px-2 py-0.5 font-semibold ${st.cls}`}>{st.label}</span>
                              <span>{it.trip_id ? (here ? "This trip" : (tripTitles?.[it.trip_id] ?? "Another trip")) : "No trip matched"}</span>
                              <span>· received {when(it.created_at)}</span>
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
