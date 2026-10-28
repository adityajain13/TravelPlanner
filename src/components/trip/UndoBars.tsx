import { Link } from "react-router-dom";
import { Redo2, Undo2 } from "lucide-react";
import { LogoMark } from "../Logo";
import type { UndoHistory } from "./types";

/** Shortcut modifier for tooltips: ⌘ on Apple devices, Ctrl+ elsewhere. */
export const modKey = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+");

/** Undo / redo row at the top of the contents column (nothing when the trip is view-only). */
export function UndoBar({ history, readOnly }: { history: UndoHistory; readOnly: boolean }) {
  if (readOnly) return null;
  const mod = modKey();
  return (
    <div className="flex items-center gap-1 border-b border-line px-4 py-3">
      <Link to="/" title="All trips" className="mr-2 shrink-0">
        <LogoMark size={30} />
      </Link>
      <button onClick={history.undo} disabled={!history.canUndo} title={`Undo (${mod}Z)`} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[15px] font-semibold text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
        <Undo2 className="size-4" /> Undo
      </button>
      <button onClick={history.redo} disabled={!history.canRedo} title={`Redo (${mod}⇧Z)`} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[15px] font-semibold text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
        <Redo2 className="size-4" /> Redo
      </button>
    </div>
  );
}

/** Narrow contents rail: logo and icon-only undo / redo, stacked. */
export function ThinUndoBar({ history, readOnly }: { history: UndoHistory; readOnly: boolean }) {
  const mod = modKey();
  return (
    <div className="flex w-full flex-col items-center gap-1 border-b border-line py-3">
      <Link to="/" title="All trips" className="mb-1">
        <LogoMark size={30} />
      </Link>
      {!readOnly && (
        <div className="flex gap-0.5">
          <button onClick={history.undo} disabled={!history.canUndo} title={`Undo (${mod}Z)`} aria-label="Undo" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
            <Undo2 className="size-4" />
          </button>
          <button onClick={history.redo} disabled={!history.canRedo} title={`Redo (${mod}⇧Z)`} aria-label="Redo" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
            <Redo2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
