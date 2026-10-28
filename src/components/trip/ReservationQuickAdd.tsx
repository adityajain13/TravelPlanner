import { RES_ICON, RES_SINGULAR } from "../Reservations";
import type { ReservationType } from "../../lib/trips";

/** The "Reservations" card above the days: one tap to start a new booking of a type. */
export function ReservationQuickAdd({ onPick }: { onPick: (type: ReservationType) => void }) {
  return (
    <div className="mx-2 mt-4 rounded-xl border border-line bg-surface p-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Reservations</p>
      <div className="flex flex-wrap gap-1.5">
        {(["flight", "lodging", "car", "train", "restaurant", "other"] as const).map((t) => (
          <button key={t} onClick={() => onPick(t)} className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted hover:text-fg">
            {RES_ICON[t]} {RES_SINGULAR[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
