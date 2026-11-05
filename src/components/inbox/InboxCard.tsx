import { fmtTime } from "../TimeField";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatShort } from "../../lib/dates";
import { formatMoney } from "../../lib/fx";
import { PINNABLE, reservationTypeFor, type Booking, type InboxItem } from "../../lib/inbox";
import { BookingDetails } from "./BookingDetails";
import { BookingMap } from "./BookingMap";
import { InboxActions } from "./InboxActions";

const summary = (b: Booking) =>
  [b.start_date && formatShort(b.start_date), b.start_time && fmtTime(b.start_time), b.confirmation && `#${b.confirmation}`, b.cost != null && formatMoney(b.cost, b.currency ?? "CAD")]
    .filter(Boolean)
    .join(" · ");

interface Props {
  item: InboxItem;
  icon: ReactNode;
  /** "Add to Dec 3" and the like */
  label: string;
  expanded: boolean;
  onToggle: () => void;
  busy: boolean;
  center?: [number, number];
  onAdd: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}

/** One forwarded booking: a summary line that expands to every detail and a map preview. */
export function InboxCard({ item, icon, label, expanded, onToggle, busy, center, onAdd, onEdit, onDismiss }: Props) {
  const b = item.booking;
  // Details stay mounted once opened, so the map is looked up only the first time
  const [seen, setSeen] = useState(expanded);
  useEffect(() => {
    if (expanded) setSeen(true);
  }, [expanded]);
  const mappable = PINNABLE.has(b.type) && !!(b.address || b.location_name);

  return (
    <li className="rounded-lg bg-surface p-3">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start gap-2.5 text-left">
        <span className="mt-0.5 text-muted">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{b.title}</span>
          <span className="block text-xs text-muted">{summary(b)}</span>
        </span>
        <ChevronDown className={`mt-0.5 size-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {seen && (
        <div hidden={!expanded} className="mt-3 space-y-3">
          <BookingDetails b={b} subject={item.subject} />
          {mappable && <BookingMap b={b} center={center} />}
        </div>
      )}
      <div className="mt-3">
        <InboxActions busy={busy} label={label} canEdit={!!reservationTypeFor(b)} onAdd={onAdd} onEdit={onEdit} onDismiss={onDismiss} />
      </div>
    </li>
  );
}
