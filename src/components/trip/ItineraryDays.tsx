import type { Dispatch, SetStateAction } from "react";
import { DndContext, DragOverlay, closestCorners, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { ItemCardDragPreview } from "../ItemCard";
import { ORPHAN } from "../../lib/itinerary";
import { moveItem, type Item } from "../../lib/trips";
import { ItinerarySection } from "./ItinerarySection";
import type { PlanContext } from "./types";

type Sensors = Parameters<typeof DndContext>[0]["sensors"];

/** The days and lists, drag-and-drop between them, and the card that follows the pointer. */
export function ItineraryDays({
  c,
  sensors,
  dragging,
  setDragging,
}: {
  c: PlanContext;
  sensors: Sensors;
  dragging: Item | null;
  setDragging: Dispatch<SetStateAction<Item | null>>;
}) {
  const { doc, state, view, timed, readOnly } = c;
  const sectionOf = (itemId: string) => view.sections.find((s) => s.items.some((i) => i.id === itemId));

  function onDragStart(e: DragStartEvent) {
    setDragging(state.items.find((i) => i.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || overId === activeId) return;
    const target = view.sections.find((s) => s.key === overId) ?? sectionOf(overId);
    if (!target || target.key === ORPHAN) return;
    const overIdx = target.items.findIndex((i) => i.id === overId);
    // Dropped on the section itself → end; on an item → that item's slot
    const index = overIdx === -1 ? target.items.filter((i) => i.id !== activeId).length : overIdx;
    moveItem(doc, activeId, target.writeKey ?? target.key, index);
  }

  return (
    <DndContext sensors={readOnly ? [] : sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {timed.sections.map((s, si) => (
        <ItinerarySection key={s.key} c={c} s={s} si={si} />
      ))}
      <DragOverlay>
        {dragging && (
          <ItemCardDragPreview
            item={dragging}
            color={sectionOf(dragging.id)?.color ?? "#888"}
            number={(() => {
              const sec = sectionOf(dragging.id);
              const i = sec?.items.filter((x) => x.kind === "place").findIndex((x) => x.id === dragging.id) ?? -1;
              return dragging.kind === "place" && i >= 0 ? i + 1 : undefined;
            })()}
            currency={state.meta.currency ?? "CAD"}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
