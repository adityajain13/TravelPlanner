import { useEffect, useState } from "react";
import { Check, Copy, Eye, Link2, Loader2, Pencil, RotateCcw, UserPlus, X } from "lucide-react";
import { api, shareUrl } from "../lib/api";
import { askConfirm } from "./ConfirmDialog";
import { Menu } from "./Menu";

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
    if (!(await askConfirm({ title: "Reset both links?", body: "Anyone using the current links loses access. New links are made right away.", confirmLabel: "Reset" }))) return;
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
    <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-h-[90vh] max-w-md space-y-5 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Share trip</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <People tripId={tripId} />
        <p className="pt-1 text-[11px] font-bold tracking-wider text-muted uppercase">Or share a link</p>
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

type Member = { email: string; role: "view" | "edit" };

/** People with their own login: the trip shows up in their app, and editors can forward bookings to it. */
function People({ tripId }: { tripId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("edit");
  const [invite, setInvite] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ members: Member[] }>(`/trips/${tripId}/members`)
      .then((r) => setMembers(r.members))
      .catch(() => setErr(navigator.onLine ? "Couldn't load people." : "Sharing needs a connection"));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const put = async (m: Member, showInvite: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ invite?: string }>(`/trips/${tripId}/members`, { method: "PUT", body: JSON.stringify({ ...m, invite: showInvite }) });
      if (showInvite && r.invite) setInvite({ email: m.email, url: r.invite });
      setEmail("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (e: string) => {
    if (!(await askConfirm({ title: `Remove ${e}?`, body: "The trip disappears from their list. You can add them back any time.", confirmLabel: "Remove" }))) return;
    await api(`/trips/${tripId}/members/${encodeURIComponent(e)}`, { method: "DELETE" }).catch(() => undefined);
    if (invite?.email === e) setInvite(null);
    await load();
  };
  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <UserPlus className="size-4 text-muted" /> People
        </p>
        <p className="mt-0.5 text-xs text-muted">They sign in with their own email and see this trip in their list. Editors can also forward bookings to it.</p>
      </div>
      {members && members.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {members.map((m) => (
            <li key={m.email} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{m.email}</span>
              <RoleMenu role={m.role} disabled={busy} label={`${m.email} access`} onPick={(r) => put({ email: m.email, role: r }, false)} />
              <button onClick={() => put(m, true)} disabled={busy} title="New sign-in link" aria-label={`New sign-in link for ${m.email}`} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
                <Link2 className="size-3.5" />
              </button>
              <button onClick={() => remove(m.email)} title="Remove" aria-label={`Remove ${m.email}`} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => (e.preventDefault(), email.trim() && put({ email: email.trim().toLowerCase(), role }, true))} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 focus-within:border-accent">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted/60" />
        <RoleMenu role={role} label="Access" onPick={setRole} />
        <button disabled={busy || !email.trim()} className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent disabled:opacity-40">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
        </button>
      </form>
      {err && <p className="text-xs text-danger">{err}</p>}
      {invite && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-3">
          <p className="text-xs">
            Send <span className="font-semibold">{invite.email}</span> this sign-in link (one use, 7 days). After that they can sign in with their email as usual.
          </p>
          <button onClick={() => copy(invite.url)} className="mt-2 flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-on-accent">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy sign-in link"}
          </button>
        </div>
      )}
    </div>
  );
}

const ROLE_LABEL: Record<Member["role"], string> = { edit: "Can edit", view: "View only" };
function RoleMenu({ role, onPick, disabled, label }: { role: Member["role"]; onPick: (r: Member["role"]) => void; disabled?: boolean; label: string }) {
  return (
    <Menu
      label={ROLE_LABEL[role]}
      ariaLabel={label}
      disabled={disabled}
      className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1.5 pl-2.5 text-xs font-semibold text-fg hover:text-accent disabled:opacity-50"
      options={[
        { key: "edit", label: "Can edit", hint: "Changes the plan, forwards bookings", on: role === "edit" },
        { key: "view", label: "View only", hint: "Sees the plan", on: role === "view" },
      ]}
      onPick={(k) => onPick(k as Member["role"])}
    />
  );
}
