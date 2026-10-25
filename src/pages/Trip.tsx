import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
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
import { ArrowLeft, Camera, Cloud, CloudOff, Moon, Sun, Eye, ImagePlus, List, Loader2, Map as MapIcon, PanelLeft, Plus, Share2 } from "lucide-react";
import { Contents, ContentsRail, type Tab } from "../components/Contents";
import { useConverter } from "../lib/fx";
import { budgetLines, totals } from "../lib/budget";
import { bestImage, coverFor } from "../lib/images";
import { setShareToken } from "../lib/shareToken";
import { ImagePicker } from "../components/ImagePicker";
import { Photo } from "../components/Photo";
import { PhotoCredit } from "../components/PhotoCredit";
import { RES_ICON, RES_SINGULAR } from "../components/Reservations";
import { GENERIC_PLACE } from "../lib/geocode";
import { edit } from "../lib/trips";
import { parseISODate } from "../lib/dates";
import { scrollToId } from "../lib/scroll";
import { db } from "../lib/db";
import { useSession } from "../lib/api";
import { useSync } from "../lib/sync";
import { useTrip } from "../lib/useTrip";
import { useTheme } from "../lib/theme";
import { daysBetween } from "../lib/dates";
import {
  readTrip,
  addItem,
  addList,
  moveItem,
  removeItem,
  setReadOnly,
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
import { OfflineMapButton } from "../components/OfflineMapButton";
import { HeroPill } from "../components/HeroPill";
import { ShareDialog } from "../components/ShareDialog";
import { InboxPanel } from "../components/InboxPanel";
import { fetchInbox, type InboxItem } from "../lib/inbox";
import { ReservationForm, ReservationsPanel, dayChips } from "../components/Reservations";
import { BudgetPanel } from "../components/Budget";
import { departureTime, legKey, MODES, useLegs, type LegRequest, type TravelMode } from "../lib/routing";
import { MODE_ICON, MODE_LABEL } from "../components/LegChip";
import type { Reservation } from "../lib/trips";

const ORPHAN = "orphan";
const formatChip = (d: string) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(parseISODate(d));
const LOADING = "loading" as const;

export function TripPage() {
  const { id } = useParams();
  const { doc, state, ready } = useTrip(id);
  const [theme, toggleTheme] = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const isOwner = row !== LOADING && !shareToken && auth === "in";
  const canSync = row !== LOADING && (!!shareToken || auth === "in");
  setShareToken(shareToken);
  const { status: syncStatus, synced } = useSync(id, doc, { shareToken, enabled: canSync });

  useEffect(() => {
    if (doc) setReadOnly(doc, readOnly);
  }, [doc, readOnly]);

  // Bookings forwarded to trips@ that matched this trip
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  useEffect(() => {
    if (!isOwner || !id || !navigator.onLine) return;
    fetchInbox()
      .then((items) => setInbox(items.filter((i) => i.trip_id === id)))
      .catch(() => undefined);
  }, [isOwner, id]);
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
    // Legs between consecutive pinned stops of each day; routed in useLegs below
    const legs: { section: string; toId: string; color: string; req: LegRequest }[] = [];
    const defaultMode: TravelMode = state.meta.travelMode ?? "drive";
    for (const s of sections) {
      let n = 0;
      let prev: Item | null = null;
      for (const it of s.items) {
        if (it.kind !== "place") continue;
        n++;
        if (it.lat == null || it.lng == null) continue;
        if (!focus || s.key === focus) pins.push({ id: it.id, lat: it.lat, lng: it.lng, color: s.color, label: String(n), name: it.name, image: it.image?.thumb, unsplash: it.image?.source === "unsplash" ? { name: it.image.authorName ?? "Unknown", author: it.image.author } : undefined });
        if (s.kind === "day" && prev) {
          const mode = it.travelMode ?? defaultMode;
          const from: [number, number] = [prev.lng!, prev.lat!];
          const to: [number, number] = [it.lng, it.lat];
          const when = mode === "transit" ? departureTime(s.date!, prev.endTime ?? prev.startTime ?? it.startTime, it.lng) : undefined;
          legs.push({ section: s.key, toId: it.id, color: s.color, req: { key: legKey(mode, from, to, when), mode, from, to, when } });
        }
        prev = it;
      }
    }
    // Lodging and restaurant bookings with a location get their own pins
    if (!focus)
      for (const r of state.reservations)
        if (r.lat != null && r.lng != null && (r.type === "lodging" || r.type === "restaurant" || r.type === "other"))
          pins.push({ id: `res:${r.id}`, lat: r.lat, lng: r.lng, color: "#e8ece9", label: r.type === "lodging" ? "H" : r.type === "restaurant" ? "R" : "•", name: r.title });
    return { sections, pins, legs };
  }, [state, focus]);

  // Route every leg (cached per device); draw road/path/transit geometry, straight dashes until known
  const legResults = useLegs(view?.legs.map((l) => l.req) ?? []);
  const routes: Route[] = useMemo(
    () =>
      (view?.legs ?? [])
        .filter((l) => !focus || l.section === focus)
        .map((l) => {
          const r = legResults.get(l.req.key);
          if (typeof r === "object") {
            const style: Route["style"] = r.mode === "flight" ? "dashed" : r.mode === "walk" ? "dotted" : "solid";
            return { color: l.color, coords: r.coords, style };
          }
          return { color: l.color, coords: [l.req.from, l.req.to], style: "dashed" as const };
        }),
    [view, legResults, focus],
  );
  const legsBySection = useMemo(() => {
    const m = new Map<string, Map<string, { mode: TravelMode; state?: ReturnType<typeof legResults.get>; from: [number, number]; to: [number, number] }>>();
    for (const l of view?.legs ?? []) {
      if (!m.has(l.section)) m.set(l.section, new Map());
      m.get(l.section)!.set(l.toId, { mode: l.req.mode, state: legResults.get(l.req.key), from: l.req.from, to: l.req.to });
    }
    return m;
  }, [view, legResults]);

  // Suggest a cover photo once, for editable trips that don't have one
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

  const selectFromMap = (itemId: string) => {
    if (itemId.startsWith("res:")) {
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
  const contentsProps = {
    sections: view.sections.filter((s) => s.key !== ORPHAN),
    reservations: state.reservations,
    tab,
    budgetTotal: spent > 0 ? { amount: spent, currency: state.meta.currency ?? "CAD" } : undefined,
    scrollRef,
    go,
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Contents column (wide screens); a drawer below that */}
      <div className="hidden shrink-0 border-r border-line bg-bg lg:block">
        {contentsHidden ? (
          <ContentsRail onShow={() => hideContents(false)} />
        ) : (
          <div className="h-full w-[220px] xl:w-[240px]">
            <Contents {...contentsProps} variant="column" onHide={() => hideContents(true)} />
          </div>
        )}
      </div>
      {contentsDrawer && (
        <div className="fixed inset-0 z-[90] lg:hidden" onClick={() => setContentsDrawer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-line bg-bg shadow-2xl">
            <Contents {...contentsProps} variant="drawer" onHide={() => setContentsDrawer(false)} />
          </div>
        </div>
      )}
      {/* Plan panel */}
      <aside
        className={`flex min-h-0 flex-col border-line bg-bg md:w-[480px] md:shrink-0 md:border-r lg:w-[540px] xl:w-[620px] 2xl:w-[680px] ${
          mobileView === "map" ? "max-md:hidden" : "flex-1 md:flex-none"
        }`}
      >
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-28 md:pb-10">
        <header ref={headerRef} className="relative">
          <div className="relative h-52 overflow-hidden bg-surface-2 md:h-60">
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
                <HeroPill icon={theme === "dark" ? <Sun /> : <Moon />} label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggleTheme} />
              </div>
            </div>
            <div className="absolute right-4 bottom-3 z-10 flex max-w-[45%] flex-col items-end gap-1.5">
              {!readOnly && <HeroPill icon={<ImagePlus />} label="Change cover" onClick={() => setPickingCover(true)} />}
              {state.meta.cover && (
                <PhotoCredit img={state.meta.cover} className="max-w-full truncate text-right text-[10.5px] text-white/75 [text-shadow:0_1px_4px_rgb(0_0_0/.6)]" />
              )}
            </div>
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
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-white/90 [color-scheme:dark]">
                <input
                  disabled={readOnly}
                  type="date"
                  value={state.meta.startDate}
                  onChange={(e) => e.target.value && updateMeta(doc, { startDate: e.target.value, ...(e.target.value > state.meta.endDate ? { endDate: e.target.value } : {}) })}
                  className="rounded-md bg-white/10 px-2 py-1 outline-none backdrop-blur"
                />
                <span>→</span>
                <input
                  disabled={readOnly}
                  type="date"
                  value={state.meta.endDate}
                  min={state.meta.startDate}
                  onChange={(e) => e.target.value && updateMeta(doc, { endDate: e.target.value })}
                  className="rounded-md bg-white/10 px-2 py-1 outline-none backdrop-blur"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
            <OfflineMapButton tripId={id!} state={state} />
          </div>
        </header>

        {/* Tabs + day jump chips stay pinned while the plan scrolls */}
        <div className="sticky top-0 z-30 border-b border-line bg-bg/95 px-5 backdrop-blur">
          <nav className="flex items-end gap-5 pt-3 text-[15px] font-semibold">
            <button onClick={() => setContentsDrawer(true)} className="-ml-1 pb-2.5 text-muted hover:text-fg lg:hidden" title="Contents" aria-label="Contents">
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
                className={`border-b-2 pb-2.5 transition-colors ${tab === k ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "plan" && view.sections.some((s) => s.kind === "day") && (
            <div className="flex gap-1.5 overflow-x-auto pt-1 pb-2.5 [scrollbar-width:none]">
              {view.sections
                .filter((s) => s.kind === "day")
                .map((s) => (
                  <button
                    key={s.key}
                    onClick={() => scrollToId(scrollRef.current, `sec-${s.key}`)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-fg"
                  >
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    {formatChip(s.date!)}
                  </button>
                ))}
            </div>
          )}
          {focus && tab === "plan" && (
            <button onClick={() => setFocus(null)} className="mb-2.5 flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
              <Eye className="size-3.5" /> Showing one day on the map · show all
            </button>
          )}
        </div>
        <div className="px-3">
          {tab === "bookings" && <ReservationsPanel doc={doc} state={state} readOnly={readOnly} />}
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
          <div className="mx-2 mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {!readOnly && (
              <button
                onClick={autofillPhotos}
                disabled={!!photoFill || !navigator.onLine}
                className="mr-1 flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 hover:border-accent hover:text-fg disabled:opacity-60"
                title="Find a photo for every place without one (Wikipedia matches only)"
              >
                {photoFill ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                {photoFill ? `Photos ${photoFill.done}/${photoFill.total} · ${photoFill.added} added` : "Auto-fill photos"}
              </button>
            )}
            <span>Getting around</span>
            {MODES.map((m) => (
              <button
                key={m}
                disabled={readOnly}
                onClick={() => updateMeta(doc, { travelMode: m })}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${(state.meta.travelMode ?? "drive") === m ? "bg-surface-2 text-fg" : "hover:text-fg"}`}
                title={`Default for every leg; tap a leg to change just that one`}
              >
                {MODE_ICON[m]} {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          {isOwner && <InboxPanel items={inbox} doc={doc} state={state} onDone={(itemId) => setInbox((xs) => xs.filter((x) => x.id !== itemId))} />}
          <DndContext sensors={readOnly ? [] : sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            {view.sections.map((s) => (
              <Section
                key={s.key}
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
                onLegMode={(itemId, m) => updateItem(doc, itemId, { travelMode: m === (state.meta.travelMode ?? "drive") ? undefined : m })}
                onChipClick={(r) => !readOnly && setEditingRes(r)}
                onFocus={() => setFocus((f) => (f === s.key ? null : s.key))}
                onSelect={(itemId) => setSelectedId((cur) => (cur === itemId ? null : itemId))}
                onRename={s.listId ? (t) => renameList(doc, s.listId!, t) : undefined}
                onAddPlace={(p, index) => {
                  const newId = addItem(doc, s.key, { kind: "place", name: p.name, address: p.address, category: p.category, lat: p.lat, lng: p.lng, osmId: p.osmId }, undefined, index);
                  setSelectedId(newId);
                  if (!near) updateMeta(doc, { center: [p.lng, p.lat] });
                }}
                onAddNote={(text, index) => addItem(doc, s.key, { kind: "note", name: text }, undefined, index)}
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

          {!readOnly && <button
            onClick={() => {
              const t = prompt("List name", "Food to try");
              if (t?.trim()) addList(doc, t.trim());
            }}
            className="mt-2 ml-2 flex items-center gap-1.5 text-sm text-muted hover:text-fg"
          >
            <Plus className="size-4" /> Add a list
          </button>}
          <p className="mt-6 px-2 text-[10px] text-muted/70">
            Routes: © OpenStreetMap contributors via FOSSGIS OSRM · Transit: <a className="underline" href="https://transitous.org/sources/" target="_blank" rel="noreferrer">Transitous</a>
          </p>
          </>)}
        </div>
        </div>
      </aside>

      {/* Map */}
      <main className={`relative min-h-0 flex-1 ${mobileView === "plan" ? "max-md:hidden" : ""}`}>
        <Suspense fallback={<div className="h-full w-full bg-surface-2" />}>
        <TripMap
          pins={view.pins}
          routes={routes}
          selectedId={selectedId}
          onSelect={selectFromMap}
          theme={theme}
          fitKey={`${id}:${focus ?? "all"}`}
          fallbackCenter={near}
        />
        </Suspense>
      </main>

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
