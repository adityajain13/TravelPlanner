import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, Copy, Loader2, Mail, Trash2, X } from "lucide-react";
import { deleteInbox, fetchInboxHistory, type InboxItem } from "../lib/inbox";
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
export function ForwardDialog({
  tripId,
  initialView = "forward",
  onClose,
  onDeleteEmail,
}: {
  tripId?: string;
  tripTitles?: Record<string, string>;
  initialView?: "forward" | "history";
  onClose: () => void;
  /** Remove what these inbox rows added to the trip; returns how many things were removed. */
  onDeleteEmail?: (rows: InboxItem[]) => number;
}) {
  const [view, setView] = useState(initialView);
  const [copied, setCopied] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const remove = async (g: EmailGroup) => {
    const added = g.rows.filter((r) => r.status === "added").length;
    if (!confirm(`Delete "${g.subject || "this email"}"${added ? ` and the ${added} booking${added > 1 ? "s" : ""} it added` : ""}?`)) return;
    setDeleting(g.key);
    try {
      onDeleteEmail?.(g.rows);
      await Promise.all(g.rows.map((r) => deleteInbox(r.id)));
      setItems((xs) => xs?.filter((x) => !g.rows.some((r) => r.id === x.id)) ?? null);
    } catch {
      setError(navigator.onLine ? "Couldn't delete that email." : "You're offline.");
    } finally {
      setDeleting(null);
    }
  };
  // Per trip by default: this trip's emails plus any that didn't match a trip; old trips stay out
  const scope: "trip" | "all" = tripId ? "trip" : "all";

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

  // This trip only; unmatched emails are sorted out from the home screen
  const shown = items?.filter((it) => scope === "all" || it.trip_id === tripId);
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
            {tripId && <p className="mt-1 text-[13px] text-muted">Emails for this trip. Ones that didn't match a trip are on the home screen.</p>}
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
                  {groupEmails(shown!).map((g) => (
                    <li key={g.key} className="rounded-2xl border border-line bg-bg p-4">
                      <div className="flex items-start gap-3">
                        <Mail className="mt-0.5 size-5 shrink-0 text-muted" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-bold">{g.subject || "(no subject)"}</p>
                          <p className="text-[12px] text-muted">Received {when(g.created)}</p>
                        </div>
                        {onDeleteEmail && (
                          <button
                            disabled={deleting === g.key}
                            onClick={() => remove(g)}
                            className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-50"
                            title="Delete this email and what it added"
                            aria-label="Delete email"
                          >
                            {deleting === g.key ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          </button>
                        )}
                      </div>
                      <ul className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
                        {g.rows.map((it) => {
                          const st = STATUS[it.status ?? "pending"];
                          return (
                            <li key={it.id} className="flex items-center gap-2.5 text-[14px]">
                              <span className="text-muted [&>svg]:size-4">{BOOKING_ICON[it.booking.type] ?? BOOKING_ICON.other}</span>
                              <span className="min-w-0 flex-1 truncate">
                                {it.booking.title}
                                {it.booking.traveler && <span className="text-muted"> · {it.booking.traveler}</span>}
                              </span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
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

interface EmailGroup {
  key: string;
  subject: string;
  created: number;
  rows: InboxItem[];
}

/** Bookings from one forwarded email arrive as several rows with the same subject and time. */
function groupEmails(rows: InboxItem[]): EmailGroup[] {
  const m = new Map<string, EmailGroup>();
  for (const r of rows) {
    const key = `${r.subject}|${r.created_at}`;
    (m.get(key) ?? m.set(key, { key, subject: r.subject, created: r.created_at, rows: [] }).get(key)!).rows.push(r);
  }
  return [...m.values()].sort((a, b) => b.created - a.created);
}
