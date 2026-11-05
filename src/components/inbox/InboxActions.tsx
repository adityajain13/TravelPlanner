import { Check, Loader2, Pencil, X } from "lucide-react";

/** The card's buttons: add to the trip, edit the details first, or dismiss. One line, even on phones. */
export function InboxActions({
  busy,
  label,
  canEdit,
  onAdd,
  onEdit,
  onDismiss,
}: {
  busy: boolean;
  label: string;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <button onClick={onAdd} disabled={busy} className="flex items-center gap-1 shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent disabled:opacity-60">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        {label}
      </button>
      {canEdit && (
        <button onClick={onEdit} disabled={busy} className="flex items-center gap-1 shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-fg disabled:opacity-60">
          <Pencil className="size-3.5" /> Edit & add
        </button>
      )}
      <button onClick={onDismiss} disabled={busy} className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-1.5 py-1 text-xs text-muted hover:text-fg disabled:opacity-60">
        <X className="size-3.5" />
        <span className="max-[359px]:hidden">Dismiss</span>
      </button>
    </div>
  );
}
