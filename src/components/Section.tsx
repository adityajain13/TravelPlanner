import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, Eye, PenLine, ListChecks, MapPin, Pencil, Plus, StickyNote } from "lucide-react";
import type { Item, Reservation } from "../lib/trips";
import { RES_ICON } from "./Reservations";
import { LegChip } from "./LegChip";
import { formatDistance, formatDuration, type LegState, type TravelMode } from "../lib/routing";
import type { PlaceResult } from "../lib/photon";
import { formatDayHeading } from "../lib/dates";
import { ItemCard } from "./ItemCard";
import { PlaceSearch } from "./PlaceSearch";
import type { SectionTarget } from "./SectionPicker";
import { Popover } from "./DatePicker";
import { DAY_SWATCHES } from "../lib/colors";
import { HexColorInput, HexColorPicker } from "react-colorful";

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
  chips?: { r: Reservation; label: string; at?: string; time?: string }[];
  /** Incoming leg per item id (days only). */
  legs?: Map<string, { mode: TravelMode; state?: LegState; from: [number, number]; to: [number, number]; label?: string }>;
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
  sectionsOf?: (id: string) => string[];
  onToggleSection?: (id: string, section: string) => void;
  onCostDetails?: (id: string) => void;
  subtitle?: string;
  onSubtitle?: (text: string) => void;
  /** Days: pick this day's colour (undefined resets to the default). */
  onColor?: (hex: string | undefined) => void;
}

