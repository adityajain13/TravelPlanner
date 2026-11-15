// PROTOTYPE (proto/new-trip): the trip date range shown right on the page instead of in a popover.
import { Suspense, useState } from "react";
import type { DateRange } from "react-day-picker";
import { calendarClassNames, calendarComponents, CalendarLoading, fromISO, LazyDayPicker, toISO } from "../DatePicker";
import { dtf } from "../../lib/intl";
import { todayISO } from "../../lib/dates";

export function InlineRangeCalendar({
  start,
  end,
  onChange,
  months = 2,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  months?: 1 | 2;
}) {
  // Draft holds a half-picked range (first day chosen, waiting for the last)
  const [draft, setDraft] = useState<DateRange | undefined>({ from: fromISO(start), to: fromISO(end) });
  const from = draft?.from;
  const to = draft?.to;
  const days = from && to ? Math.round((to.getTime() - from.getTime()) / 86400000) + 1 : 0;
  const f = (d: Date) => dtf(undefined, { weekday: "short", month: "short", day: "numeric" }).format(d);

  return (
    <div className="rounded-xl border border-line bg-surface-2/50">
      <Suspense fallback={<CalendarLoading />}>
        <LazyDayPicker
          fixedWeeks
          mode="range"
          selected={draft}
          defaultMonth={fromISO(start)}
          disabled={{ before: fromISO(todayISO())! }}
          numberOfMonths={months}
          onSelect={(r: DateRange | undefined, picked: Date) => {
            const next = draft?.from && draft?.to ? { from: picked, to: undefined } : r;
            setDraft(next);
            if (next?.from && next?.to) onChange(toISO(next.from), toISO(next.to));
          }}
          showOutsideDays={false}
          classNames={{ ...calendarClassNames, months: `${calendarClassNames.months} justify-center` }}
          components={calendarComponents}
        />
      </Suspense>
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm">
        {from && to ? (
          <>
            <span>
              {f(from)} → {f(to)}
            </span>
            <span className="text-muted">{days} days</span>
          </>
        ) : (
          <span className="text-muted">{from ? "Now pick the last day" : "Pick the first day, then the last"}</span>
        )}
      </div>
    </div>
  );
}
