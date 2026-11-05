import { Fragment } from "react";
import { formatShort } from "../../lib/dates";
import { formatMoney } from "../../lib/fx";
import type { Booking } from "../../lib/inbox";
import { RichText } from "../RichText";
import { fmtTime } from "../TimeField";

const TYPE_LABEL: Record<Booking["type"], string> = {
  flight: "Flight",
  hotel: "Hotel",
  train: "Train",
  bus: "Bus",
  car: "Car rental",
  restaurant: "Restaurant",
  activity: "Activity or ticket",
  other: "Other",
};

const at = (date?: string, time?: string) => [date && formatShort(date), fmtTime(time)].filter(Boolean).join(" ");

/** Every field the email gave us, as label/value pairs (empty ones left out). */
export function bookingRows(b: Booking, subject: string): [string, string][] {
  const rows: [string, string][] = [
    ["Type", TYPE_LABEL[b.type] ?? "Other"],
    ["When", [at(b.start_date, b.start_time), at(b.end_date, b.end_time)].filter(Boolean).join(" → ")],
    ["Route", [b.from, b.to].filter(Boolean).join(" → ")],
    ["Place", b.location_name ?? ""],
    ["Address", b.address ?? ""],
    ["Traveller", b.traveler ?? ""],
    ["Confirmation", b.confirmation ?? ""],
    ["Cost", b.cost != null ? formatMoney(b.cost, b.currency ?? "CAD") : ""],
    ["Forwarded by", b.forwarded_by ?? ""],
    ["Email", subject],
  ];
  return rows.filter(([, v]) => v);
}

/** The expanded card: every detail, then the notes ("**Label:** value" lines). */
export function BookingDetails({ b, subject }: { b: Booking; subject: string }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        {bookingRows(b, subject).map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">{value}</dd>
          </Fragment>
        ))}
      </dl>
      {b.notes && <RichText text={b.notes} className="text-[13px]" />}
    </div>
  );
}