export function Section(p: Props) {
  const { info } = p;
  const [open, setOpen] = useState(true);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [subEditing, setSubEditing] = useState(false);
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
  const chipsAt = placeChips(p.chips ?? [], info.items);
  const chipRow = (cs: NonNullable<Props["chips"]>) => (
    <div className="flex flex-col items-start gap-1.5 pl-9">
      {cs.map((c, i) => {
        // The trip to the airport sits right before the flight it's for
        const depKey = c.r.type === "flight" && c.r.startDate === info.date ? `dep:${c.r.title}|${c.r.startDate}` : "";
        const dep = depKey ? p.legs?.get(depKey) : undefined;
        return (
          <div key={`${c.r.id}-${i}`} className="flex flex-col items-start gap-1.5">
            {dep && (
              <div className="-ml-6">
                <LegChip mode={dep.mode} state={dep.state} readOnly={p.readOnly} onMode={(m) => p.onLegMode?.(depKey, m)} from={dep.from} to={dep.to} label={dep.label} />
              </div>
            )}
            <button onClick={() => p.onChipClick?.(c.r)} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-fg">
              <span className="[&>svg]:size-3.5">{RES_ICON[c.r.type]}</span>
              {c.label}
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <section
      ref={setNodeRef}
      id={`sec-${info.key}`}
      className={`group/section section-lazy scroll-mt-28 border-b border-line/70 py-4 transition-colors last:border-b-0 ${isOver ? "bg-accent/5" : ""}`}
    >
      {/* Top-aligned so the chevron and dot stay level with the title when a subheading is shown */}
      <div className="flex items-start gap-2 px-2">
        <button onClick={() => setOpen((o) => !o)} className="mt-2 text-muted hover:text-fg" aria-label={open ? "Collapse" : "Expand"}>
          <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        {p.onColor ? (
          <ColorDot color={info.color} onPick={p.onColor} />
        ) : (
          <span className="mt-[11px] size-2.5 shrink-0 rounded-full" style={{ background: info.color }} />
        )}
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
          <Subheading value={p.subtitle} onSave={p.readOnly ? undefined : p.onSubtitle} editing={subEditing} setEditing={setSubEditing} />
        </div>
        {/* One row, centred on the 28px buttons, level with the title's first line */}
        <div className="flex h-8 shrink-0 items-center gap-1.5 text-xs text-muted tabular-nums">
          {dayTravel && <span className="max-sm:hidden">{dayTravel}</span>}
          {dayTravel && placeCount > 0 && <span className="max-sm:hidden">·</span>}
          {placeCount > 0 && <span className="mr-1">{placeCount} {placeCount === 1 ? "pin" : "pins"}</span>}
          {!p.subtitle && !p.readOnly && p.onSubtitle && !subEditing && (
            <button
              onClick={() => setSubEditing(true)}
              className="grid size-7 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover/section:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 max-md:opacity-60"
              title="Add a subheading (e.g. the city)"
              aria-label="Add a subheading"
            >
              <PenLine className="size-3.5" />
            </button>
          )}
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
      </div>

      {chipsAt.get(0) && <div className="mt-2">{chipRow(chipsAt.get(0)!)}</div>}
      {open && (
        <div className="mt-2 space-y-0.5 pl-3">
          <SortableContext items={info.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {info.items.map((it, idx) => (
              <div key={it.id}>
              {idx > 0 && chipsAt.get(idx) && <div className="pt-2 pb-1">{chipRow(chipsAt.get(idx)!)}</div>}
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
                        label={p.legs.get(it.id)!.label}
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
                  label={p.legs.get(it.id)!.label}
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
                timeBefore={info.kind === "day" ? latestBefore(info.items, idx) : undefined}
                onSelect={() => p.onSelect(it.id)}
                onChange={(patch) => p.onChange(it.id, patch)}
                onDelete={() => p.onDelete(it.id)}
                checked={p.checked?.has(it.id)}
                selecting={!!p.checked?.size}
                onCheck={p.onCheck && info.key !== "orphan" ? (c, shift) => p.onCheck!(it.id, c, shift) : undefined}
                targets={p.targets}
                onMoveTo={p.onMoveTo ? (k) => p.onMoveTo!(it.id, k) : undefined}
                sections={p.sectionsOf?.(it.id)}
                onToggleSection={p.onToggleSection ? (k) => p.onToggleSection!(it.id, k) : undefined}
                onCostDetails={p.onCostDetails ? () => p.onCostDetails!(it.id) : undefined}
              />
              </div>
            ))}
          </SortableContext>
          {p.legs?.has("end") && (
            <LegChip
              mode={p.legs.get("end")!.mode}
              state={p.legs.get("end")!.state}
              readOnly={p.readOnly}
              onMode={(m) => p.onLegMode?.("end", m)}
              from={p.legs.get("end")!.from}
              to={p.legs.get("end")!.to}
              label={p.legs.get("end")!.label}
            />
          )}
          {chipsAt.get(info.items.length) && info.items.length > 0 && <div className="py-1.5">{chipRow(chipsAt.get(info.items.length)!)}</div>}
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

/** Optional subheading under a day or list ("Osaka", "Golden Circle"), edited in place. */
function Subheading({ value, onSave, editing, setEditing }: { value?: string; onSave?: (t: string) => void; editing: boolean; setEditing: (b: boolean) => void }) {
  if (!onSave) return value ? <p className="truncate text-[14px] font-semibold text-muted">{value}</p> : null;
  if (editing)
    return (
      <input
        autoFocus
        defaultValue={value}
        placeholder="Add a subheading, e.g. Osaka"
        onBlur={(e) => (setEditing(false), e.target.value.trim() !== (value ?? "") && onSave(e.target.value.trim()))}
        onKeyDown={(e) => (e.key === "Enter" ? (e.target as HTMLInputElement).blur() : e.key === "Escape" && setEditing(false))}
        className="mt-0.5 w-full max-w-xs rounded-md bg-surface-2 px-2 py-0.5 text-[14px] font-semibold outline-none placeholder:font-normal placeholder:text-muted/60"
      />
    );
  return value ? (
    <button onClick={() => setEditing(true)} className="group/sub flex max-w-full items-center gap-1.5 rounded-md text-left text-[14px] font-semibold text-muted hover:text-fg">
      <span className="truncate">{value}</span>
      <Pencil className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/sub:opacity-100 max-md:opacity-60" />
    </button>
  ) : null;
}

/** The day's dot doubles as its colour picker. */
function ColorDot({ color, onPick }: { color: string; onPick: (hex: string | undefined) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<string | null>(null); // themed picker instead of the OS colour dialog
  useEffect(() => {
    if (!open) setCustom(null);
  }, [open]);
  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen((o) => !o)}
        className="mt-[7px] grid size-[18px] shrink-0 place-items-center rounded-full hover:ring-2 hover:ring-line"
        title="Change this day's colour"
        aria-label="Change this day's colour"
      >
        <span className="size-2.5 rounded-full" style={{ background: color }} />
      </button>
      {open && ref.current && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)}>
          <div className="w-56 p-3">
            <p className="mb-2 text-[12px] font-bold tracking-wider text-muted uppercase">Day colour</p>
            <div className="grid grid-cols-6 gap-2">
              {DAY_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => (onPick(c), setOpen(false))}
                  className={`size-7 rounded-full ${c.toLowerCase() === color.toLowerCase() ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : "hover:scale-110"} transition-transform`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
            {custom !== null && (
              <div className="tp-colorful mt-3 space-y-2.5 border-t border-line pt-3">
                <HexColorPicker color={custom} onChange={setCustom} />
                <div className="flex items-center gap-2">
                  <span className="size-7 shrink-0 rounded-full" style={{ background: custom }} />
                  <HexColorInput
                    color={custom}
                    onChange={setCustom}
                    prefixed
                    className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 font-mono text-[13px] uppercase outline-none focus:border-accent"
                    aria-label="Hex colour"
                  />
                  <button onClick={() => (onPick(custom), setOpen(false))} className="rounded-full bg-accent px-3 py-1.5 text-[13px] font-bold text-on-accent">
                    Use
                  </button>
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[13px] font-semibold">
              <button onClick={() => setCustom((c) => (c === null ? color : null))} className={`flex items-center gap-2 ${custom !== null ? "text-fg" : "text-muted hover:text-fg"}`}>
                <span className="size-4 rounded-full" style={{ background: "conic-gradient(#f06b8b, #e8d25a, #5fd68b, #6aa8ff, #c58cff, #f06b8b)" }} />
                Custom
              </button>
              <button onClick={() => (onPick(undefined), setOpen(false))} className="text-muted hover:text-fg">
                Reset
              </button>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

const hhmm = (t?: string) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.padStart(5, "0").slice(0, 5) : undefined);
/** A stop's place in the day: its start time, else its end ("until 3:00"). */
export const stopTime = (it: Item) => hhmm(it.startTime) ?? hhmm(it.endTime);

/**
 * Where each booking chip sits among the day's stops (index = before that stop; items.length =
 * after the last). Timed bookings go after the last stop at or before their time, so a 07:30
 * flight follows a stop you leave at 03:00. "Staying at"/check-outs open the day, check-ins close
 * it, and with no timed stops at all everything stays at the top as before.
 */
export function placeChips(chips: NonNullable<Props["chips"]>, items: Item[]) {
  const at = new Map<number, NonNullable<Props["chips"]>>();
  const add = (i: number, c: NonNullable<Props["chips"]>[number]) => at.set(i, [...(at.get(i) ?? []), c]);
  const times = items.map(stopTime);
  const anyTimed = times.some(Boolean);
  for (const c of chips) {
    const t = hhmm(c.time);
    if (c.at?.startsWith("~") && items.length) add(items.length, c);
    else if (!t || !anyTimed || c.at?.startsWith("!")) add(0, c);
    else {
      let i = 0;
      times.forEach((x, k) => x && x <= t && (i = k + 1));
      if (i === 0) {
        const next = times.findIndex((x) => x && x > t);
        i = next < 0 ? items.length : next;
      }
      add(i, c);
    }
  }
  return at;
}

/** Latest start/end time among the stops above position idx (not just the one directly above). */
function latestBefore(items: Item[], idx: number) {
  let best: string | undefined;
  for (const it of items.slice(0, idx))
    for (const t of [it.startTime, it.endTime]) {
      const v = hhmm(t);
      if (v && (!best || v > best)) best = v;
    }
  return best;
}
