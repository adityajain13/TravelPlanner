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

  // Digits only, six of them; the sixth signs in straight away
  const onCodeInput = (raw: string) => {
    const v = raw.replace(/\D/g, "").slice(0, 6);
    setCode(v);
    if (v.length === 6) void verify(v);
  };

  return (
    <LoginCard
      step={step}
      email={email}
      code={code}
      busy={busy}
      error={error}
      invite={invite}
      inviteToken={inviteToken}
      onAccept={accept}
      onRequest={request}
      onEmailChange={setEmailInput}
      onCodeInput={onCodeInput}
      onBack={() => (setStep("email"), setCode(""))}
    />
  );
}

/** The sign-in card: heading, then the invite, email or code step, then any error and the footnote. */
function LoginCard({
  step,
  email,
  code,
  busy,
  error,
  invite,
  inviteToken,
  onAccept,
  onRequest,
  onEmailChange,
  onCodeInput,
  onBack,
}: {
  step: "email" | "code";
  email: string;
  code: string;
  busy: boolean;
  error: string | null;
  invite: { email: string; title: string } | null;
  inviteToken: string | null;
  onAccept: () => void;
  onRequest: (e?: React.FormEvent) => void;
  onEmailChange: (v: string) => void;
  onCodeInput: (raw: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="grid min-h-full place-items-center px-5 py-12">
      <div className="w-full max-w-sm space-y-6">
        <LoginHeader step={step} email={email} />

        {invite ? (
          <InviteCard invite={invite} busy={busy} onAccept={onAccept} />
        ) : inviteToken && !error ? (
          <Loader2 className="size-5 animate-spin text-muted" />
        ) : step === "email" ? (
          <EmailStep email={email} busy={busy} onEmailChange={onEmailChange} onSubmit={onRequest} />
        ) : (
          <CodeStep code={code} busy={busy} onCodeInput={onCodeInput} onBack={onBack} onResend={() => onRequest()} />
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
        <p className="text-xs text-muted">You'll stay signed in on this device for a year.</p>
      </div>
    </div>
  );
}

function LoginHeader({ step, email }: { step: "email" | "code"; email: string }) {
  return (
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
  );
}

/** Shown for an invite link: who it's for, and a button to accept. */
function InviteCard({ invite, busy, onAccept }: { invite: { email: string; title: string }; busy: boolean; onAccept: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <p className="flex items-start gap-2.5 text-[15px]">
        <Users className="mt-0.5 size-5 shrink-0 text-accent" />
        <span>
          You've been invited to <span className="font-semibold">{invite.title}</span>. Continue as <span className="font-semibold">{invite.email}</span>.
        </span>
      </p>
      <button onClick={onAccept} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-60">
        {busy && <Loader2 className="size-4 animate-spin" />} Continue
      </button>
    </div>
  );
}

/** Step 1: the email address to send a code to. */
function EmailStep({ email, busy, onEmailChange, onSubmit }: { email: string; busy: boolean; onEmailChange: (v: string) => void; onSubmit: (e: React.FormEvent) => void }) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        type="email"
        required
        autoFocus
        autoComplete="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder="you@example.com"
        className={inputCls}
      />
      <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Email me a code
      </button>
    </form>
  );
}

/** Step 2: the six-digit code, with a way back to the address and a resend. */
function CodeStep({ code, busy, onCodeInput, onBack, onResend }: { code: string; busy: boolean; onCodeInput: (raw: string) => void; onBack: () => void; onResend: () => void }) {
  return (
    <div className="space-y-3">
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        value={code}
        onChange={(e) => onCodeInput(e.target.value)}
        placeholder="••••••"
        className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
      />
      <div className="flex items-center justify-between text-sm">
        <button onClick={onBack} className="flex items-center gap-1 text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Different email
        </button>
        <button onClick={onResend} disabled={busy} className="text-muted hover:text-fg disabled:opacity-50">
          Resend
        </button>
      </div>
    </div>
  );
}
