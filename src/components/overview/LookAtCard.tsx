import { Check } from "lucide-react";
import type { LookItem, OverviewTarget } from "../../lib/overview";
import { Card, ROW_BUTTON } from "./Card";

/** Readiness checklist: what's still missing first, then what's done. */
export function LookAtCard({ look, readyCount, readOnly, onGo }: { look: LookItem[]; readyCount: number; readOnly: boolean; onGo: (t: OverviewTarget) => void }) {
  return (
    <Card title="To look at" aside={`${readyCount} of ${look.length} ready`} className="order-3">
      <ul className="space-y-2.5">
        {look.map((l) => (
          <LookRow key={l.id} item={l} readOnly={readOnly} onGo={onGo} />
        ))}
      </ul>
    </Card>
  );
}

function LookRow({ item, readOnly, onGo }: { item: LookItem; readOnly: boolean; onGo: (t: OverviewTarget) => void }) {
  // Read-only viewers can't add bookings, so the Add button is hidden for them
  const action = item.action && !(readOnly && item.action.go.kind === "addRes") ? item.action : undefined;
  return (
    <li className="flex items-start gap-2.5 text-[14px]">
      {item.ok ? (
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
          <Check className="size-3.5" />
        </span>
      ) : (
        <span className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-dashed border-amber-400" />
      )}
      <span className={`min-w-0 flex-1 ${item.ok ? "text-muted" : ""}`}>{item.text}</span>
      {action && (
        <button onClick={() => onGo(action.go)} className={ROW_BUTTON}>
          {action.label}
        </button>
      )}
    </li>
  );
}
