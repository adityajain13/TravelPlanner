import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Mail, X } from "lucide-react";
import { api, ApiError } from "../lib/api";

interface MailData {
  subject: string | null;
  sender: string | null;
  received_at: number;
  html: string | null;
  text: string | null;
  attachments: { filename: string; mimeType: string; size: number }[];
}

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * The email a booking was imported from. The HTML runs in a sandbox that only lets links open in a new tab (no
 * scripts, no forms, no navigation), so an email can't act on the app. Attachments are listed only.
 */
export function MailViewer({ inboxId, onClose }: { inboxId: string; onClose: () => void }) {
  const [mail, setMail] = useState<MailData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<MailData>(`/inbox/${inboxId}/mail`)
      .then((m) => alive && setMail(m))
      .catch((e) => {
        if (!alive) return;
        // The booking predates mail storage: there is no email to show
        setErr(e instanceof ApiError && e.status === 404 ? "This booking was imported before emails were kept, so the original isn't available." : "Couldn't load the email. Try again.");
      });
    return () => {
      alive = false;
    };
  }, [inboxId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label="Email" onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-line bg-surface p-6 shadow-2xl max-sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-1 grid size-8 shrink-0 place-items-center text-accent">
            <Mail className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-bold">{mail?.subject || "Email"}</h2>
            {mail && (
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {mail.sender && `From ${mail.sender} · `}
                {when.format(new Date(mail.received_at))}
              </p>
            )}
          </div>
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-muted hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!mail && !err && (
            <div className="grid place-items-center py-16 text-muted">
              <Loader2 className="size-6 animate-spin text-accent" />
            </div>
          )}
          {err && <p className="py-8 text-center text-[14px] text-muted">{err}</p>}
          {mail && (mail.html ? <iframe sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank"><meta name="referrer" content="no-referrer">${mail.html}`} title="Email" className="h-[60vh] w-full rounded-xl bg-white" /> : <pre className="whitespace-pre-wrap text-[13px]">{mail.text || "(empty email)"}</pre>)}
          {mail && mail.attachments.length > 0 && (
            <p className="mt-4 text-[13px] text-muted">Attachments: {mail.attachments.map((a) => `${a.filename} (${kb(a.size)})`).join(", ")}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
