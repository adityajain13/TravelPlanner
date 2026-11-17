// PROTOTYPE (proto/trip-focus): sort his lists into ideas (candidate places) and prep (notes, checklists).
import type { SectionInfo } from "../../Section";

const PREP = /note|pack|shop|todo|to-do|check|document|prep/i;
export const placesIn = (s: SectionInfo) => s.items.filter((i) => i.kind === "place" && !i.waypoint);
/** A list with no places, or named like one (Notes, Packing list, Shopping list) */
export const isPrep = (s: SectionInfo) => s.kind === "list" && (PREP.test(s.title ?? "") || (s.items.length > 0 && placesIn(s).length === 0));
