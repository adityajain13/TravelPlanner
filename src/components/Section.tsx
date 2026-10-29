import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { memoLatest } from "../lib/memo";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Check, ChevronDown, Columns3, Eye, GitBranch, PenLine, ListChecks, MapPin, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import type { Item, Reservation } from "../lib/trips";
import { RES_ICON } from "./Reservations";
import { LegChip } from "./LegChip";
import { formatDistance, formatDuration, type LegState, type TravelMode } from "../lib/routing";
import type { PlaceResult } from "../lib/photon";
import { formatDayHeading } from "../lib/dates";
import { ItemCard } from "./ItemCard";
import { fmtTime, TimeField } from "./TimeField";
import { RichText } from "./RichText";
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
  /** Where edits land: the day itself, or the draft being viewed ("draft:<id>"). */
  writeKey?: string;
  /** Days with drafts: the day's plan (id undefined) and each draft, plus the one shown. */
  versions?: { id?: string; name: string }[];
  draftId?: string;
}

interface Props {
  info: SectionInfo;
  focused: boolean;
  readOnly?: boolean;
  currency?: string;
  chips?: { r: Reservation; label: string; at?: string; time?: string; verb?: string; clock?: string; people?: number; copies?: Reservation[] }[];
  /** Bookings in the day as small pills (default look) or slim cards lined up with the stops. */
  chipStyle?: "pill" | "card";
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
  /** Lists only: delete this section and its items. */
  onDeleteSection?: () => void;
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
  /** Day drafts: start one from what's shown, switch which plan is shown, compare them all. */
  onFork?: () => void;
  onVersion?: (draftId: string | undefined) => void;
  onCompare?: () => void;
  onUseDraft?: () => void;
  /** Auto stop times (Settings → Stop times: Auto): per stop how long, and when the day starts. */
  autoTimes?: Map<string, { stay: number; isDefault: boolean; nextDay: boolean }>;
  onStay?: (itemId: string, min: number | undefined) => void;
  onReceipt?: (itemId: string, f: File) => void;
  receiptsLabel?: (itemId: string) => string | undefined;
  /** The trip's people, for "who goes here" on a day's stops. */
  people?: string[];
  /** Saved collapsed state (trip-wide) and how to change it. */
  collapsed?: boolean;
  onCollapsed?: (collapsed: boolean) => void;
  dayStart?: { value: string; isDefault: boolean; landed?: string; onChange?: (t: string | undefined) => void };
}

type Chips = NonNullable<Props["chips"]>;

/**
 * A day or list. The drop target hook re-renders on every drag-state change, so it lives in this
 * thin wrapper; the day itself only re-renders when its own data changed (see memoLatest).
 */
export function Section(p: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: p.info.key });
  return <SectionBody {...p} dropRef={setNodeRef} isOver={isOver} />;
}

const SectionBody = memoLatest(SectionView, "Section");

