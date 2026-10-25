import { useEffect, useState } from "react";
import { Check, Copy, Eye, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { api, shareUrl } from "../lib/api";

type Links = { view?: string; edit?: string };

export function ShareDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [links, setLinks] = useState<Links>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [v, e] = await Promise.all(
        (["view", "edit"] as const).map((role) =>
          api<{ token: string }>(`/trips/${tripId}/share`, { method: "POST", body: JSON.stringify({ role }) }),
        ),
      );
      setLinks({ view: shareUrl(v.token), edit: shareUrl(e.token) });
    } catch (err) {
      setError(navigator.onLine ? (err as Error).message : "Sharing needs a connection");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function reset() {
    if (!confirm("Reset both links? Anyone using the current links loses access.")) return;
    await api(`/trips/${tripId}/share`, { method: "DELETE" }).catch(() => undefined);
    await load();
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 1500);
  }

  const rows = [
    { key: "view", url: links.view, icon: <Eye className="size-4" />, title: "View only", hint: "Sees the plan, can't change it" },
    { key: "edit", url: links.edit, icon: <Pencil className="size-4" />, title: "Can edit", hint: "Adds, moves and edits places. No login needed" },
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Share trip</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {busy && <Loader2 className="size-5 animate-spin text-muted" />}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!busy && !error && (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-muted">{r.icon}</span>
                    <div>
                      <p className="text-sm font-semibold">{r.title}</p>
                      <p className="text-xs text-muted">{r.hint}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => r.url && copy(r.url)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium hover:text-accent"
                  >
                    {copied === r.url ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
                    {copied === r.url ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted">Paste either link into a Claude chat once the connector is set up, too.</p>
            <button onClick={reset} className="flex items-center gap-1.5 text-xs text-muted hover:text-danger">
              <RotateCcw className="size-3.5" /> Reset links
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
