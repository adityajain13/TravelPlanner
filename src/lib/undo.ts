import { useEffect, useState } from "react";
import * as Y from "yjs";
import { ME } from "./trips";

/**
 * Undo / redo for your own edits on this device. Only changes made with the ME origin are
 * tracked, so undo never reverts something a collaborator, Claude or an email import did.
 * Edits within half a second are grouped (typing a note, dragging a card).
 */
export function useUndo(doc: Y.Doc | null, readOnly?: boolean) {
  const [um, setUm] = useState<Y.UndoManager | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!doc || readOnly) return;
    const scope = ["items", "lists", "meta", "reservations", "expenses", "drafts"].map((n) => doc.getMap(n));
    const m = new Y.UndoManager(scope, { trackedOrigins: new Set([ME]), captureTimeout: 500 });
    const refresh = () => bump((x) => x + 1);
    m.on("stack-item-added", refresh);
    m.on("stack-item-popped", refresh);
    m.on("stack-cleared", refresh);
    setUm(m);
    return () => {
      m.destroy();
      setUm(null);
    };
  }, [doc, readOnly]);

  // ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y — but leave text fields their own native undo
  useEffect(() => {
    if (!um) return;
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) (e.preventDefault(), um.undo());
      else if ((k === "z" && e.shiftKey) || k === "y") (e.preventDefault(), um.redo());
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [um]);

  return {
    canUndo: !!um?.canUndo(),
    canRedo: !!um?.canRedo(),
    undo: () => um?.undo(),
    redo: () => um?.redo(),
  };
}
