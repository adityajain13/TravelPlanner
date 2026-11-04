import { Wallet } from "lucide-react";
import { formatMoney } from "../../lib/fx";
import type { OverviewTarget, spendSeries } from "../../lib/overview";
import { Card, ROW_BUTTON } from "./Card";
import { BudgetSpark } from "./BudgetSpark";

/** Money so far: what's left (or over) against the budget, with the spend-over-time line. */
export function BudgetCard({
  budget,
  spent,
  currency,
  pct,
  trendingOver,
  series,
  onGo,
}: {
  budget?: number;
  spent: number;
  currency: string;
  pct: number;
  trendingOver: boolean;
  series: ReturnType<typeof spendSeries>;
  onGo: (t: OverviewTarget) => void;
}) {
  const left = (budget ?? 0) - spent;
  return (
    <Card
      title="Budget"
      className="order-2 flex flex-col lg:flex-1"
      aside={
        <button onClick={() => onGo({ kind: "tab", tab: "budget" })} className={ROW_BUTTON}>
          <Wallet className="mr-1 inline size-3.5" />
          All costs
        </button>
      }
    >
      <p className="font-display text-[34px] leading-none tabular-nums">{formatMoney(budget ? Math.abs(left) : spent, currency)}</p>
      <p className="mt-1 text-[14px] text-muted">
        {budget ? `${left >= 0 ? "left" : "over"} of ${formatMoney(budget, currency)}` : "spent so far · no budget set"}
      </p>
      <div className="mt-4 flex min-h-20 flex-1 flex-col justify-center">{spent > 0 ? <BudgetSpark actual={series.actual} plan={series.plan} /> : <p className="py-6 text-center text-[13px] text-muted">Nothing spent yet</p>}</div>
      {spent > 0 && (
        <p className={`mt-2 text-[12px] ${trendingOver ? "text-amber-400" : "text-muted"}`}>
          Spent {formatMoney(spent, currency)}
          {budget ? ` · ${Math.round(pct * 100)}% of budget` : ""}
          {trendingOver && budget ? " · ahead of pace" : ""}
        </p>
      )}
    </Card>
  );
}
