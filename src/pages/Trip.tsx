import { locateBooking } from "../lib/locate";
import { dtf } from "../lib/intl";
import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { DateRangeField } from "../components/DatePicker";
import { Link, Navigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
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
import { ArrowLeft, Camera, Redo2, Undo2, Copy, FolderInput, Trash2, X, Cloud, CloudOff, Eye, ImagePlus, List, Loader2, Map as MapIcon, PanelLeft, Share2 } from "lucide-react";
import { Contents, type Tab } from "../components/Contents";
import { useConverter } from "../lib/fx";
import { budgetLines, lineForItem, totals, travelersOf } from "../lib/budget";
import { bestImage, coverFor, firstPhoto, googlePhotos, sameSubject } from "../lib/images";
import { setShareToken } from "../lib/shareToken";
import { ImagePicker } from "../components/ImagePicker";
import { Photo } from "../components/Photo";
import { PhotoCredit } from "../components/PhotoCredit";
import { RES_ICON, RES_SINGULAR } from "../components/Reservations";
import { distanceKm, GENERIC_PLACE } from "../lib/geocode";
import { autocomplete, findPlaceId, getDetails, GOOGLE_KEY, photoUrl, suggestionPlace } from "../lib/google";
import { searchPlaces } from "../lib/photon";
import { edit } from "../lib/trips";
import { parseISODate } from "../lib/dates";
import { scrollToId } from "../lib/scroll";
import { useUndo } from "../lib/undo";
import { db } from "../lib/db";
import { useSession } from "../lib/api";
import { useSync } from "../lib/sync";
import { useTrip } from "../lib/useTrip";
import { NEXT, THEME_LABEL, useTheme } from "../lib/theme";
import { ThemeIcon } from "../components/ThemeToggle";
import { daysBetween } from "../lib/dates";
import {
  readTrip,
  addItem,
  addList,
  moveItem,
  moveItems,
  copyItems,
  removeItem,
  removeItems,
  saveReservation,
  setReadOnly,
  setItemImage,
  samePlace,
  renameList,
  sectionsFor,
  updateItem,
  updateMeta,
  type Item,
} from "../lib/trips";
import { dayColor, LIST_COLOR } from "../lib/colors";
import { RES_GLYPH } from "../lib/pinArt";
import { flightAirports, flightArc, flightInstant, loadAirports, zoneAt, type Airport, type AirportDb } from "../lib/airports";
import type { Pin, Route } from "../components/TripMap";
// MapLibre is the heaviest dependency; load it after the plan panel is on screen.
// Start fetching the (large) map chunk as soon as the trip page loads, in parallel with the
// trip's own data, instead of only once the page has rendered
const tripMapChunk = import("../components/TripMap");
const TripMap = lazy(() => tripMapChunk.then((m) => ({ default: m.TripMap })));
import { Section, stopTime, type SectionInfo } from "../components/Section";
import { ItemCardDragPreview } from "../components/ItemCard";
import { OfflineMapButton } from "../components/OfflineMapButton";
import { HeroPill } from "../components/HeroPill";
import { AddSection } from "../components/AddSection";
import { ChipScroller } from "../components/ChipScroller";
import { LogoMark } from "../components/Logo";
import { PlacePanel, type PanelMode } from "../components/PlacePanel";
import { SectionPicker, type SectionTarget } from "../components/SectionPicker";
import { ShareDialog } from "../components/ShareDialog";
import { InboxPanel } from "../components/InboxPanel";
import { fetchInbox, type InboxItem } from "../lib/inbox";
import { ReservationForm, ReservationsPanel, dayChips } from "../components/Reservations";
import { BudgetPanel, ExpenseForm } from "../components/Budget";
import { departureTime, legKey, MODES, useLegs, type LegRequest, type TravelMode } from "../lib/routing";
import { MODE_ICON, MODE_LABEL } from "../components/LegChip";
import type { Reservation } from "../lib/trips";
import { askConfirm } from "../components/ConfirmDialog";

const ORPHAN = "orphan";
const formatChip = (d: string) =>
  dtf(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(parseISODate(d));
const LOADING = "loading" as const;

export function TripPage() {
  const { id } = useParams();
  const { doc, state, ready } = useTrip(id);
  const [theme, toggleTheme] = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Multi-select (checkboxes) — separate from the single "open" card
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const lastChecked = useRef<string | null>(null);
  const [panelMode, setPanelModeState] = useState<PanelMode>(() => {
    try {
      return localStorage.getItem("tp-place-panel") === "compact" ? "compact" : "full";
    } catch {
      return "full";
    }
  });
  const setPanelMode = (m: PanelMode) => {
    setPanelModeState(m);
    try {
      localStorage.setItem("tp-place-panel", m);
    } catch {
      /* private mode */
    }
  };
  const [panelInset, setPanelInset] = useState<{ top: number; bottom: number } | null>(null);
  const [costFor, setCostFor] = useState<string | null>(null); // stop whose cost details are open
  const [focus, setFocus] = useState<string | null>(null); // section shown alone on the map
  const [mobileView, setMobileView] = useState<"plan" | "map">("plan");
  const [dragging, setDragging] = useState<Item | null>(null);
  const [sharing, setSharing] = useState(false);
  const [tab, setTab] = useState<Tab>("plan");
  const [contentsHidden, setContentsHidden] = useState(() => {
    try {
      return localStorage.getItem("tp-contents-hidden") === "1";
    } catch {
      return false;
    }
  });
  const [contentsDrawer, setContentsDrawer] = useState(false);
  const [dayFrame, setDayFrame] = useState<{ ids: string[]; nonce: number } | null>(null);
  const [planHidden, setPlanHidden] = useState(() => {
    try {
      return localStorage.getItem("tp-plan-hidden") === "1";
    } catch {
      return false;
    }
  });
  const togglePlan = (hidden: boolean) => {
    setPlanHidden(hidden);
    try {
      localStorage.setItem("tp-plan-hidden", hidden ? "1" : "0");
    } catch {
      /* private mode */
    }
  };
  const headerRef = useRef<HTMLElement>(null);
  const fx = useConverter(state?.meta.currency ?? "CAD");
  const [editingRes, setEditingRes] = useState<Partial<Reservation> | null>(null);
  const [pickingCover, setPickingCover] = useState(false);
  const [photoFill, setPhotoFill] = useState<{ done: number; total: number; added: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Places a Wanderlog import couldn't locate (set by the importer for this session)
  const [unpinned, setUnpinned] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`tp-unpinned-${id}`) ?? "[]");
    } catch {
      return [];
    }
  });
  const [waited, setWaited] = useState(false);

  // Trip index row tells us whether this is our trip or one opened from a share link
  const row = useLiveQuery(() => (id ? db.trips.get(id) : undefined), [id], LOADING);
  const { status: auth } = useSession();
  const shareToken = row !== LOADING ? row?.shareToken : undefined;
  const readOnly = row !== LOADING && row?.role === "view";
  const isOwner = row !== LOADING && !shareToken && !row?.owner && auth === "in";
  // Owner, or an editor on someone else's trip with their own login: sees forwarded bookings
  const canReview = isOwner || (row !== LOADING && !!row?.owner && row.role === "edit" && auth === "in");
  const canSync = row !== LOADING && (!!shareToken || auth === "in");
  setShareToken(shareToken);
  const { status: syncStatus, synced } = useSync(id, doc, { shareToken, enabled: canSync });
  const history = useUndo(doc, readOnly);

  useEffect(() => {
    if (doc) setReadOnly(doc, readOnly);
  }, [doc, readOnly]);

  // Bookings forwarded to trips@ that matched this trip
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  useEffect(() => {
    if (!canReview || !id || !navigator.onLine) return;
    fetchInbox()
      .then((items) => setInbox(items.filter((i) => i.trip_id === id)))
      .catch(() => undefined);
  }, [canReview, id]);
  useEffect(() => {
    setWaited(false);
    const t = setTimeout(() => setWaited(true), 8000);
    return () => clearTimeout(t);
  }, [id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Build sections, their items, colours and map data in one pass
  const hasFlights = !!state?.reservations.some((r) => r.type === "flight");
  const [airportDb, setAirportDb] = useState<AirportDb | null>(null);
  useEffect(() => {
    if (!hasFlights || airportDb) return;
    // After the itinerary has painted: the airport table is big and only adds pins/legs
    const go = () => loadAirports().then(setAirportDb).catch(() => undefined);
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(go, { timeout: 1500 });
    else setTimeout(go, 300);
  }, [hasFlights, airportDb]);
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
      return { key, kind: "day", date, dayNumber: i + 1, color: dayColor(i, date, state.meta.dayColors), items: bySection.get(key)! };
    });
    if (orphans.length)
      sections.push({ key: ORPHAN, kind: "list", title: "Outside trip dates", color: LIST_COLOR, items: orphans, readonlyTitle: true });

    const pins: Pin[] = [];
    // Legs between consecutive pinned stops of each day; routed in useLegs below
    const legs: { section: string; toId: string; color: string; req: LegRequest; label?: string }[] = [];
    const defaultMode: TravelMode = state.meta.travelMode ?? "drive";
    // Where you slept / sleep: lodging bookings with a pin, for legs from and back to the hotel
    const hotels = state.reservations.filter((r) => r.type === "lodging" && r.lat != null && r.lng != null && r.startDate);
    const morningHotel = (d: string) => hotels.find((h) => h.startDate! < d && (h.endDate ?? h.startDate!) >= d);
    const eveningHotel = (d: string) => hotels.find((h) => h.startDate! <= d && (h.endDate ?? h.startDate!) > d);
    // Flights by day, so days start at the arrival airport and end at the departure airport
    type Flight = { r: Reservation; dep: Airport; arr: Airport; arrDate: string };
    const flightsOn: Flight[] = [];
    if (airportDb)
      for (const r of state.reservations) {
        const ends = flightAirports(r, airportDb);
        if (ends && r.startDate && !flightsOn.some((f) => f.r.startDate === r.startDate && f.r.startTime === r.startTime && f.dep.code === ends[0].code))
          flightsOn.push({ r, dep: ends[0], arr: ends[1], arrDate: r.endDate ?? r.startDate });
      }
    const timeOf = (t?: string) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.padStart(5, "0") : undefined);
    const ll = (p: { lat: number; lng: number }): [number, number] => [p.lng, p.lat];
    const pushLeg = (s: SectionInfo, toId: string, label: string, from: [number, number], to: [number, number], at?: string, modeOverride?: TravelMode) => {
      if (Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) < 0.0005) return;
      const mode = modeOverride ?? defaultMode;
      const when = mode === "transit" ? departureTime(s.date!, at, to[0]) : undefined;
      legs.push({ section: s.key, toId, color: s.color, label, req: { key: legKey(mode, from, to, when), mode, from, to, when } });
    };

    for (const s of sections) {
      let n = 0;
      let prev: Item | null = null;
      let first = true;
      // Today's flights. A landing followed by another flight out of the same airport is a
      // connection, not where the day continues; likewise that onward flight isn't "leaving" from a stop.
      const todayOut = s.kind === "day" ? flightsOn.filter((f) => f.r.startDate === s.date) : [];
      const todayIn = s.kind === "day" ? flightsOn.filter((f) => f.arrDate === s.date) : [];
      const connects = (inb: Flight, out: Flight) => inb !== out && out.dep.code === inb.arr.code && (flightInstant(out.r, "dep") ?? 0) >= (flightInstant(inb.r, "arr") ?? 0);
      const landing = todayIn
        .filter((f) => !todayOut.some((o) => connects(f, o)))
        .sort((a, b) => (flightInstant(a.r, "arr") ?? 0) - (flightInstant(b.r, "arr") ?? 0))
        .at(-1);
      const leaving = todayOut
        .filter((o) => !todayIn.some((f) => connects(f, o)))
        .sort((a, b) => (flightInstant(a.r, "dep") ?? 0) - (flightInstant(b.r, "dep") ?? 0))[0];
      const landed = landing ? timeOf(landing.r.endTime) : undefined;
      if (leaving && s.kind === "day") {
        // To the departure airport: from the last stop before take-off, else from where you slept
        const depAt = timeOf(leaving.r.startTime);
        const placed = s.items.filter((i) => i.kind === "place" && i.lat != null);
        const timed = placed.some((i) => stopTime(i));
        // Untimed stops on a day you fly out (and don't also land): the flight comes after them
        const before = timed || leaving === landing ? placed.filter((i) => depAt && stopTime(i) && stopTime(i)! < depAt).at(-1) : placed.at(-1);
        const from = before ? ([before.lng!, before.lat!] as [number, number]) : morningHotel(s.date!) ? ll({ lat: morningHotel(s.date!)!.lat!, lng: morningHotel(s.date!)!.lng! }) : undefined;
        if (from) pushLeg(s, `dep:${leaving.r.title}|${leaving.r.startDate}`, `To ${leaving.dep.name} (${leaving.dep.code})`, from, ll(leaving.dep), depAt ? `${String(Math.max(0, +depAt.slice(0, 2) - 3)).padStart(2, "0")}${depAt.slice(2)}` : undefined, state.meta.hotelLegModes?.[`${s.key}|dep`]);
      }
      for (const it of s.items) {
        if (it.kind !== "place") continue;
        n++;
        if (it.lat == null || it.lng == null) continue;
        if (!focus || s.key === focus) pins.push({ id: it.id, lat: it.lat, lng: it.lng, color: s.color, label: String(n), name: it.name, image: it.image?.thumb, unsplash: it.image?.source === "unsplash" ? { name: it.image.authorName ?? "Unknown", author: it.image.author } : undefined });
        if (s.kind === "day" && first && landing && !(landed && stopTime(it) && stopTime(it)! < landed)) {
          // First stop after landing: from the arrival airport instead of a hotel
          first = false;
          pushLeg(s, it.id, `From ${landing.arr.name} (${landing.arr.code})`, ll(landing.arr), [it.lng, it.lat], landed, it.travelMode);
        }
        if (s.kind === "day" && first) {
          first = false;
          const h = morningHotel(s.date!);
          if (h) {
            const mode = it.travelMode ?? defaultMode;
            const from: [number, number] = [h.lng!, h.lat!];
            const to: [number, number] = [it.lng, it.lat];
            const when = mode === "transit" ? departureTime(s.date!, it.startTime, it.lng) : undefined;
            legs.push({ section: s.key, toId: it.id, color: s.color, label: `From ${h.title}`, req: { key: legKey(mode, from, to, when), mode, from, to, when } });
          }
        }
        if (s.kind === "day" && prev) {
          const mode = it.travelMode ?? defaultMode;
          const from: [number, number] = [prev.lng!, prev.lat!];
          const to: [number, number] = [it.lng, it.lat];
          const when = mode === "transit" ? departureTime(s.date!, prev.endTime ?? prev.startTime ?? it.startTime, it.lng) : undefined;
          legs.push({ section: s.key, toId: it.id, color: s.color, req: { key: legKey(mode, from, to, when), mode, from, to, when } });
        }
        prev = it;
      }
      // Landed with no stops after: straight from the airport to tonight's hotel
      if (s.kind === "day" && landing && (!prev || (landed && stopTime(prev) && stopTime(prev)! < landed))) {
        const h = eveningHotel(s.date!);
        if (h) pushLeg(s, "end", `${landing.arr.code} to ${h.title}`, ll(landing.arr), [h.lng!, h.lat!], landed, state.meta.hotelLegModes?.[s.key]);
      }
      // …and back to tonight's hotel after the last stop
      const night = s.kind === "day" && prev && !(landing && landed && stopTime(prev) && stopTime(prev)! < landed) ? eveningHotel(s.date!) : undefined;
      if (night && prev) {
        const mode = state.meta.hotelLegModes?.[s.key] ?? defaultMode;
        const from: [number, number] = [prev.lng!, prev.lat!];
        const to: [number, number] = [night.lng!, night.lat!];
        if (Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) > 0.0005) {
          const when = mode === "transit" ? departureTime(s.date!, prev.endTime ?? prev.startTime ?? "18:00", to[0]) : undefined;
          legs.push({ section: s.key, toId: "end", color: s.color, label: `To ${night.title}`, req: { key: legKey(mode, from, to, when), mode, from, to, when } });
        }
      }
    }
    // Lodging and restaurant bookings with a location get their own pins
    if (!focus)
      for (const r of state.reservations)
        if (r.lat != null && r.lng != null && r.type !== "flight" && !pins.some((p) => p.id === `res:${r.id}` || (p.id.startsWith("res:") && p.name === r.title)))
          // One pin per booking (several travellers' copies share it), with its type's symbol
          pins.push({ id: `res:${r.id}`, lat: r.lat, lng: r.lng, color: "#e8ece9", label: "", glyph: RES_GLYPH[r.type], name: r.title });
    return { sections, pins, legs };
  }, [state, focus, airportDb]);

  // Airports from flight bookings: a plane pin each, and an arc per flight (never routed like a leg)
  const flights = useMemo(() => {
    const pins: Pin[] = [];
    const arcs: Route[] = [];
    if (!airportDb || !state || !view || focus) return { pins, arcs };
    const seenArc = new Set<string>();
    const dayColorOf = new Map(view.sections.filter((s) => s.kind === "day").map((s) => [s.date!, s.color]));
    for (const r of state.reservations) {
      const ends = flightAirports(r, airportDb);
      if (!ends) continue;
      for (const a of ends)
        if (!pins.some((p) => p.id === `apt:${a.code}`)) pins.push({ id: `apt:${a.code}`, lat: a.lat, lng: a.lng, color: "#e8ece9", label: a.code, glyph: "plane", name: `${a.name} (${a.code})` });
      const key = `${ends[0].code}-${ends[1].code}-${r.startDate ?? ""}`; // one arc per flight, not per passenger
      if (seenArc.has(key)) continue;
      seenArc.add(key);
      arcs.push({ color: dayColorOf.get(r.startDate ?? "") ?? "#9aa59f", coords: flightArc(ends[0], ends[1]), style: "arc" });
    }
    return { pins, arcs };
  }, [airportDb, state, view, focus]);

  // Route every leg (cached per device); draw road/path/transit geometry, straight dashes until known
  const legResults = useLegs(view?.legs.map((l) => l.req) ?? []);
  const routes: Route[] = useMemo(
    () =>
      (view?.legs ?? [])
        .filter((l) => !focus || l.section === focus)
        .map((l) => {
          const r = legResults.get(l.req.key);
          if (typeof r === "object") {
            // Estimates follow the road on the map but stay dashed, so they read as approximate
            const style: Route["style"] = r.mode === "flight" || r.rough ? "dashed" : r.mode === "walk" ? "dotted" : "solid";
            return { color: l.color, coords: r.coords, style };
          }
          return { color: l.color, coords: [l.req.from, l.req.to], style: "dashed" as const };
        }),
    [view, legResults, focus],
  );
  const legsBySection = useMemo(() => {
    const m = new Map<string, Map<string, { mode: TravelMode; state?: ReturnType<typeof legResults.get>; from: [number, number]; to: [number, number]; label?: string }>>();
    for (const l of view?.legs ?? []) {
      if (!m.has(l.section)) m.set(l.section, new Map());
      m.get(l.section)!.set(l.toId, { mode: l.req.mode, state: legResults.get(l.req.key), from: l.req.from, to: l.req.to, label: l.label });
    }
    return m;
  }, [view, legResults]);

  // Suggest a cover photo once, for editable trips that don't have one
  // Hotels (and restaurants) booked without a pin — e.g. an email address the map search didn't
  // know — get located in the background, so legs to/from the hotel and their pins appear.
  const pinTried = useRef(new Set<string>());
  useEffect(() => {
    if (!doc || !state || readOnly || !navigator.onLine) return;
    const todo = state.reservations.filter((r) => (r.type === "lodging" || r.type === "restaurant") && r.lat == null && !pinTried.current.has(r.id));
    if (!todo.length) return;
    todo.forEach((r) => pinTried.current.add(r.id));
    (async () => {
      for (const r of todo) {
        const q = [r.title, r.address].filter(Boolean).join(", ");
        let hit: { lat: number; lng: number; address?: string } | null = null;
        if (GOOGLE_KEY) {
          const [sug] = await autocomplete(q, state.meta.center).catch(() => []);
          if (sug) hit = await suggestionPlace(sug.placeId).catch(() => null);
        }
        if (!hit) hit = (await searchPlaces(q, state.meta.center).catch(() => []))[0] ?? null;
        if (!hit && r.address) hit = (await searchPlaces(r.address, state.meta.center).catch(() => []))[0] ?? null;
        const cur = readTrip(doc).reservations.find((x) => x.id === r.id);
        if (hit && cur && cur.lat == null) saveReservation(doc, { ...cur, lat: hit.lat, lng: hit.lng, address: cur.address || hit.address });
      }
    })();
  }, [doc, state, readOnly]);

  // Stops imported from emails before the careful lookup existed could be pinned on a namesake
  // (a "Nintendo" shop instead of the Nintendo Museum): look each up once more, and move the pin
  // when the better match is somewhere else
  const relocTried = useRef(new Set<string>());
  useEffect(() => {
    if (!doc || !state || readOnly || !navigator.onLine) return;
    const todo = state.items.filter((i) => i.kind === "place" && i.inboxId && !i.located && !i.googlePlaceId && !relocTried.current.has(i.id));
    if (!todo.length) return;
    todo.forEach((i) => relocTried.current.add(i.id));
    (async () => {
      for (const it of todo) {
        const hit = await locateBooking(it.name, it.address, state.meta.center).catch(() => null);
        const cur = readTrip(doc).items.find((x) => x.id === it.id);
        if (!cur) continue;
        const far = hit && (cur.lat == null || cur.lng == null || distanceKm([cur.lng, cur.lat], [hit.lng, hit.lat]) > 0.5);
        updateItem(doc, it.id, far ? { lat: hit!.lat, lng: hit!.lng, googlePlaceId: hit!.googlePlaceId, osmId: hit!.osmId, located: true } : { located: true });
      }
    })();
  }, [doc, state, readOnly]);

  // Photos auto-picked from a Wikipedia article about something else (the district a shop is
  // named after): swap for the place's own Google photo, else a fresh pick, else none
  const photoChecked = useRef(new Set<string>());
  useEffect(() => {
    if (!doc || !state || readOnly || !navigator.onLine) return;
    const bad = state.items.filter((i) => i.image?.source === "wikipedia" && !i.image.manual && i.image.title && !sameSubject(i.name, i.image.title) && !photoChecked.current.has(i.id));
    if (!bad.length) return;
    bad.forEach((i) => photoChecked.current.add(i.id));
    (async () => {
      for (const it of bad) {
        const coords: [number, number] | undefined = it.lat != null && it.lng != null ? [it.lng, it.lat] : undefined;
        const g = it.googlePlaceId ? (await googlePhotos({ placeId: it.googlePlaceId, name: it.name }).catch(() => []))[0] : undefined;
        const next = g ?? (await firstPhoto(it.name, coords, state.meta.destination).catch(() => null));
        const cur = readTrip(doc).items.find((x) => x.id === it.id);
        if (cur?.image?.url === it.image!.url) setItemImage(doc, it.id, next ?? undefined);
      }
    })();
  }, [doc, state, readOnly]);

  // Trains, buses and car rentals: find where they leave from / arrive at, with the time zone,
  // so a cross-country ride sorts by real time (saved on the booking; redone if the text changes)
  const endsTried = useRef(new Set<string>());
  useEffect(() => {
    if (!doc || !state || readOnly || !navigator.onLine) return;
    const jobs: { id: string; side: "fromAt" | "toAt"; q: string }[] = [];
    for (const r of state.reservations) {
      if (r.type !== "train" && r.type !== "car") continue;
      for (const [side, text] of [["fromAt", r.from], ["toAt", r.to]] as const) {
        const q = (text ?? "").trim();
        const key = `${r.id}|${side}|${q}`;
        if (q && r[side]?.q !== q && !endsTried.current.has(key)) (endsTried.current.add(key), jobs.push({ id: r.id, side, q }));
      }
    }
    if (!jobs.length) return;
    (async () => {
      for (const j of jobs) {
        const hit = (await searchPlaces(j.q, state.meta.center).catch(() => []))[0];
        if (!hit) continue;
        const tz = await zoneAt(hit.lat, hit.lng);
        const cur = readTrip(doc).reservations.find((x) => x.id === j.id);
        if (cur && (cur[j.side === "fromAt" ? "from" : "to"] ?? "").trim() === j.q) saveReservation(doc, { ...cur, [j.side]: { q: j.q, lat: hit.lat, lng: hit.lng, tz } });
      }
    })();
  }, [doc, state, readOnly]);

  const coverTried = useRef(false);
  useEffect(() => {
    // Older auto-covers could be a namesake article ("Iceland (supermarket)"); treat those as missing
    const badAuto = (c = state?.meta.cover) => c?.source === "wikipedia" && /\(.+\)$/.test(c.title ?? "");
    if (!doc || !state || readOnly || (state.meta.cover && !badAuto()) || coverTried.current || !navigator.onLine) return;
    const dest = state.meta.destination || state.meta.title;
    if (!dest) return;
    coverTried.current = true;
    coverFor(dest).then((cover) => {
      const cur = readTrip(doc).meta.cover;
      if (cover && (!cur || badAuto(cur))) updateMeta(doc, { cover });
    });
  }, [doc, state, readOnly]);

  async function autofillPhotos() {
    if (!doc || !state) return;
    // Generic stops ("Parking lot", "Rest stop") would just get a random photo
    const todo = state.items.filter((i) => i.kind === "place" && !i.image && !GENERIC_PLACE.test(i.name.trim()));
    setPhotoFill({ done: 0, total: todo.length, added: 0 });
    let added = 0;
    for (const [n, it] of todo.entries()) {
      const img = await bestImage(it.name, it.lat != null && it.lng != null ? [it.lng, it.lat] : undefined).catch(() => null);
      if (img) (added++, updateItem(doc, it.id, { image: img }));
      setPhotoFill({ done: n + 1, total: todo.length, added });
    }
    setTimeout(() => setPhotoFill(null), 2500);
  }

  // Worked out once per change (not per card per render): items grouped by name, then matched
  const copyGroups = useMemo(() => {
    const byName = new Map<string, Item[]>();
    for (const it of state?.items ?? []) {
      if (it.kind !== "place") continue;
      const k = it.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      (byName.get(k) ?? byName.set(k, []).get(k)!).push(it);
    }
    const out = new Map<string, Item[]>();
    for (const it of state?.items ?? []) {
      if (it.kind !== "place") continue;
      const same = (byName.get(it.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")) ?? []).filter((x) => x.id === it.id || samePlace(it, x));
      // Same Google/OSM place under another name
      for (const x of state!.items) if (x.kind === "place" && !same.includes(x) && ((it.googlePlaceId && x.googlePlaceId === it.googlePlaceId) || (it.osmId && x.osmId === it.osmId))) same.push(x);
      out.set(it.id, same);
    }
    return out;
  }, [state?.items]);
  if (row !== LOADING && !shareToken && auth === "out") return <Navigate to="/login" replace />;
  if (!ready || row === LOADING) return <div className="grid h-full place-items-center text-muted">Loading…</div>;
  if (!state || !doc || !view) {
    // A trip from another device (or a share link) arrives over sync on first open
    if (canSync && syncStatus !== "offline" && !synced && !waited)
      return <div className="grid h-full place-items-center text-muted">Syncing trip…</div>;
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="space-y-3">
          <p className="font-display text-2xl">{canSync && syncStatus === "offline" ? "Connect once to download this trip" : "Trip not found"}</p>
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

  // A place can sit on several days/lists (as copies); the day menu ticks and toggles them
  const copiesOf = (itemId: string) => copyGroups.get(itemId) ?? [];
  const sectionsOf = (itemId: string) => [...new Set(copiesOf(itemId).map((x) => x.section))];
  const toggleSection = (itemId: string, key: string) => {
    if (!doc) return;
    const copies = copiesOf(itemId);
    const there = copies.filter((x) => x.section === key);
    if (!there.length) return void copyItems(doc, [itemId], key);
    if (there.length >= copies.length) return; // keep it on at least one day or list
    removeItems(doc, there.map((x) => x.id));
    if (selectedId && there.some((x) => x.id === selectedId)) setSelectedId(copies.find((x) => x.section !== key)!.id);
  };
  const selectFromMap = (itemId: string) => {
    if (itemId.startsWith("res:") || itemId.startsWith("apt:")) {
      setTab("bookings");
      setMobileView("plan");
      return;
    }
    setSelectedId(itemId);
    setMobileView("plan");
    requestAnimationFrame(() =>
      scrollToId(scrollRef.current, `item-${itemId}`, "center"),
    );
  };

  const syncIcon = syncStatus === "online" ? <Cloud /> : syncStatus === "offline" ? <CloudOff /> : <Loader2 className="animate-spin" />;
  const syncLabel = syncStatus === "online" ? "Synced" : syncStatus === "offline" ? "Offline · saved on device" : "Connecting";
  const targets: SectionTarget[] = view.sections
    .filter((s) => s.key !== ORPHAN)
    .map((s) => ({ key: s.key, color: s.color, label: s.kind === "day" ? formatChip(s.date!) : (s.title ?? "List") }));
  const flatIds = view.sections.flatMap((s) => s.items.map((i) => i.id));
  const onCheck = (itemId: string, on: boolean, shift: boolean) => {
    // Shift-click selects the whole run since the last box ticked (computed now, not in the updater)
    const a = lastChecked.current ? flatIds.indexOf(lastChecked.current) : -1;
    const b = flatIds.indexOf(itemId);
    const range = shift && a >= 0 && b >= 0 ? flatIds.slice(Math.min(a, b), Math.max(a, b) + 1) : [itemId];
    setChecked((prev) => {
      const next = new Set(prev);
      for (const x of range) on ? next.add(x) : next.delete(x);
      return next;
    });
    lastChecked.current = itemId;
  };
  const clearChecked = () => (setChecked(new Set()), (lastChecked.current = null));
  const checkedIds = flatIds.filter((x) => checked.has(x));

  // Place panel over the map for the open card
  const openSection = selectedId ? view.sections.find((s) => s.items.some((i) => i.id === selectedId)) : undefined;
  const openItem = openSection?.items.find((i) => i.id === selectedId && i.kind === "place");
  const openPlaces = openSection?.items.filter((i) => i.kind === "place") ?? [];
  const openIdx = openItem ? openPlaces.findIndex((i) => i.id === openItem.id) : -1;
  const goTo = (itemId: string) => {
    setSelectedId(itemId);
    requestAnimationFrame(() => scrollToId(scrollRef.current, `item-${itemId}`, "center"));
  };
  const prevStop = (() => {
    if (!openItem || !openSection || openSection.kind !== "day") return undefined;
    const before = openSection.items.slice(0, openSection.items.indexOf(openItem)).filter((i) => i.lat != null && i.lng != null);
    const b = before.at(-1);
    return b ? { lat: b.lat!, lng: b.lng! } : undefined;
  })();

  const hideContents = (hidden: boolean) => {
    setContentsHidden(hidden);
    try {
      localStorage.setItem("tp-contents-hidden", hidden ? "1" : "0");
    } catch {
      /* private mode */
    }
  };
  const go = (next: Tab, targetId?: string) => {
    setTab(next);
    setMobileView("plan");
    setContentsDrawer(false);
    // let the tab render before scrolling to its section
    setTimeout(() => {
      if (!(targetId && scrollToId(scrollRef.current, targetId))) scrollRef.current?.scrollTo({ top: headerRef.current?.offsetHeight ?? 0, behavior: "smooth" });
    }, 40);
  };
  const spent = totals(budgetLines(state, fx.convert)).total;
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
  const undoBar = readOnly ? null : (
    <div className="flex items-center gap-1 border-b border-line px-4 py-3">
      <Link to="/" title="All trips" className="mr-2 shrink-0">
        <LogoMark size={30} />
      </Link>
      <button onClick={history.undo} disabled={!history.canUndo} title={`Undo (${mod}Z)`} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[15px] font-semibold text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
        <Undo2 className="size-4" /> Undo
      </button>
      <button onClick={history.redo} disabled={!history.canRedo} title={`Redo (${mod}⇧Z)`} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[15px] font-semibold text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
        <Redo2 className="size-4" /> Redo
      </button>
    </div>
  );
  const contentsProps = {
    sections: view.sections.filter((s) => s.key !== ORPHAN),
    reservations: state.reservations,
    tab,
    budgetTotal: spent > 0 ? { amount: spent, currency: state.meta.currency ?? "CAD" } : undefined,
    scrollRef,
    go,
    subtitles: state.meta.subtitles,
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Contents column (wide screens); a drawer below that */}
      <div className={`hidden shrink-0 border-r border-line bg-bg ${planHidden || contentsHidden ? "" : "lg:block"}`}>
        <div className="h-full w-[250px] xl:w-[280px]">
          <Contents {...contentsProps} variant="column" header={undoBar} onHide={() => hideContents(true)} />
        </div>
      </div>
      {contentsDrawer && (
        <div className="fixed inset-0 z-[90] lg:hidden" onClick={() => setContentsDrawer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-line bg-bg shadow-2xl">
            <Contents {...contentsProps} variant="drawer" header={undoBar} onHide={() => setContentsDrawer(false)} />
          </div>
        </div>
      )}
      {/* Plan panel */}
      <aside
        className={`flex min-h-0 flex-col border-line bg-bg md:w-[480px] md:shrink-0 md:border-r lg:w-[540px] xl:w-[620px] 2xl:w-[680px] ${planHidden ? "md:hidden" : ""} ${
          mobileView === "map" ? "max-md:hidden" : "flex-1 md:flex-none"
        }`}
      >
        {/* Contents collapsed (or no room for it): logo, undo/redo and a way back move here */}
        <div className={`shrink-0 items-center gap-1 border-b border-line px-3 py-2 ${contentsHidden ? "hidden md:flex" : "hidden md:flex lg:hidden"}`}>
          <button
            onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? hideContents(false) : setContentsDrawer(true))}
            title="Show contents"
            aria-label="Show contents"
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          >
            <PanelLeft className="size-[18px]" />
          </button>
          <Link to="/" title="All trips" className="mr-1 shrink-0">
            <LogoMark size={26} />
          </Link>
          {!readOnly && (
            <>
              <button onClick={history.undo} disabled={!history.canUndo} title={`Undo (${mod}Z)`} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-semibold text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
                <Undo2 className="size-4" /> Undo
              </button>
              <button onClick={history.redo} disabled={!history.canRedo} title={`Redo (${mod}⇧Z)`} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-semibold text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
                <Redo2 className="size-4" /> Redo
              </button>
            </>
          )}
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-28 md:pb-10">
        <header ref={headerRef} className="relative">
          <div className="relative h-80 overflow-hidden bg-surface-2">
            {state.meta.cover ? (
              <Photo srcs={[state.meta.cover.url, state.meta.cover.thumb]} className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_10%,rgb(95_214_139/.35),transparent_60%),radial-gradient(90%_80%_at_90%_30%,rgb(106_168_255/.3),transparent_60%)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/5 to-black/85" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)] text-white">
              <HeroPill to="/" icon={<ArrowLeft />} label="Trips" />
              <div className="flex items-center gap-1.5">
                {canSync && (
                  <HeroPill
                    icon={syncIcon}
                    label={syncLabel}
                    className={syncStatus === "online" ? "text-accent" : ""}
                    title={syncStatus === "offline" ? "Changes sync when you're back online" : undefined}
                  />
                )}
                {isOwner && <HeroPill icon={<Share2 />} label="Share" onClick={() => setSharing(true)} />}
                <HeroPill icon={<ThemeIcon theme={theme} />} label={THEME_LABEL[NEXT[theme]]} onClick={toggleTheme} />
              </div>
            </div>
            {/* Same bottom inset as the dates row, so the cover button lines up with it */}
            {!readOnly && (
              <div className="absolute right-4 bottom-4 z-10">
                <HeroPill icon={<ImagePlus />} label="Change cover" onClick={() => setPickingCover(true)} />
              </div>
            )}
            {/* Credit hugs the very bottom edge of the photo */}
            {state.meta.cover && (
              <PhotoCredit img={state.meta.cover} className="absolute right-2 bottom-0.5 z-10 max-w-[60%] truncate text-right text-[10px] leading-tight text-white/70 [text-shadow:0_1px_3px_rgb(0_0_0/.7)]" />
            )}
            <div className="absolute inset-x-0 bottom-0 px-5 pr-16 pb-4 text-white">
              {readOnly && (
                <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 text-xs text-white/85">
                  <Eye className="size-3.5" /> View only
                </p>
              )}
              <input
                disabled={readOnly}
                key={state.meta.title}
                defaultValue={state.meta.title}
                onBlur={(e) => e.target.value.trim() && e.target.value !== state.meta.title && updateMeta(doc, { title: e.target.value.trim() })}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="w-full bg-transparent font-display text-[2.25rem] leading-tight text-white outline-none [text-shadow:0_1px_12px_rgb(0_0_0/.5)]"
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[15px] text-white/90">
                <DateRangeField
                  disabled={readOnly}
                  start={state.meta.startDate}
                  end={state.meta.endDate}
                  onChange={(startDate, endDate) => updateMeta(doc, { startDate, endDate })}
                  className="rounded-full bg-black/35 px-3.5 py-1.5 font-semibold backdrop-blur transition-colors hover:bg-black/55 disabled:hover:bg-black/35"
                />
              </div>
            </div>
          </div>
        </header>

        {/* Tabs + day jump chips stay pinned while the plan scrolls */}
        <div className="sticky top-0 z-30 border-b border-line bg-bg/95 px-5 backdrop-blur">
          {checked.size > 0 && (
            <div className="absolute inset-0 z-10 flex items-center gap-1 bg-bg px-4 text-[14px] font-semibold">
              <button onClick={clearChecked} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Clear selection">
                <X className="size-4" />
              </button>
              <span className="mr-auto tabular-nums">{checked.size} selected</span>
              <SectionPicker targets={targets} onPick={(k) => (copyItems(doc, checkedIds, k), clearChecked())} align="right" className="rounded-full px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">
                <Copy className="size-4" /> Copy to
              </SectionPicker>
              <SectionPicker targets={targets} onPick={(k) => (moveItems(doc, checkedIds, k), clearChecked())} align="right" className="rounded-full px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">
                <FolderInput className="size-4" /> Move to
              </SectionPicker>
              <button
                onClick={async () => {
                  if (!(await askConfirm({ title: `Delete ${checked.size} item${checked.size > 1 ? "s" : ""}?`, body: "Undo brings them back." }))) return;
                  removeItems(doc, checkedIds);
                  if (selectedId && checked.has(selectedId)) setSelectedId(null);
                  clearChecked();
                }}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-4" /> Delete
              </button>
            </div>
          )}
          <nav className="flex items-stretch gap-5 pt-2.5 text-[15px] font-semibold max-sm:gap-4">
            <button onClick={() => setContentsDrawer(true)} className="-ml-1 flex items-center pb-2 text-muted hover:text-fg lg:hidden" title="Contents" aria-label="Contents">
              <PanelLeft className="size-4" />
            </button>
            {(
              [
                ["plan", "Itinerary"],
                ["bookings", `Reservations${state.reservations.length ? ` · ${state.reservations.length}` : ""}`],
                ["budget", "Budget"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`shrink-0 border-b-2 pb-1.5 whitespace-nowrap transition-colors ${tab === k ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
              >
                {label}
              </button>
            ))}
            {/* Sits at the end of the tab row instead of taking its own line */}
            <div className="ml-auto flex shrink-0 items-center pb-2">
              <OfflineMapButton tripId={id!} state={state} />
            </div>
          </nav>
          {tab === "plan" && view.sections.some((s) => s.kind === "day") && (
            <ChipScroller className="pt-2 pb-2.5">
              {view.sections
                .filter((s) => s.kind === "day")
                .map((s) => (
                  <button
                    key={s.key}
                    onClick={() => {
                      scrollToId(scrollRef.current, `sec-${s.key}`);
                      const ids = s.items.filter((i) => i.lat != null && i.lng != null).map((i) => i.id);
                      if (ids.length) setDayFrame((f) => ({ ids, nonce: (f?.nonce ?? 0) + 1 }));
                    }}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-fg"
                  >
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    {formatChip(s.date!)}
                  </button>
                ))}
            </ChipScroller>
          )}
          {focus && tab === "plan" && (
            <button onClick={() => setFocus(null)} className="mb-2.5 flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
              <Eye className="size-3.5" /> Showing one day on the map · show all
            </button>
          )}
        </div>
        <div className="px-3">
          {tab === "bookings" && <ReservationsPanel doc={doc} state={state} readOnly={readOnly} tripId={id} canForward={canReview} />}
          {tab === "budget" && <BudgetPanel doc={doc} state={state} readOnly={readOnly} />}
          {tab === "plan" && (<>
          {unpinned.length > 0 && (
            <div className="mx-2 mt-4 rounded-xl border border-line bg-surface-2 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p>
                  <span className="font-semibold">{unpinned.length} place{unpinned.length > 1 ? "s" : ""} without a map pin</span>
                  <span className="text-muted">. Generic names (parking, rest stops) are skipped on purpose. Select one and use Google details, or delete and re-add it.</span>
                </p>
                <button
                  onClick={() => (sessionStorage.removeItem(`tp-unpinned-${id}`), setUnpinned([]))}
                  className="text-muted hover:text-fg"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">{unpinned.join(" · ")}</p>
            </div>
          )}
          {!readOnly && (
            <div className="mx-2 mt-4 rounded-xl border border-line bg-surface p-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Reservations</p>
              <div className="flex flex-wrap gap-1.5">
                {(["flight", "lodging", "car", "train", "restaurant", "other"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setEditingRes({ type: t, startDate: state.meta.startDate })}
                    className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted hover:text-fg"
                  >
                    {RES_ICON[t]} {RES_SINGULAR[t]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mx-2 mt-3 flex items-center gap-2">
            {/* Default way of getting between stops (each leg can override it) */}
            <div className="flex min-w-0 rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label="Getting around">
              {MODES.map((m) => {
                const on = (state.meta.travelMode ?? "drive") === m;
                return (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={on}
                    disabled={readOnly}
                    onClick={() => updateMeta(doc, { travelMode: m })}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors max-[380px]:px-2 ${on ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
                    title="Default for every leg; tap a leg to change just that one"
                  >
                    {MODE_ICON[m]} <span className="max-[380px]:hidden">{MODE_LABEL[m]}</span>
                  </button>
                );
              })}
            </div>
            {!readOnly && (
              <button
                onClick={autofillPhotos}
                disabled={!!photoFill || !navigator.onLine}
                className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-2 text-[13px] font-semibold text-muted hover:border-accent hover:text-fg disabled:opacity-60"
                title="Find a photo for every place without one"
              >
                {photoFill ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                <span className="max-sm:hidden">{photoFill ? `${photoFill.done}/${photoFill.total} · ${photoFill.added} added` : "Auto-fill photos"}</span>
                {photoFill && <span className="sm:hidden tabular-nums">{photoFill.done}/{photoFill.total}</span>}
              </button>
            )}
          </div>
          {canReview && <InboxPanel items={inbox} doc={doc} state={state} onDone={(itemId) => setInbox((xs) => xs.filter((x) => x.id !== itemId))} />}
          <DndContext sensors={readOnly ? [] : sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            {view.sections.map((s, si) => (
              <Fragment key={s.key}>
              {si === 0 && s.kind !== "list" && !readOnly && <AddSection onAdd={(t) => addList(doc, t)} />}
              <Section
                info={s}
                focused={focus === s.key}
                selectedId={selectedId}
                near={near}
                readOnly={readOnly}
                currency={state.meta.currency ?? "CAD"}
                searchContext={state.meta.destination}
                countryCode={state.meta.countryCode}
                chips={s.kind === "day" ? dayChips(state.reservations, s.date!) : []}
                legs={legsBySection.get(s.key)}
                onLegMode={(itemId, m) =>
                  itemId === "end" || itemId.startsWith("dep:")
                    ? updateMeta(doc, { hotelLegModes: { ...(state.meta.hotelLegModes ?? {}), [itemId === "end" ? s.key : `${s.key}|dep`]: m } })
                    : updateItem(doc, itemId, { travelMode: m === (state.meta.travelMode ?? "drive") ? undefined : m })
                }
                onChipClick={(r) => !readOnly && setEditingRes(r)}
                onFocus={() => setFocus((f) => (f === s.key ? null : s.key))}
                onSelect={(itemId) => setSelectedId((cur) => (cur === itemId ? null : itemId))}
                onRename={s.listId ? (t) => renameList(doc, s.listId!, t) : undefined}
                onAddPlace={(p, index) => {
                  const newId = addItem(doc, s.key, { kind: "place", name: p.name, address: p.address || undefined, category: p.category || undefined, lat: p.lat, lng: p.lng, osmId: p.osmId, googlePlaceId: p.googlePlaceId }, undefined, index);
                  setSelectedId(newId);
                  // Already on the trip elsewhere with a photo: reuse that photo
                  const all = readTrip(doc).items;
                  const added = all.find((x) => x.id === newId);
                  const twin = added && all.find((x) => x.id !== newId && x.image && samePlace(added, x));
                  if (twin) updateItem(doc, newId, { image: twin.image });
                  // Picked from Google: copy its details (rating, hours…) and use its first photo
                  if (p.googlePlaceId && GOOGLE_KEY)
                    getDetails(p.googlePlaceId)
                      .then((d) => {
                        const ph = d.photos[0];
                        const image = ph
                          ? { url: photoUrl(ph.name, 1600), thumb: photoUrl(ph.name, 600), source: "google" as const, credit: ph.attributions.map((a) => a.displayName).join(", ") || "Google", link: ph.attributions[0]?.uri, title: d.name }
                          : undefined;
                        const cur = readTrip(doc).items.find((x) => x.id === newId);
                        updateItem(doc, newId, { google: { ...d, fetchedAt: Date.now() }, ...(image && !cur?.image ? { image } : {}) });
                      })
                      .catch(() => undefined);
                  // Give it a photo straight away (Wikipedia match, else Unsplash)
                  if (navigator.onLine && !p.googlePlaceId && !GENERIC_PLACE.test(p.name.trim()))
                    firstPhoto(p.name, [p.lng, p.lat], state.meta.destination)
                      .then((image) => image && !readTrip(doc).items.find((x) => x.id === newId)?.image && updateItem(doc, newId, { image }))
                      .catch(() => undefined);
                  // From a Google Maps link without a Google match yet: link its place ID so Google details work straight away
                  if (p.fromLink && !p.googlePlaceId && GOOGLE_KEY)
                    findPlaceId({ name: p.name, lat: p.lat, lng: p.lng })
                      .then((googlePlaceId) => googlePlaceId && updateItem(doc, newId, { googlePlaceId }))
                      .catch(() => undefined);
                  if (!near) updateMeta(doc, { center: [p.lng, p.lat] });
                }}
                onAddNote={(text, index) => addItem(doc, s.key, { kind: "note", name: text }, undefined, index)}
                onAddChecklist={(index) => addItem(doc, s.key, { kind: "checklist", name: "", checks: [{ id: Math.random().toString(36).slice(2, 10), text: "" }] }, undefined, index)}
                onChange={(itemId, patch) => {
                  // A new photo goes on every stop at the same place
                  if ("image" in patch) {
                    const { image, ...rest } = patch;
                    setItemImage(doc, itemId, image);
                    if (Object.keys(rest).length) updateItem(doc, itemId, rest);
                  } else updateItem(doc, itemId, patch);
                }}
                onDelete={(itemId) => removeItem(doc, itemId)}
                checked={readOnly ? undefined : checked}
                onCheck={readOnly ? undefined : onCheck}
                targets={readOnly ? undefined : targets}
                onMoveTo={readOnly ? undefined : (itemId, k) => moveItems(doc, [itemId], k)}
                sectionsOf={sectionsOf}
                onToggleSection={readOnly ? undefined : toggleSection}
                onCostDetails={readOnly ? undefined : setCostFor}
                subtitle={state.meta.subtitles?.[s.key]}
                onColor={
                  s.kind === "day" && !readOnly
                    ? (c) => {
                        const next = { ...(state.meta.dayColors ?? {}) };
                        if (c) next[s.date!] = c;
                        else delete next[s.date!];
                        updateMeta(doc, { dayColors: next });
                      }
                    : undefined
                }
                onSubtitle={(t) => {
                  const next = { ...(state.meta.subtitles ?? {}) };
                  if (t) next[s.key] = t;
                  else delete next[s.key];
                  updateMeta(doc, { subtitles: next });
                }}
              />
              {s.kind === "list" && view.sections[si + 1]?.kind !== "list" && !readOnly && <AddSection onAdd={(t) => addList(doc, t)} />}
              </Fragment>
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

          
          <p className="mt-6 px-2 text-[10px] text-muted/70">
            Routes: © OpenStreetMap contributors via FOSSGIS OSRM · Transit: <a className="underline" href="https://transitous.org/sources/" target="_blank" rel="noreferrer">Transitous</a>
          </p>
          </>)}
        </div>
        </div>
      </aside>

      {/* Map */}
      <main className={`relative min-h-0 flex-1 ${mobileView === "plan" ? "max-md:hidden" : ""}`}>
        {/* Hide / show the itinerary (desktop) for a full-width map */}
        <button
          onClick={() => togglePlan(!planHidden)}
          className="absolute top-3 left-3 z-30 flex h-9 items-center gap-2 rounded-full border border-line bg-surface/90 px-3 text-[13px] font-semibold text-muted shadow-lg backdrop-blur hover:text-fg max-md:hidden"
          title={planHidden ? "Show itinerary" : "Hide itinerary (full map)"}
          aria-label={planHidden ? "Show itinerary" : "Hide itinerary"}
        >
          <PanelLeft className="size-4" />
          {planHidden && <span>Itinerary</span>}
        </button>
        <Suspense fallback={<div className="h-full w-full bg-surface-2" />}>
        <TripMap
          pins={flights.pins.length ? [...view.pins, ...flights.pins] : view.pins}
          routes={flights.arcs.length ? [...flights.arcs, ...routes] : routes}
          selectedId={selectedId}
          onSelect={selectFromMap}
          theme={theme}
          fitKey={`${id}:${focus ?? "all"}`}
          frame={dayFrame}
          fallbackCenter={near}
          inset={openItem ? (panelInset ?? { top: 0, bottom: 0 }) : null}
        />
        </Suspense>
        {openItem && (
          <PlacePanel
            key={panelMode}
            item={openItem}
            number={openIdx >= 0 ? openIdx + 1 : undefined}
            color={openSection!.color}
            index={Math.max(0, openIdx)}
            total={Math.max(1, openPlaces.length)}
            onPrev={openIdx > 0 ? () => goTo(openPlaces[openIdx - 1].id) : undefined}
            onNext={openIdx >= 0 && openIdx < openPlaces.length - 1 ? () => goTo(openPlaces[openIdx + 1].id) : undefined}
            onClose={() => setSelectedId(null)}
            mode={panelMode}
            onMode={setPanelMode}
            targets={targets}
            onMoveTo={(k) => moveItems(doc, [openItem.id], k)}
            sections={sectionsOf(openItem.id)}
            onToggleSection={readOnly ? undefined : (k) => toggleSection(openItem.id, k)}
            onLink={(googlePlaceId) => updateItem(doc, openItem.id, { googlePlaceId })}
            onSnapshot={(d) => updateItem(doc, openItem.id, { google: { ...d, fetchedAt: Date.now() } })}
            readOnly={readOnly}
            currency={state.meta.currency ?? "CAD"}
            from={prevStop}
            onInset={setPanelInset}
          />
        )}
      </main>

      {costFor &&
        (() => {
          const it = state.items.find((x) => x.id === costFor);
          if (!it || it.cost == null) return null;
          const line = lineForItem(it, state);
          return (
            <ExpenseForm
              doc={doc}
              travelers={travelersOf(state)}
              linked={line}
              initial={{ title: line.title, amount: line.amount, currency: line.currency, category: line.category, paidBy: line.paidBy, splitWith: line.splitWith, date: line.date }}
              onClose={() => setCostFor(null)}
            />
          );
        })()}
      {pickingCover && (
        <ImagePicker
          initialQuery={state.meta.destination || state.meta.title}
          current={state.meta.cover}
          onPick={(cover) => (cover ? updateMeta(doc, { cover }) : edit(doc, () => doc.getMap("meta").delete("cover")))}
          onClose={() => setPickingCover(false)}
        />
      )}
      {editingRes && <ReservationForm doc={doc} state={state} initial={editingRes} onClose={() => setEditingRes(null)} />}
      {sharing && id && <ShareDialog tripId={id} onClose={() => setSharing(false)} />}

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
