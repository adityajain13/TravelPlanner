import { Logo } from "../components/Logo";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Mail, Users } from "lucide-react";
import { api, useSession } from "../lib/api";
import { inputCls } from "../components/NewTripDialog";

export function Login() {
  const { status, setEmail } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmailInput] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("expired") ? "That link expired or was already used." : null);

  // Invite link from a trip owner: show who it's for, sign in on a button press (link previews can't use it up)
  const inviteToken = params.get("invite");
  const [invite, setInvite] = useState<{ email: string; title: string } | null>(null);
  useEffect(() => {
    if (!inviteToken) return;
    api<{ email: string; title: string }>("/auth/invite", { method: "POST", body: JSON.stringify({ t: inviteToken, peek: true }) })
      .then(setInvite)
      .catch((e) => setError((e as Error).message));
  }, [inviteToken]);
  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ email: string }>("/auth/invite", { method: "POST", body: JSON.stringify({ t: inviteToken }) });
      setEmail(r.email);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setInvite(null);
    } finally {
      setBusy(false);
    }
  }

  if (status === "in" && !inviteToken) return <Navigate to="/" replace />;

  async function request(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/request", { method: "POST", body: JSON.stringify({ email }) });
      setStep("code");
    } catch (err) {
      setError(navigator.onLine ? (err as Error).message : "You're offline");
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ email: string }>("/auth/verify", { method: "POST", body: JSON.stringify({ email, code: value }) });
      setEmail(r.email);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center px-5 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <Logo size={34} className="mb-8" />
          <h1 className="font-display text-4xl">{step === "email" ? "Sign in" : "Check your email"}</h1>
          {step === "code" && (
            <p className="mt-2 text-sm text-muted">
              If <span className="text-fg">{email}</span> can sign in, a 6-digit code is on its way. You can also tap the link in the
              email.
            </p>
          )}
        </div>

        {invite ? (
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <p className="flex items-start gap-2.5 text-[15px]">
              <Users className="mt-0.5 size-5 shrink-0 text-accent" />
              <span>
                You've been invited to <span className="font-semibold">{invite.title}</span>. Continue as <span className="font-semibold">{invite.email}</span>.
              </span>
            </p>
            <button onClick={accept} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-60">
              {busy && <Loader2 className="size-4 animate-spin" />} Continue
            </button>
          </div>
        ) : inviteToken && !error ? (
          <Loader2 className="size-5 animate-spin text-muted" />
        ) : step === "email" ? (
          <form onSubmit={request} className="space-y-3">
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Email me a code
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (v.length === 6) void verify(v);
              }}
              placeholder="••••••"
              className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
            />
            <div className="flex items-center justify-between text-sm">
              <button onClick={() => (setStep("email"), setCode(""))} className="flex items-center gap-1 text-muted hover:text-fg">
                <ArrowLeft className="size-4" /> Different email
              </button>
              <button onClick={() => request()} disabled={busy} className="text-muted hover:text-fg disabled:opacity-50">
                Resend
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
        <p className="text-xs text-muted">You'll stay signed in on this device for a year.</p>
      </div>
    </div>
  );
}
