import type { Reservation } from "../../lib/trips";
import { keyBookingsOf, type OverviewTarget } from "../../lib/overview";
import { Card, ROW_BUTTON } from "./Card";

/** Jump-off rows into the bookings tab: one flights row, then each hotel or train. */
export function QuickLinks({ reservations, onGo }: { reservations: Reservation[]; onGo: (t: OverviewTarget) => void }) {
  const list = keyBookingsOf(reservations, "after", "", 8);
  const rows: string[] = [];
  if (list.some((r) => r.type === "flight")) rows.push("Flights");
  // Hotel titles often start with "Hotel" already; don't say it twice
  for (const r of list) if (r.type !== "flight") rows.push(r.type === "lodging" && !/^hotel/i.test(r.title) ? `Hotel · ${r.title}` : r.title);
  if (!rows.length) return null;
  return (
    <Card title="Quick links" className="order-5">
      <ul className="space-y-2">
        {rows.slice(0, 4).map((label) => (
          <li key={label} className="flex items-center justify-between gap-2 text-[14px]">
            <span className="min-w-0 truncate">{label}</span>
            <button onClick={() => onGo({ kind: "tab", tab: "bookings" })} className={ROW_BUTTON}>
              Open
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
