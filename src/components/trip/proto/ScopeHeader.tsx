// PROTOTYPE (proto/trip-focus): variant A's slim bar above a single day or list, in place of the
// cover photo, tabs and day chips. Back to the whole trip, or step to the day before / after.
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { SectionInfo } from "../../Section";

export function ScopeHeader({
  title,
  sections,
  focus,
  onPick,
  children,
}: {
  title: string;
  sections: SectionInfo[];
  focus: string;
  onPick: (key: string | null) => void;
  /** The multi-select bar, when stops are ticked */
  children?: ReactNode;
}) {
  const cur = sections.find((s) => s.key === focus);
  const days = sections.filter((s) => s.kind === "day");
  const i = cur?.kind === "day" ? days.findIndex((s) => s.key === focus) : -1;
  const step = (d: number) => days[i + d] && onPick(days[i + d].key);
  const arrow = "grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-bg/95 px-4 backdrop-blur">
      {children}
      <div className="flex items-center gap-2 py-2.5">
        <button onClick={() => onPick(null)} className="flex min-w-0 items-center gap-2 rounded-full px-2 py-1 text-[14px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
          <ArrowLeft className="size-4 shrink-0" />
          <span className="truncate">{title}</span>
        </button>
        {i >= 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <span className="mr-1 text-[13px] text-muted tabular-nums">
              Day {i + 1} of {days.length}
            </span>
            <button className={arrow} disabled={i <= 0} onClick={() => step(-1)} aria-label="Day before">
              <ChevronLeft className="size-4" />
            </button>
            <button className={arrow} disabled={i >= days.length - 1} onClick={() => step(1)} aria-label="Day after">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
