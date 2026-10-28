import { Link } from "react-router-dom";
import { PanelLeft, Redo2, Undo2 } from "lucide-react";
import { LogoMark } from "../Logo";
import { modKey } from "./UndoBars";
import type { UndoHistory } from "./types";

/** Contents collapsed (or no room for it): logo, undo/redo and a way back move here. */
export function CollapsedContentsBar({
  hidden,
  readOnly,
  history,
  onShow,
}: {
  hidden: boolean;
  readOnly: boolean;
  history: UndoHistory;
  onShow: () => void;
}) {
  const mod = modKey();
  return (
    <div className={`shrink-0 items-center gap-1 border-b border-line px-3 py-2 ${hidden ? "hidden md:flex" : "hidden md:flex lg:hidden"}`}>
      <button
        onClick={onShow}
        title="Show contents"
        aria-label="Show contents"
        className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <PanelLeft className="size-[18px]" />
      </button>
      <Link to="/" title="All trips" className="mr-1 shrink-0">
        <LogoMark size={26} />
      </Link>
      {!readOnly && (
        <>
          <button onClick={history.undo} disabled={!history.canUndo} title={`Undo (${mod}Z)`} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-semibold text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
            <Undo2 className="size-4" /> Undo
          </button>
          <button onClick={history.redo} disabled={!history.canRedo} title={`Redo (${mod}⇧Z)`} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-semibold text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
            <Redo2 className="size-4" /> Redo
          </button>
        </>
      )}
    </div>
  );
}
