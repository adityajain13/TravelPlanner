import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

/** In-app replacement for window.confirm: a centred card with a cancel and a (danger) action. */
export function ConfirmDialog({
  icon,
  title,
  children,
  confirmLabel,
  danger = true,
  onConfirm,
  onClose,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** May be async; errors are shown in the dialog. */
  onConfirm: () => unknown;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 text-center shadow-2xl">
        {icon && <div className={`mx-auto mb-3 grid size-12 place-items-center rounded-full [&>svg]:size-5 ${danger ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent"}`}>{icon}</div>}
        <h2 className="font-display text-[22px] leading-tight">{title}</h2>
        {children && <div className="mt-2 text-[15px] leading-relaxed text-muted">{children}</div>}
        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        <div className="mt-6 flex gap-2.5">
          <button autoFocus onClick={onClose} disabled={busy} className="flex-1 rounded-full border border-line py-2.5 text-[15px] font-semibold text-muted hover:text-fg">
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-[15px] font-bold disabled:opacity-70 ${danger ? "bg-danger text-white" : "bg-accent text-on-accent"}`}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/*
 * askConfirm(): a promise-based stand-in for window.confirm, rendered by <ConfirmHost/>
 * (mounted once at the app root): `if (!(await askConfirm({ title: "Delete it?" }))) return;`
 */
interface Ask {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  icon?: ReactNode;
}
let show: ((a: Ask & { resolve: (ok: boolean) => void }) => void) | null = null;

export const askConfirm = (a: Ask) =>
  new Promise<boolean>((resolve) => {
    if (!show) return resolve(false);
    show({ ...a, resolve });
  });

export function ConfirmHost() {
  const [ask, setAsk] = useState<(Ask & { resolve: (ok: boolean) => void }) | null>(null);
  useEffect(() => {
    show = setAsk;
    return () => {
      show = null;
    };
  }, []);
  if (!ask) return null;
  let answered = false;
  const answer = (ok: boolean) => {
    if (answered) return;
    answered = true;
    ask.resolve(ok);
  };
  return (
    <ConfirmDialog
      title={ask.title}
      icon={ask.icon}
      danger={ask.danger ?? true}
      confirmLabel={ask.confirmLabel ?? "Delete"}
      onConfirm={() => answer(true)}
      onClose={() => (answer(false), setAsk(null))}
    >
      {ask.body}
    </ConfirmDialog>
  );
}
