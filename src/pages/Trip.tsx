import { Suspense, lazy, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ArrowLeft, Eye, List, Map as MapIcon, Plus } from "lucide-react";
import { useTrip } from "../lib/useTrip";
import { useTheme } from "../lib/theme";
import { daysBetween } from "../lib/dates";
import {
  addItem,
  addList,
  moveItem,
  removeItem,
  renameList,
  sectionsFor,
  updateItem,
  updateMeta,
  type Item,
} from "../lib/trips";
import { LIST_COLOR, SECTION_COLORS } from "../lib/colors";
import type { Pin, Route } from "../components/TripMap";
// MapLibre is the heaviest dependency; load it after the plan panel is on screen.
const TripMap = lazy(() => import("../components/TripMap").then((m) => ({ default: m.TripMap })));
import { Section, type SectionInfo } from "../components/Section";
import { ThemeToggle } from "../components/ThemeToggle";
import { OfflineMapButton } from "../components/OfflineMapButton";

const ORPHAN = "orphan";

export function TripPage() {
  const { id } = useParams();
  const { doc, state, ready } = useTrip(id);
  const [theme, toggleTheme] = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null); // section shown alone on the map
  const [mobileView, setMobileView] = useState<"plan" | "map">("plan");
  const [dragging, setDragging] = useState<Item | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Build sections, their items, colours and map data in one pass
  const view = useMemo(() => {
    if (!state) return null;
    const order = sectionsFor(state);
    const days = daysBetween(state.meta.startDate, state.meta.endDate);
    const bySection = new Map<string, Item[]>(order.map((s) => [s, []]));
    const orphans: Item[] = [];
    for (const it of state.items) (bySection.get(it.section) ?? orphans).push(it);

    const sections: SectionInfo[] = order.map((key) => {
      if (key.startsWith("list:")) {
        const l = state.lists.find((x) => `list:${x.id}` === key)!;
        return { key, kind: "list", title: l.title, listId: l.id, color: LIST_COLOR, items: bySection.get(key)! };
      }
      const date = key.slice(4);
      const i = days.indexOf(date);
      return { key, kind: "day", date, dayNumber: i + 1, color: SECTION_COLORS[i % SECTION_COLORS.length], items: bySection.get(key)! };
    });
    if (orphans.length)
      sections.push({ key: ORPHAN, kind: "list", title: "Outside trip dates", color: LIST_COLOR, items: orphans, readonlyTitle: true });

    const pins: Pin[] = [];
    const routes: Route[] = [];
    for (const s of sections) {
      if (focus && s.key !== focus) continue;
      let n = 0;
      const coords: [number, number][] = [];
      for (const it of s.items) {
        if (it.kind !== "place") continue;
        n++;
        if (it.lat == null || it.lng == null) continue;
        pins.push({ id: it.id, lat: it.lat, lng: it.lng, color: s.color, label: String(n) });
        coords.push([it.lng, it.lat]);
      }
      if (s.kind === "day") routes.push({ color: s.color, coords });
    }
    return { sections, pins, routes };
  }, [state, focus]);

  if (!ready) return <div className="grid h-full place-items-center text-muted">Loading…</div>;
  if (!state || !doc || !view) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="space-y-3">
          <p className="font-display text-2xl">Trip not found on this device</p>
          <Link to="/" className="text-accent">
            Back to trips
          </Link>
        </div>
      </div>
    );
  }

  const near = state.meta.center;
  const sectionOf = (itemId: string) => view.sections.find((s) => s.items.some((i) => i.id === itemId));

  function onDragStart(e: DragStartEvent) {
    setDragging(state!.items.find((i) => i.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || overId === activeId) return;
    const target = view!.sections.find((s) => s.key === overId) ?? sectionOf(overId);
    if (!target || target.key === ORPHAN) return;
    const overIdx = target.items.findIndex((i) => i.id === overId);
    // Dropped on the section itself → end; on an item → that item's slot
    const index = overIdx === -1 ? target.items.filter((i) => i.id !== activeId).length : overIdx;
    moveItem(doc!, activeId, target.key, index);
  }

  const selectFromMap = (itemId: string) => {
    setSelectedId(itemId);
    setMobileView("plan");
    requestAnimationFrame(() =>
      document.getElementById(`item-${itemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Plan panel */}
      <aside
        className={`flex min-h-0 flex-col border-line bg-bg md:w-[440px] md:shrink-0 md:border-r lg:w-[480px] ${
          mobileView === "map" ? "max-md:hidden" : "flex-1 md:flex-none"
        }`}
      >
        <header className="border-b border-line px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4">
          <div className="mb-3 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-1.5 text-sm text-muted hover:text-fg">
              <ArrowLeft className="size-4" /> Trips
            </Link>
            <ThemeToggle theme={theme} toggle={toggleTheme} />
          </div>
          <input
            key={state.meta.title}
            defaultValue={state.meta.title}
            onBlur={(e) => e.target.value.trim() && e.target.value !== state.meta.title && updateMeta(doc, { title: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent font-display text-3xl leading-tight outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <input
              type="date"
              value={state.meta.startDate}
              onChange={(e) => e.target.value && updateMeta(doc, { startDate: e.target.value, ...(e.target.value > state.meta.endDate ? { endDate: e.target.value } : {}) })}
              className="rounded-md bg-surface-2 px-2 py-1 outline-none"
            />
            <span>→</span>
            <input
              type="date"
              value={state.meta.endDate}
              min={state.meta.startDate}
              onChange={(e) => e.target.value && updateMeta(doc, { endDate: e.target.value })}
              className="rounded-md bg-surface-2 px-2 py-1 outline-none"
            />
          </div>
          <div className="mt-3">
            <OfflineMapButton tripId={id!} state={state} />
          </div>
          {focus && (
            <button
              onClick={() => setFocus(null)}
              className="mt-3 flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent"
            >
              <Eye className="size-3.5" /> Showing one section on the map · show all
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 md:pb-10">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            {view.sections.map((s) => (
              <Section
                key={s.key}
                info={s}
                focused={focus === s.key}
                selectedId={selectedId}
                near={near}
                onFocus={() => setFocus((f) => (f === s.key ? null : s.key))}
                onSelect={(itemId) => setSelectedId((cur) => (cur === itemId ? null : itemId))}
                onRename={s.listId ? (t) => renameList(doc, s.listId!, t) : undefined}
                onAddPlace={(p) => {
                  const newId = addItem(doc, s.key, { kind: "place", name: p.name, address: p.address, category: p.category, lat: p.lat, lng: p.lng, osmId: p.osmId });
                  setSelectedId(newId);
                  if (!near) updateMeta(doc, { center: [p.lng, p.lat] });
                }}
                onAddNote={(text) => addItem(doc, s.key, { kind: "note", name: text })}
                onChange={(itemId, patch) => updateItem(doc, itemId, patch)}
                onDelete={(itemId) => removeItem(doc, itemId)}
              />
            ))}
            <DragOverlay>
              {dragging && (
                <div className="rounded-xl border border-accent/60 bg-surface px-4 py-3 text-sm font-semibold shadow-2xl">
                  {dragging.name}
                </div>
              )}
            </DragOverlay>
          </DndContext>

          <button
            onClick={() => {
              const t = prompt("List name", "Food to try");
              if (t?.trim()) addList(doc, t.trim());
            }}
            className="mt-2 ml-2 flex items-center gap-1.5 text-sm text-muted hover:text-fg"
          >
            <Plus className="size-4" /> Add a list
          </button>
        </div>
      </aside>

      {/* Map */}
      <main className={`relative min-h-0 flex-1 ${mobileView === "plan" ? "max-md:hidden" : ""}`}>
        <Suspense fallback={<div className="h-full w-full bg-surface-2" />}>
        <TripMap
          pins={view.pins}
          routes={view.routes}
          selectedId={selectedId}
          onSelect={selectFromMap}
          theme={theme}
          fitKey={`${id}:${focus ?? "all"}`}
          fallbackCenter={near}
        />
        </Suspense>
      </main>

      {/* Mobile plan/map switch */}
      <button
        onClick={() => setMobileView((v) => (v === "plan" ? "map" : "plan"))}
        className="fixed bottom-[max(env(safe-area-inset-bottom),1.25rem)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-fg px-5 py-3 text-sm font-semibold text-bg shadow-2xl md:hidden"
      >
        {mobileView === "plan" ? (
          <>
            <MapIcon className="size-4" /> Map
          </>
        ) : (
          <>
            <List className="size-4" /> Plan
          </>
        )}
      </button>
    </div>
  );
}
