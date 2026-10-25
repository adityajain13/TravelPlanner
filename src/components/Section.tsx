import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, Eye, ListChecks, MapPin, Plus, StickyNote } from "lucide-react";
import type { Item, Reservation } from "../lib/trips";
import { RES_ICON } from "./Reservations";
import { LegChip } from "./LegChip";
import { formatDistance, formatDuration, type LegState, type TravelMode } from "../lib/routing";
import type { PlaceResult } from "../lib/photon";
import { formatDayHeading } from "../lib/dates";
import { ItemCard } from "./ItemCard";
import { PlaceSearch } from "./PlaceSearch";
import type { SectionTarget } from "./SectionPicker";

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
  /** Incoming leg per item id (days only). */
  legs?: Map<string, { mode: TravelMode; state?: LegState; from: [number, number]; to: [number, number] }>;
  searchContext?: string;
  onLegMode?: (itemId: string, mode: TravelMode) => void;
  onChipClick?: (r: Reservation) => void;
  selectedId: string | null;
  near?: [number, number];
  countryCode?: string;
  onFocus: () => void;
  onSelect: (id: string) => void;
  onRename?: (title: string) => void;
  /** index: insert before the item at that position (from the "+" between stops); omitted = append. */
  onAddPlace: (p: PlaceResult, index?: number) => void;
  onAddNote: (text: string, index?: number) => void;
  onAddChecklist?: (index?: number) => void;
  onChange: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
  checked?: Set<string>;
  onCheck?: (id: string, checked: boolean, shift: boolean) => void;
  targets?: SectionTarget[];
  onMoveTo?: (id: string, section: string) => void;
  onCostDetails?: (id: string) => void;
}

