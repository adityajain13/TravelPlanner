import { ChevronRight, LayoutDashboard } from "lucide-react";

/** One row in the itinerary that opens the full trip overview screen. */
export function OverviewButton({ countdown, attention, onOpen }: { countdown: string; attention: number; onOpen: () => void }) {
  return (
    <section className="mx-2 mt-4" aria-label="Trip overview">
      <button onClick={onOpen} className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left hover:border-accent">
        <LayoutDashboard className="size-5 shrink-0 text-accent" />
        <span className="font-display text-[19px]">Trip overview</span>
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-[12px] font-semibold text-on-accent">{countdown}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[12px] text-muted">
          {attention > 0 && `${attention} to look at`}
          <ChevronRight className="size-4" />
        </span>
      </button>
    </section>
  );
}
