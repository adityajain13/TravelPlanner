import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, Eye } from "lucide-react";
import type { Item, Reservation } from "../lib/trips";
import { RES_ICON } from "./Reservations";
import type { PlaceResult } from "../lib/photon";
import { formatDayHeading } from "../lib/dates";
import { ItemCard } from "./ItemCard";
import { PlaceSearch } from "./PlaceSearch";

export interface SectionInfo {
  key: string;
  kind: "day" | "list";
  title?: string;
  listId?: string;
  date?: string;
  dayNumber?: number;
  color: string;
  items: Item[];
  readonlyTitle?: boolean;
}

interface Props {
  info: SectionInfo;
  focused: boolean;
  readOnly?: boolean;
  currency?: string;
  chips?: { r: Reservation; label: string }[];
  onChipClick?: (r: Reservation) => void;
  selectedId: string | null;
  near?: [number, number];
  countryCode?: string;
  onFocus: () => void;
  onSelect: (id: string) => void;
  onRename?: (title: string) => void;
  onAddPlace: (p: PlaceResult) => void;
  onAddNote: (text: string) => void;
  onChange: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
}

export function Section(p: Props) {
  const { info } = p;
  const [open, setOpen] = useState(true);
  const { setNodeRef, isOver } = useDroppable({ id: info.key });
  const placeCount = info.items.filter((i) => i.kind === "place").length;
  let n = 0;

  return (
    <section
      ref={setNodeRef}
      className={`section-lazy border-b border-line/70 py-4 transition-colors last:border-b-0 ${isOver ? "bg-accent/5" : ""}`}
    >
      <div className="flex items-center gap-2 px-2">
        <button onClick={() => setOpen((o) => !o)} className="text-muted hover:text-fg" aria-label={open ? "Collapse" : "Expand"}>
          <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: info.color }} />
        <div className="min-w-0 flex-1">
          {info.kind === "day" ? (
            <h3 className="truncate font-display text-lg">
              <span className="text-muted">Day {info.dayNumber} · </span>
              {formatDayHeading(info.date!)}
            </h3>
          ) : info.readonlyTitle || !p.onRename || p.readOnly ? (
            <h3 className="truncate font-display text-lg">{info.title}</h3>
          ) : (
            <input
              key={info.title}
              defaultValue={info.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== info.title && p.onRename!(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-full bg-transparent font-display text-lg outline-none"
            />
          )}
        </div>
        {placeCount > 0 && <span className="text-xs text-muted tabular-nums">{placeCount}</span>}
        <button
          onClick={p.onFocus}
          className={`grid size-7 place-items-center rounded-md transition-colors ${
            p.focused ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
          }`}
          title={p.focused ? "Show all on map" : "Show only this on map"}
        >
          <Eye className="size-3.5" />
        </button>
      </div>

      {p.chips && p.chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
          {p.chips.map((c, i) => (
            <button
              key={`${c.r.id}-${i}`}
              onClick={() => p.onChipClick?.(c.r)}
              className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-fg"
            >
              <span className="[&>svg]:size-3.5">{RES_ICON[c.r.type]}</span>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-0.5 pl-3">
          <SortableContext items={info.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {info.items.map((it) => (
              <ItemCard
                key={it.id}
                item={it}
                number={it.kind === "place" ? ++n : undefined}
                color={info.color}
                selected={p.selectedId === it.id}
                readOnly={p.readOnly}
                currency={p.currency}
                onSelect={() => p.onSelect(it.id)}
                onChange={(patch) => p.onChange(it.id, patch)}
                onDelete={() => p.onDelete(it.id)}
              />
            ))}
          </SortableContext>
          {info.key !== "orphan" && !p.readOnly && (
            <div className="pt-1.5 pr-1 pl-6">
              <PlaceSearch near={p.near} countryCode={p.countryCode} onPick={p.onAddPlace} onNote={p.onAddNote} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
