import { Eye } from "lucide-react";

/** Eye toggle: shows or hides the walking area around a stop or booking. Accent and pressed while on. */
export function WalkButton({ on, onToggle, className = "grid size-7 place-items-center rounded-md hover:bg-surface-2" }: { on: boolean; onToggle: () => void; className?: string }) {
  const title = on ? "Hide walking area" : "Show what's within walking distance";
  return (
    <button
      type="button"
      onClick={(e) => (e.stopPropagation(), onToggle())}
      aria-pressed={on}
      aria-label={title}
      title={title}
      className={`${className} ${on ? "text-accent" : "text-muted hover:text-fg"}`}
    >
      <Eye className="size-3.5" />
    </button>
  );
}