export function Section(p: Props) {
  const { info } = p;
  const [open, setOpen] = useState(true);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const canInsert = !p.readOnly && info.key !== "orphan";
  const { setNodeRef, isOver } = useDroppable({ id: info.key });
  const placeCount = info.items.filter((i) => i.kind === "place").length;
  // Day total, like Wanderlog: "2 h 41 min · 182 km" (ground legs only)
  let secs = 0;
  let metres = 0;
  for (const l of p.legs?.values() ?? []) {
    if (typeof l.state === "object" && l.state.mode !== "flight") (secs += l.state.duration ?? 0), (metres += l.state.distance);
  }
  const dayTravel = secs > 0 ? `${formatDuration(secs)} · ${formatDistance(metres)}` : null;
  let n = 0;

  return (
    <section
      ref={setNodeRef}
      id={`sec-${info.key}`}
      className={`section-lazy scroll-mt-28 border-b border-line/70 py-4 transition-colors last:border-b-0 ${isOver ? "bg-accent/5" : ""}`}
    >
      <div className="flex items-center gap-2 px-2">
        <button onClick={() => setOpen((o) => !o)} className="text-muted hover:text-fg" aria-label={open ? "Collapse" : "Expand"}>
          <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: info.color }} />
        <div className="min-w-0 flex-1">
          {info.kind === "day" ? (
            <h3 className="truncate font-display text-[21px]">
              <span className="font-semibold text-muted">Day {info.dayNumber} · </span>
              {formatDayHeading(info.date!)}
            </h3>
          ) : info.readonlyTitle || !p.onRename || p.readOnly ? (
            <h3 className="truncate font-display text-[21px]">{info.title}</h3>
          ) : (
            <input
              key={info.title}
              defaultValue={info.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== info.title && p.onRename!(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-full bg-transparent font-display text-[21px] outline-none"
            />
          )}
        </div>
        {dayTravel && <span className="text-xs text-muted tabular-nums max-sm:hidden">{dayTravel}</span>}
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
            {info.items.map((it, idx) => (
              <div key={it.id}>
              {insertAt === idx ? (
                <div className="py-1.5 pr-1 pl-9" data-popover>
                  <PlaceSearch
                    autoFocus
                    near={p.near}
                    countryCode={p.countryCode}
                    onPick={(r) => (p.onAddPlace(r, idx), setInsertAt(null))}
                    onNote={(t) => (p.onAddNote(t, idx), setInsertAt(null))}
                    onCancel={() => setInsertAt(null)}
                  />
                </div>
              ) : (
                idx > 0 &&
                canInsert && (
                  <div className="group/gap relative">
                    <button
                      onClick={() => setMenuAt((m) => (m === idx ? null : idx))}
                      className={`absolute top-1/2 left-0 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted transition-opacity group-hover/gap:opacity-100 hover:bg-surface-2 hover:text-accent focus-visible:opacity-100 max-md:opacity-50 ${menuAt === idx ? "bg-surface-2 text-accent opacity-100" : "opacity-0"}`}
                      title="Add something here"
                      aria-label="Add something here"
                    >
                      <Plus className="size-4" />
                    </button>
                    {menuAt === idx && (
                      <InsertMenu
                        onClose={() => setMenuAt(null)}
                        onPlace={() => (setMenuAt(null), setInsertAt(idx))}
                        onNote={() => (setMenuAt(null), p.onAddNote("", idx))}
                        onChecklist={p.onAddChecklist ? () => (setMenuAt(null), p.onAddChecklist!(idx)) : undefined}
                      />
                    )}
                    {!p.legs?.has(it.id) && <div className="h-3.5" />}
                    {p.legs?.has(it.id) && (
                      <LegChip
                        mode={p.legs.get(it.id)!.mode}
                        state={p.legs.get(it.id)!.state}
                        readOnly={p.readOnly}
                        onMode={(m) => p.onLegMode?.(it.id, m)}
                        from={p.legs.get(it.id)!.from}
                        to={p.legs.get(it.id)!.to}
                      />
                    )}
                  </div>
                )
              )}
              {(insertAt === idx || idx === 0 || !canInsert) && p.legs?.has(it.id) && (
                <LegChip
                  mode={p.legs.get(it.id)!.mode}
                  state={p.legs.get(it.id)!.state}
                  readOnly={p.readOnly}
                  onMode={(m) => p.onLegMode?.(it.id, m)}
                  from={p.legs.get(it.id)!.from}
                  to={p.legs.get(it.id)!.to}
                />
              )}
              <ItemCard
                key={it.id}
                item={it}
                number={it.kind === "place" ? ++n : undefined}
                color={info.color}
                selected={p.selectedId === it.id}
                readOnly={p.readOnly}
                currency={p.currency}
                searchContext={p.searchContext}
                onSelect={() => p.onSelect(it.id)}
                onChange={(patch) => p.onChange(it.id, patch)}
                onDelete={() => p.onDelete(it.id)}
                checked={p.checked?.has(it.id)}
                selecting={!!p.checked?.size}
                onCheck={p.onCheck && info.key !== "orphan" ? (c, shift) => p.onCheck!(it.id, c, shift) : undefined}
                targets={p.targets}
                onMoveTo={p.onMoveTo ? (k) => p.onMoveTo!(it.id, k) : undefined}
                onCostDetails={p.onCostDetails ? () => p.onCostDetails!(it.id) : undefined}
              />
              </div>
            ))}
          </SortableContext>
          {info.key !== "orphan" && !p.readOnly && (
            <div className="flex items-center gap-2 pt-1.5 pr-1 pl-6">
              <PlaceSearch near={p.near} countryCode={p.countryCode} onPick={p.onAddPlace} onNote={p.onAddNote} />
              <button onClick={() => p.onAddNote("")} className={roundBtn} title="Add a note" aria-label="Add a note">
                <StickyNote className="size-[18px]" />
              </button>
              {p.onAddChecklist && (
                <button onClick={() => p.onAddChecklist!()} className={roundBtn} title="Add a checklist" aria-label="Add a checklist">
                  <ListChecks className="size-[18px]" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const roundBtn = "grid size-10 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:border-accent hover:text-fg";

/** Wanderlog's "+" between stops: add a place, a note or a checklist right here. */
function InsertMenu({ onClose, onPlace, onNote, onChecklist }: { onClose: () => void; onPlace: () => void; onNote: () => void; onChecklist?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    setTimeout(() => document.addEventListener("mousedown", down));
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", down), document.removeEventListener("keydown", esc));
  }, [onClose]);
  const row = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] hover:bg-surface-2";
  return (
    <div ref={ref} data-popover className="absolute top-full left-0 z-40 mt-0.5 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
      <button onClick={onPlace} className={row}>
        <MapPin className="size-4 text-accent" /> Add a place
      </button>
      <button onClick={onNote} className={row}>
        <StickyNote className="size-4 text-muted" /> Add a note
      </button>
      {onChecklist && (
        <button onClick={onChecklist} className={row}>
          <ListChecks className="size-4 text-muted" /> Add a checklist
        </button>
      )}
    </div>
  );
}
