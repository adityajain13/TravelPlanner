import type { Dispatch, SetStateAction } from "react";
import type * as Y from "yjs";
import { Copy, FolderInput, Trash2, X } from "lucide-react";
import { SectionPicker } from "../SectionPicker";
import type { SectionTarget } from "../SectionPicker";
import { askConfirm } from "../ConfirmDialog";
import { copyItems, moveItems, removeItems } from "../../lib/trips";

/** Multi-select action bar over the tabs: copy, move or delete the ticked items. */
export function SelectionBar({
  doc,
  checked,
  checkedIds,
  here,
  targets,
  writeOf,
  selectedId,
  setSelectedId,
  onClear,
}: {
  doc: Y.Doc;
  checked: Set<string>;
  checkedIds: string[];
  here: string[];
  targets: SectionTarget[];
  writeOf: (key: string) => string;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  onClear: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center gap-0.5 bg-bg px-3 text-[14px] font-semibold">
      <button onClick={onClear} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Clear selection">
        <X className="size-4" />
      </button>
      <span className="mr-auto whitespace-nowrap tabular-nums">{checked.size} selected</span>
      <SectionPicker targets={targets} here={here} onPick={(k) => (copyItems(doc, checkedIds, writeOf(k)), onClear())} align="right" className="rounded-full px-2 py-1.5 whitespace-nowrap text-muted hover:bg-surface-2 hover:text-fg">
        <Copy className="size-4 shrink-0" /> <span className="whitespace-nowrap">Copy to</span>
      </SectionPicker>
      {/* Already all on that one day or list: picking it just clears the selection */}
      <SectionPicker
        targets={targets}
        here={here}
        onPick={(k) => ((here.length === 1 && here[0] === k) || moveItems(doc, checkedIds, writeOf(k)), onClear())}
        align="right"
        className="rounded-full px-2 py-1.5 whitespace-nowrap text-muted hover:bg-surface-2 hover:text-fg"
      >
        <FolderInput className="size-4 shrink-0" /> <span className="whitespace-nowrap">Move to</span>
      </SectionPicker>
      <button
        onClick={async () => {
          if (!(await askConfirm({ title: `Delete ${checked.size} item${checked.size > 1 ? "s" : ""}?`, body: "Undo brings them back." }))) return;
          removeItems(doc, checkedIds);
          if (selectedId && checked.has(selectedId)) setSelectedId(null);
          onClear();
        }}
        aria-label="Delete"
        className="flex items-center gap-1.5 rounded-full px-2 py-1.5 whitespace-nowrap text-muted hover:bg-surface-2 hover:text-danger"
      >
        <Trash2 className="size-4 shrink-0" /> <span className="whitespace-nowrap max-sm:hidden">Delete</span>
      </button>
    </div>
  );
}
