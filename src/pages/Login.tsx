import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
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

  if (status === "in") return <Navigate to="/" replace />;

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
          <p className="mb-3 text-sm font-semibold tracking-wide text-muted">travel planner</p>
          <h1 className="font-display text-4xl">{step === "email" ? "Sign in" : "Check your email"}</h1>
          {step === "code" && (
            <p className="mt-2 text-sm text-muted">
              If <span className="text-fg">{email}</span> can sign in, a 6-digit code is on its way. You can also tap the link in the
              email.
            </p>
          )}
        </div>

        {step === "email" ? (
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
