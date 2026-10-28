import { Contents, ContentsThin } from "../Contents";
import { ThinUndoBar, UndoBar } from "./UndoBars";
import type { ContentsCommon, UndoHistory } from "./types";

/** Wide screens: the contents column beside the plan (thin or full width, per settings). */
export function ContentsColumn({
  collapsed,
  thin,
  contents,
  history,
  readOnly,
  onHide,
}: {
  /** Plan or contents hidden: the column only shows on the wide layout when neither is. */
  collapsed: boolean;
  thin: boolean;
  contents: ContentsCommon;
  history: UndoHistory;
  readOnly: boolean;
  onHide: () => void;
}) {
  return (
    <div className={`hidden shrink-0 border-r border-line bg-bg ${collapsed ? "" : "lg:block"}`}>
      {thin ? (
        <ContentsThin {...contents} header={<ThinUndoBar history={history} readOnly={readOnly} />} onHide={onHide} />
      ) : (
        <div className="h-full w-[250px] xl:w-[280px]">
          <Contents {...contents} variant="column" header={<UndoBar history={history} readOnly={readOnly} />} onHide={onHide} />
        </div>
      )}
    </div>
  );
}

/** Below the wide layout: the contents as a sheet over the page. */
export function ContentsDrawer({
  contents,
  history,
  readOnly,
  onClose,
}: {
  contents: ContentsCommon;
  history: UndoHistory;
  readOnly: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] lg:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-line bg-bg shadow-2xl">
        <Contents {...contents} variant="drawer" header={<UndoBar history={history} readOnly={readOnly} />} onHide={onClose} />
      </div>
    </div>
  );
}
