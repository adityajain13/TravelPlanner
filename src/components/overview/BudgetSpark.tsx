/** Cumulative spend (solid accent, with an end dot) against the straight plan line from 0 to the budget (dashed). */
export function BudgetSpark({ actual, plan }: { actual: number[]; plan: number[] | null }) {
  const W = 300;
  const H = 80;
  const PAD = 6;
  const n = plan?.length ?? actual.length;
  const max = Math.max(1, ...actual, ...(plan ?? []));
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = actual.length - 1;
  return (
    <div className="relative h-20 w-full lg:h-full lg:min-h-20 lg:flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="size-full overflow-visible" aria-hidden>
        {plan && <path d={path(plan)} fill="none" className="stroke-muted" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        <path d={path(actual)} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {last >= 0 && (
        <span
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${(x(last) / W) * 100}%`, top: `${(y(actual[last]) / H) * 100}%` }}
        />
      )}
    </div>
  );
}
