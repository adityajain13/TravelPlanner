import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Full-screen overview, drawn over the whole app. Escape or the X closes it. */
export function OverviewScreen({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-bg">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <button onClick={onClose} aria-label="Close overview" className="grid size-9 place-items-center rounded-full hover:bg-surface-2">
          <X className="size-5" />
        </button>
        <h2 className="font-display text-[19px]">Overview</h2>
      </header>
      {children}
    </div>,
    document.body,
  );
}
