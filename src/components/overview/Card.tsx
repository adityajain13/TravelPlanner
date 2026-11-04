import type { ReactNode } from "react";

/** A rounded panel with a title row, used for every block on the overview screen. */
export function Card({ title, aside, className = "", children }: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[18px]">{title}</h2>
        {aside && <span className="text-[12px] text-muted">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

/** Small bordered button used for the row actions (Add, Plan, Open). */
export const ROW_BUTTON = "shrink-0 rounded-xl border border-line px-2.5 py-1 text-[12px] font-bold hover:border-accent";
