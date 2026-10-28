import { AddSection } from "../AddSection";
import { Section } from "../Section";
import { dayChips } from "../Reservations";
import { receiptsLabel } from "./receiptsLabel";
import { addPlace, addSection, changeItem, setLegMode, setCollapsed, setMetaEntry } from "../../lib/itemActions";
import { addItem, moveItems, removeItem, renameList, updateItem } from "../../lib/trips";
import { dayProps } from "./dayProps";
import type { PlanContext, PlanSection } from "./types";

const NO_CHIPS: ReturnType<typeof dayChips> = [];

/** One day or list in the itinerary: the "+" add rows around it and the section itself. */
export function ItinerarySection({ c, s, si }: { c: PlanContext; s: PlanSection; si: number }) {
  const {
    doc,
    state,
    view,
    readOnly,
    focus,
    selectedId,
    near,
    chipsByDay,
    chipStyle,
    checked,
    onCheck,
    targets,
    writeOf,
    sectionsOf,
    toggleSection,
    legsBySection,
    revealAdded,
    setFocus,
    setSelectedId,
    setReceiptFor,
    setEditingRes,
    setCostFor,
  } = c;
  return (
    <>
      {si === 0 && s.kind !== "list" && !readOnly && <AddSection onAdd={(t) => addSection(doc, t)} />}
      <Section
        info={s}
        focused={focus === s.key}
        selectedId={selectedId}
        near={near}
        readOnly={readOnly}
        currency={state.meta.currency ?? "CAD"}
        searchContext={state.meta.destination}
        countryCode={state.meta.countryCode}
        chips={s.kind === "day" ? (chipsByDay.get(s.date!) ?? NO_CHIPS) : NO_CHIPS}
        chipStyle={chipStyle}
        people={state.meta.travelers}
        onReceipt={readOnly ? undefined : (itemId, file) => setReceiptFor({ file, itemId })}
        receiptsLabel={(itemId) => receiptsLabel(state.expenses, itemId)}
        legs={legsBySection.get(s.writeKey ?? s.key)}
        onLegMode={(legId, m) => setLegMode(doc, state, s.key, legId, m)}
        onChipClick={(r) => !readOnly && setEditingRes(r)}
        onFocus={() => setFocus((f) => (f === s.key ? null : s.key))}
        onSelect={(itemId) => setSelectedId((cur) => (cur === itemId ? null : itemId))}
        onRename={s.listId ? (t) => renameList(doc, s.listId!, t) : undefined}
        onAddPlace={(p, index) => {
          const newId = addPlace(doc, s.writeKey ?? s.key, p, index, { destination: state.meta.destination, near });
          // Lists (Places to visit…) collect ideas: add them closed; a day's new stop opens
          if (s.kind === "day") setSelectedId(newId);
          revealAdded(newId);
        }}
        onAddNote={(text, index) => addItem(doc, s.writeKey ?? s.key, { kind: "note", name: text }, undefined, index)}
        onAddChecklist={(index) => addItem(doc, s.writeKey ?? s.key, { kind: "checklist", name: "", checks: [{ id: Math.random().toString(36).slice(2, 10), text: "" }] }, undefined, index)}
        onChange={(itemId, patch) => changeItem(doc, itemId, patch)}
        onDelete={(itemId) => removeItem(doc, itemId)}
        checked={readOnly ? undefined : checked}
        onCheck={readOnly ? undefined : onCheck}
        targets={readOnly ? undefined : targets}
        onMoveTo={readOnly ? undefined : (itemId, k) => moveItems(doc, [itemId], writeOf(k))}
        sectionsOf={sectionsOf}
        onToggleSection={readOnly ? undefined : toggleSection}
        onCostDetails={readOnly ? undefined : setCostFor}
        subtitle={state.meta.subtitles?.[s.key]}
        collapsed={readOnly ? undefined : (state.meta.collapsed ?? []).includes(s.key)}
        onCollapsed={readOnly ? undefined : (on) => setCollapsed(doc, state, s.key, on)}
        onStay={readOnly ? undefined : (itemId, m) => updateItem(doc, itemId, { stay: m })}
        onSubtitle={(t) => setMetaEntry(doc, state, "subtitles", s.key, t)}
        {...dayProps(c, s)}
      />
      {s.kind === "list" && view.sections[si + 1]?.kind !== "list" && !readOnly && <AddSection onAdd={(t) => addSection(doc, t)} />}
    </>
  );
}