function SectionView(p: Props & { dropRef: (el: HTMLElement | null) => void; isOver: boolean }) {
  const { info } = p;
  // Collapsed is saved in the trip (everyone sees it collapsed); local only where you can't edit
  const [localOpen, setLocalOpen] = useState(true);
  const open = p.collapsed != null ? !p.collapsed : localOpen;
  const setOpen = (f: (o: boolean) => boolean) => (p.onCollapsed ? p.onCollapsed(!f(open)) : setLocalOpen(f));
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [subEditing, setSubEditing] = useState(false);
  const canInsert = !p.readOnly && info.key !== "orphan";
  const { dropRef: setNodeRef, isOver } = p;
  const placeCount = info.items.filter((i) => i.kind === "place").length;
  const dayTravel = dayTravelText(p.legs);
  let n = 0;
  const chipsAt = placeChips(p.chips ?? [], info.items);
  const card = p.chipStyle === "card";
  const wiring = itemWiring(p);

  return (
    <section
      ref={setNodeRef}
      id={`sec-${info.key}`}
      className={`group/section section-lazy scroll-mt-28 border-b border-line/70 py-4 transition-colors last:border-b-0 ${isOver ? "bg-accent/5" : ""}`}
    >
      <SectionHeader
        info={info}
        open={open}
        setOpen={setOpen}
        subEditing={subEditing}
        setSubEditing={setSubEditing}
        dayTravel={dayTravel}
        placeCount={placeCount}
        readOnly={p.readOnly}
        subtitle={p.subtitle}
        onSubtitle={p.onSubtitle}
        onRename={p.onRename}
        onDeleteSection={p.onDeleteSection}
        onColor={p.onColor}
        dayStart={p.dayStart}
        onVersion={p.onVersion}
        onFork={p.onFork}
        onCompare={p.onCompare}
        onUseDraft={p.onUseDraft}
        focused={p.focused}
        onFocus={p.onFocus}
      />

      {chipsAt.get(0) && (
        <div className={card ? "mt-2 px-3" : "mt-2"}>
          <BookingRows chips={chipsAt.get(0)!} card={card} date={info.date} legs={p.legs} readOnly={p.readOnly} onLegMode={p.onLegMode} onChipClick={p.onChipClick} />
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-0.5 px-3">
          <SortableContext items={info.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {info.items.map((it, idx) => (
              <StopRow
                key={it.id}
                {...wiring}
                item={it}
                idx={idx}
                number={it.kind === "place" && !it.waypoint ? ++n : undefined}
                info={info}
                chipsBefore={chipsAt.get(idx)}
                card={card}
                canInsert={canInsert}
                insertAt={insertAt}
                setInsertAt={setInsertAt}
                menuAt={menuAt}
                setMenuAt={setMenuAt}
              />
            ))}
          </SortableContext>
          {/* After the last stop: the other bookings, then the way to tonight's hotel, then the hotel check-in */}
          {(() => {
            const last = info.items.length > 0 ? chipsAt.get(info.items.length) : undefined;
            const endLeg = p.legs?.has("end") && <LegChips legs={p.legs} id="end" readOnly={p.readOnly} onLegMode={p.onLegMode} />;
            const rows = (chips: NonNullable<typeof last>) => (
              <div className={card ? "pt-1" : "py-1.5"}>
                <BookingRows chips={chips} card={card} date={info.date} legs={p.legs} readOnly={p.readOnly} onLegMode={p.onLegMode} onChipClick={p.onChipClick} />
              </div>
            );
            if (!last)
              return endLeg;
            const rest = last.filter((c) => c.r.type !== "lodging");
            const hotel = last.filter((c) => c.r.type === "lodging");
            return (
              <>
                {rest.length > 0 && rows(rest)}
                {endLeg}
                {hotel.length > 0 && rows(hotel)}
              </>
            );
          })()}
          {info.key !== "orphan" && !p.readOnly && <AddRow near={p.near} countryCode={p.countryCode} onAddPlace={p.onAddPlace} onAddNote={p.onAddNote} onAddChecklist={p.onAddChecklist} />}
        </div>
      )}
    </section>
  );
}

const roundBtn = "grid size-10 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:border-accent hover:text-fg";

/** Day total, like Wanderlog: "2 h 41 min · 182 km" (ground legs only). */
function dayTravelText(legs: Props["legs"]) {
  let secs = 0;
  let metres = 0;
  for (const l of legs?.values() ?? []) {
    if (typeof l.state === "object" && l.state.mode !== "flight") (secs += l.state.duration ?? 0), (metres += l.state.distance);
  }
  return secs > 0 ? `${formatDuration(secs)} · ${formatDistance(metres)}` : null;
}

/** The handlers and settings every stop row needs, passed on unchanged. */
type ItemWiring = Pick<
  Props,
  | "legs"
  | "onLegMode"
  | "readOnly"
  | "currency"
  | "searchContext"
  | "near"
  | "countryCode"
  | "selectedId"
  | "onSelect"
  | "onAddPlace"
  | "onAddNote"
  | "onAddChecklist"
  | "onChange"
  | "onDelete"
  | "checked"
  | "onCheck"
  | "targets"
  | "onMoveTo"
  | "sectionsOf"
  | "onToggleSection"
  | "onCostDetails"
  | "people"
  | "autoTimes"
  | "onStay"
  | "onReceipt"
  | "receiptsLabel"
  | "onChipClick"
>;

function itemWiring(p: Props): ItemWiring {
  return {
    legs: p.legs,
    onLegMode: p.onLegMode,
    readOnly: p.readOnly,
    currency: p.currency,
    searchContext: p.searchContext,
    near: p.near,
    countryCode: p.countryCode,
    selectedId: p.selectedId,
    onSelect: p.onSelect,
    onAddPlace: p.onAddPlace,
    onAddNote: p.onAddNote,
    onAddChecklist: p.onAddChecklist,
    onChange: p.onChange,
    onDelete: p.onDelete,
    checked: p.checked,
    onCheck: p.onCheck,
    targets: p.targets,
    onMoveTo: p.onMoveTo,
    sectionsOf: p.sectionsOf,
    onToggleSection: p.onToggleSection,
    onCostDetails: p.onCostDetails,
    people: p.people,
    autoTimes: p.autoTimes,
    onStay: p.onStay,
    onReceipt: p.onReceipt,
    receiptsLabel: p.receiptsLabel,
    onChipClick: p.onChipClick,
  };
}

/** A leg and, when people go separately (each from their own home), theirs: "<key>#1"… */
function legKeysFor(legs: Props["legs"], key: string) {
  return legs ? [...legs.keys()].filter((k) => k === key || k.startsWith(`${key}#`)).sort() : [];
}

/**
 * The leg into a booking that sits between two stops (`res:<id>` for the first copy; a car's
 * drop-off chip is `res:<id>:drop`, its leg out of the drop-off point).
 */
function viaKeyOf(c: { r: Reservation; copies?: Reservation[]; verb?: string }, legs: Props["legs"]) {
  const suffix = c.verb === "Drop off" ? ":drop" : "";
  return (c.copies ?? [c.r]).map((x) => `res:${x.id}${suffix}`).find((k) => legs?.has(k));
}

function LegChips({ legs, id, readOnly, onLegMode }: { legs: Props["legs"]; id: string; readOnly?: boolean; onLegMode?: Props["onLegMode"] }) {
  return legKeysFor(legs, id).map((k) => {
    const l = legs!.get(k)!;
    return <LegChip key={k} mode={l.mode} state={l.state} readOnly={readOnly} onMode={(m) => onLegMode?.(k, m)} from={l.from} to={l.to} label={l.label} />;
  });
}

/** The bookings lined up in a day: slim cards, or small pills. */
function BookingRows({
  chips,
  card,
  date,
  legs,
  readOnly,
  onLegMode,
  onChipClick,
}: {
  chips: Chips;
  card: boolean;
  date?: string;
  legs: Props["legs"];
  readOnly?: boolean;
  onLegMode?: Props["onLegMode"];
  onChipClick?: (r: Reservation) => void;
}) {
  return card ? (
    <div className="space-y-0.5">
      {chips.map((c, i) => {
        const depKey = c.r.type === "flight" && c.r.startDate === date ? `dep:${c.r.title}|${c.r.startDate}` : "";
        const viaKey = viaKeyOf(c, legs);
        return (
          <div key={`${c.r.id}-${i}`}>
            {depKey && <LegChips legs={legs} id={depKey} readOnly={readOnly} onLegMode={onLegMode} />}
            {viaKey && <LegChips legs={legs} id={viaKey} readOnly={readOnly} onLegMode={onLegMode} />}
            {/* Same columns as a stop: empty pin column, then the card */}
            <div className="flex items-start gap-2 py-1">
              <div className="w-7 shrink-0" />
              <button
                data-res={(c.copies ?? [c.r]).map((x) => x.id).join(" ")}
                onClick={() => onChipClick?.(c.r)}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 rounded-xl border border-line bg-surface/60 px-3 py-2 text-left transition-colors hover:border-muted/50 hover:bg-surface"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted [&>svg]:size-4">{RES_ICON[c.r.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-fg">{c.r.title}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {[c.verb ?? c.label, c.people ? `${c.people} people` : "", ...[...new Set((c.copies ?? [c.r]).map((x) => x.confirmation).filter(Boolean))].map((x) => `#${x}`)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {c.clock && <span className="shrink-0 text-[13px] font-semibold text-fg tabular-nums">{fmtTime(c.clock)}</span>}
                <BookingNotes copies={c.copies ?? [c.r]} verb={c.verb} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <div className="flex flex-col items-start gap-1.5 pl-9">
      {chips.map((c, i) => {
        // The trip to the airport sits right before the flight it's for
        const depKey = c.r.type === "flight" && c.r.startDate === date ? `dep:${c.r.title}|${c.r.startDate}` : "";
        const viaKey = viaKeyOf(c, legs);
        return (
          <div key={`${c.r.id}-${i}`} className="flex flex-col items-start gap-1.5">
            {depKey && legKeysFor(legs, depKey).length > 0 && (
              <div className="-ml-6">
                <LegChips legs={legs} id={depKey} readOnly={readOnly} onLegMode={onLegMode} />
              </div>
            )}
            {viaKey && legKeysFor(legs, viaKey).length > 0 && (
              <div className="-ml-6">
                <LegChips legs={legs} id={viaKey} readOnly={readOnly} onLegMode={onLegMode} />
              </div>
            )}
            <button data-res={(c.copies ?? [c.r]).map((x) => x.id).join(" ")} onClick={() => onChipClick?.(c.r)} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-fg">
              <span className="[&>svg]:size-3.5">{RES_ICON[c.r.type]}</span>
              {c.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface HeaderProps extends Pick<Props, "readOnly" | "subtitle" | "onSubtitle" | "onRename" | "onDeleteSection" | "onColor" | "dayStart" | "onVersion" | "onFork" | "onCompare" | "onUseDraft" | "focused" | "onFocus"> {
  info: SectionInfo;
  open: boolean;
  setOpen: (f: (o: boolean) => boolean) => void;
  subEditing: boolean;
  setSubEditing: (b: boolean) => void;
  dayTravel: string | null;
  placeCount: number;
}

/** Chevron, colour dot, title and subheading, day start, plan tabs, and the stats and buttons on the right. */
function SectionHeader(p: HeaderProps) {
  const { info } = p;
  // Top-aligned so the chevron and dot stay level with the title when a subheading is shown
  return (
    <div className="flex items-start gap-2 pr-3 pl-2">
      <button onClick={() => p.setOpen((o) => !o)} className="mt-2 text-muted hover:text-fg" aria-label={p.open ? "Collapse" : "Expand"}>
        <ChevronDown className={`size-4 transition-transform ${p.open ? "" : "-rotate-90"}`} />
      </button>
      {p.onColor ? (
        <ColorDot color={info.color} onPick={p.onColor} />
      ) : (
        <span className="mt-[11px] size-2.5 shrink-0 rounded-full" style={{ background: info.color }} />
      )}
      <div className="min-w-0 flex-1">
        <SectionTitle info={info} readOnly={p.readOnly} onRename={p.onRename} />
        <Subheading value={p.subtitle} onSave={p.readOnly ? undefined : p.onSubtitle} editing={p.subEditing} setEditing={p.setSubEditing} />
        {p.dayStart && info.items.some((i) => i.kind === "place") && <DayStartRow dayStart={p.dayStart} />}
        {info.versions && info.versions.length > 1 && (
          <VersionTabs
            versions={info.versions}
            draftId={info.draftId}
            onVersion={p.onVersion}
            onFork={p.onFork}
            onCompare={p.onCompare}
            onUseDraft={p.onUseDraft}
          />
        )}
      </div>
      <SectionActions
        dayTravel={p.dayTravel}
        placeCount={p.placeCount}
        subtitle={p.subtitle}
        readOnly={p.readOnly}
        onSubtitle={p.onSubtitle}
        subEditing={p.subEditing}
        setSubEditing={p.setSubEditing}
        onFork={p.onFork}
        multiVersion={!!info.versions && info.versions.length > 1}
        focused={p.focused}
        onFocus={p.onFocus}
        onDelete={p.readOnly ? undefined : p.onDeleteSection}
      />
    </div>
  );
}

function SectionTitle({ info, readOnly, onRename }: { info: SectionInfo; readOnly?: boolean; onRename?: (title: string) => void }) {
  if (info.kind === "day")
    return (
      <h3 className="truncate font-display text-[21px]">
        <span className="font-semibold text-muted">Day {info.dayNumber} · </span>
        {formatDayHeading(info.date!)}
      </h3>
    );
  if (info.readonlyTitle || !onRename || readOnly) return <h3 className="truncate font-display text-[21px]">{info.title}</h3>;
  return (
    <input
      key={info.title}
      defaultValue={info.title}
      onBlur={(e) => e.target.value.trim() && e.target.value !== info.title && onRename!(e.target.value.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="w-full bg-transparent font-display text-[21px] outline-none"
    />
  );
}

function DayStartRow({ dayStart }: { dayStart: NonNullable<Props["dayStart"]> }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
      <span>Day starts</span>
      <TimeField
        value={dayStart.value}
        onChange={(t) => dayStart.onChange?.(t)}
        disabled={!dayStart.onChange}
        className={`rounded-full border border-line px-2.5 py-0.5 font-semibold ${dayStart.isDefault ? "[&]:text-muted" : ""} hover:border-accent/60`}
      />
      {dayStart.landed && dayStart.landed > dayStart.value && <span>· after you land at {fmtTime(dayStart.landed)}</span>}
    </div>
  );
}

/** The day's plan and its drafts as tabs, with the buttons to add, compare and use one. */
function VersionTabs({
  versions,
  draftId,
  onVersion,
  onFork,
  onCompare,
  onUseDraft,
}: {
  versions: NonNullable<SectionInfo["versions"]>;
  draftId?: string;
  onVersion?: Props["onVersion"];
  onFork?: Props["onFork"];
  onCompare?: Props["onCompare"];
  onUseDraft?: Props["onUseDraft"];
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Plans for this day">
      {versions.map((v) => {
        const on = v.id === draftId;
        return (
          <button
            key={v.id ?? "main"}
            title={v.id ? "Draft" : "The day's plan"}
            role="tab"
            aria-selected={on}
            onClick={() => onVersion?.(v.id)}
            className={`flex max-w-[160px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
              on ? "border-accent/50 bg-accent/15 text-accent" : "border-line text-muted hover:text-fg"
            }`}
          >
            {v.id ? <GitBranch className="size-3 shrink-0" /> : <Check className="size-3 shrink-0" aria-label="Day's plan" />}
            <span className="truncate">{v.name}</span>
          </button>
        );
      })}
      {onFork && (
        <button onClick={onFork} title="New draft from the plan shown" aria-label="New draft" className="grid size-7 place-items-center rounded-full border border-dashed border-line text-muted hover:border-accent/60 hover:text-accent">
          <Plus className="size-3.5" />
        </button>
      )}
      <button onClick={onCompare} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
        <Columns3 className="size-3.5" /> Compare
      </button>
      {draftId && onUseDraft && (
        <button onClick={onUseDraft} className="rounded-full bg-accent px-2.5 py-1 text-[12px] font-bold text-on-accent">
          Use this plan
        </button>
      )}
    </div>
  );
}

/** One row, centred on the 28px buttons, level with the title's first line. */
function SectionActions({
  dayTravel,
  placeCount,
  subtitle,
  readOnly,
  onSubtitle,
  subEditing,
  setSubEditing,
  onFork,
  multiVersion,
  focused,
  onFocus,
  onDelete,
}: {
  dayTravel: string | null;
  placeCount: number;
  subtitle?: string;
  readOnly?: boolean;
  onSubtitle?: (text: string) => void;
  subEditing: boolean;
  setSubEditing: (b: boolean) => void;
  onFork?: () => void;
  multiVersion: boolean;
  focused: boolean;
  onFocus: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-1.5 text-xs text-muted tabular-nums">
      {dayTravel && <span className="max-sm:hidden">{dayTravel}</span>}
      {dayTravel && placeCount > 0 && <span className="max-sm:hidden">·</span>}
      {placeCount > 0 && <span className="mr-1">{placeCount} {placeCount === 1 ? "pin" : "pins"}</span>}
      {!subtitle && !readOnly && onSubtitle && !subEditing && (
        <button
          onClick={() => setSubEditing(true)}
          className="grid size-7 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover/section:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 max-md:opacity-60"
          title="Add a subheading (e.g. the city)"
          aria-label="Add a subheading"
        >
          <PenLine className="size-3.5" />
        </button>
      )}
      {onFork && !multiVersion && (
        <button
          onClick={onFork}
          className="grid size-7 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover/section:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 max-md:opacity-60"
          title="Try another plan for this day (draft)"
          aria-label="New draft of this day"
        >
          <GitBranch className="size-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="grid size-7 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover/section:opacity-100 hover:bg-surface-2 hover:text-red-400 focus-visible:opacity-100 max-md:opacity-60"
          title="Delete section"
          aria-label="Delete section"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
      <button
        onClick={onFocus}
        className={`grid size-7 place-items-center rounded-md transition-colors ${
          focused ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
        }`}
        title={focused ? "Show all on map" : "Show only this on map"}
      >
        <Eye className="size-3.5" />
      </button>
    </div>
  );
}

interface StopRowProps extends ItemWiring {
  item: Item;
  idx: number;
  number?: number;
  info: SectionInfo;
  /** Bookings that sit right before this stop. */
  chipsBefore?: Chips;
  card: boolean;
  canInsert: boolean;
  insertAt: number | null;
  setInsertAt: Dispatch<SetStateAction<number | null>>;
  menuAt: number | null;
  setMenuAt: Dispatch<SetStateAction<number | null>>;
}

/** One stop of a day or list: the bookings before it, the "+" gap (or the insert box), and the card. */
function StopRow({ item, idx, number, info, chipsBefore, card, canInsert, insertAt, setInsertAt, menuAt, setMenuAt, ...p }: StopRowProps) {
  return (
    <div data-item-wrap className="scroll-mt-28">
      {idx > 0 && chipsBefore && (
        <div className={card ? "pt-1" : "pt-2 pb-1"}>
          <BookingRows chips={chipsBefore} card={card} date={info.date} legs={p.legs} readOnly={p.readOnly} onLegMode={p.onLegMode} onChipClick={p.onChipClick} />
        </div>
      )}
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
        // A "+" before every stop, the first included (e.g. between a booking and stop 1)
        canInsert && (
          <InsertGap
            idx={idx}
            itemId={item.id}
            legs={p.legs}
            readOnly={p.readOnly}
            onLegMode={p.onLegMode}
            menuAt={menuAt}
            setMenuAt={setMenuAt}
            setInsertAt={setInsertAt}
            onAddNote={p.onAddNote}
            onAddChecklist={p.onAddChecklist}
          />
        )
      )}
      {(insertAt === idx || !canInsert) && p.legs?.has(item.id) && <LegChips legs={p.legs} id={item.id} readOnly={p.readOnly} onLegMode={p.onLegMode} />}
      <ItemCard
        key={item.id}
        item={item}
        number={number}
        color={info.color}
        selected={p.selectedId === item.id}
        readOnly={p.readOnly}
        currency={p.currency}
        searchContext={p.searchContext}
        timeBefore={info.kind === "day" ? latestBefore(info.items, idx) : undefined}
        auto={p.autoTimes?.get(item.id)}
        onStay={p.onStay ? (m) => p.onStay!(item.id, m) : undefined}
        onSelect={() => p.onSelect(item.id)}
        onChange={(patch) => p.onChange(item.id, patch)}
        onDelete={() => p.onDelete(item.id)}
        checked={p.checked?.has(item.id)}
        selecting={!!p.checked?.size}
        onCheck={p.onCheck && info.key !== "orphan" ? (c, shift) => p.onCheck!(item.id, c, shift) : undefined}
        targets={p.targets}
        onMoveTo={p.onMoveTo ? (k) => p.onMoveTo!(item.id, k) : undefined}
        sections={p.sectionsOf?.(item.id)}
        onToggleSection={p.onToggleSection ? (k) => p.onToggleSection!(item.id, k) : undefined}
        onCostDetails={p.onCostDetails ? () => p.onCostDetails!(item.id) : undefined}
        people={info.kind === "day" ? p.people : undefined}
        onReceipt={p.onReceipt ? (f) => p.onReceipt!(item.id, f) : undefined}
        receiptsLabel={p.receiptsLabel?.(item.id)}
      />
    </div>
  );
}

interface InsertGapProps {
  idx: number;
  itemId: string;
  legs: Props["legs"];
  readOnly?: boolean;
  onLegMode?: Props["onLegMode"];
  menuAt: number | null;
  setMenuAt: Dispatch<SetStateAction<number | null>>;
  setInsertAt: Dispatch<SetStateAction<number | null>>;
  onAddNote: Props["onAddNote"];
  onAddChecklist?: Props["onAddChecklist"];
}

/** The "+" between two stops, its menu, and the legs (travel) that arrive at this stop. */
function InsertGap({ idx, itemId, legs, readOnly, onLegMode, menuAt, setMenuAt, setInsertAt, onAddNote, onAddChecklist }: InsertGapProps) {
  return (
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
          onNote={() => (setMenuAt(null), onAddNote("", idx))}
          onChecklist={onAddChecklist ? () => (setMenuAt(null), onAddChecklist(idx)) : undefined}
        />
      )}
      {!legs?.has(itemId) && <div className="h-3.5" />}
      {legs?.has(itemId) && <LegChips legs={legs} id={itemId} readOnly={readOnly} onLegMode={onLegMode} />}
    </div>
  );
}

/** The add row at the bottom of a day or list: place search, note and checklist. */
function AddRow({ near, countryCode, onAddPlace, onAddNote, onAddChecklist }: Pick<Props, "near" | "countryCode" | "onAddPlace" | "onAddNote" | "onAddChecklist">) {
  return (
    <div className="flex items-center gap-2 pt-1.5 pl-6">
      <PlaceSearch near={near} countryCode={countryCode} onPick={onAddPlace} onNote={onAddNote} />
      <button onClick={() => onAddNote("")} className={roundBtn} title="Add a note" aria-label="Add a note">
        <StickyNote className="size-[18px]" />
      </button>
      {onAddChecklist && (
        <button onClick={() => onAddChecklist()} className={roundBtn} title="Add a checklist" aria-label="Add a checklist">
          <ListChecks className="size-[18px]" />
        </button>
      )}
    </div>
  );
}

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
/**
 * Each traveller's notes on a shared booking (seat numbers…), one after another with a gap;
 * named when the booking is several people's.
 */
function BookingNotes({ copies, verb }: { copies: Reservation[]; verb?: string }) {
  // Multi-day bookings carry their notes on the first day (check-in, pick-up, departure); the
  // last day only shows the line about it (check-out time, drop-off, arrival terminal); days in
  // between show none
  const keep = END_LINES[verb ?? ""];
  const notesOf = (r: Reservation) => {
    if (verb === "Staying") return "";
    if (!keep) return r.notes ?? "";
    return (r.notes ?? "")
      .split("\n")
      .filter((l) => keep.some((k) => l.startsWith(`**${k}:**`)))
      .join("\n");
  };
  const withNotes = copies.map((r) => ({ ...r, notes: notesOf(r) })).filter((r) => r.notes.trim());
  if (!withNotes.length) return null;
  const named = copies.length > 1;
  return (
    <div className="mt-2 w-full space-y-2.5 border-t border-line/70 pt-2 pl-11 text-[13px] leading-snug text-muted">
      {withNotes.map((r) => (
        <div key={r.id}>
          {named && r.traveler && <p className="mb-0.5 text-[11px] font-bold tracking-wide text-fg/80 uppercase">{r.traveler}</p>}
          <RichText text={r.notes!} />
        </div>
      ))}
    </div>
  );
}

const END_LINES: Record<string, string[]> = {
  "Check-out": ["Check-out"],
  "Drop off": ["Drop-off", "Fuel"],
  Arrives: ["Terminal", "Baggage"],
};

/** Where a booking at time t goes among the stops (index of the stop it sits before; items.length = after all). */
export function slotFor(items: Item[], t: string): number {
  const at = hhmm(t);
  if (!at) return 0;
  const times = items.map(stopTime);
  let i = 0;
  times.forEach((x, k) => x && x <= at && (i = k + 1));
  if (i === 0) {
    const next = times.findIndex((x) => x && x > at);
    i = next < 0 ? items.length : next;
  }
  return i;
}

export function placeChips(chips: NonNullable<Props["chips"]>, items: Item[]) {
  const at = new Map<number, NonNullable<Props["chips"]>>();
  const add = (i: number, c: NonNullable<Props["chips"]>[number]) => at.set(i, [...(at.get(i) ?? []), c]);
  const anyTimed = items.some((it) => stopTime(it));
  for (const c of chips) {
    const t = hhmm(c.time);
    if (c.at?.startsWith("~") && items.length) add(items.length, c);
    else if (!t || !anyTimed || c.at?.startsWith("!")) add(0, c);
    else add(slotFor(items, t), c);
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
