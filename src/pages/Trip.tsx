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
import { Contents, ContentsThin, type Tab } from "../components/Contents";
import { useConverter } from "../lib/fx";
import { budgetLines, lineForItem, totals, travelersOf } from "../lib/budget";
import { bestImage } from "../lib/images";
import { setShareToken } from "../lib/shareToken";
import { ImagePicker } from "../components/ImagePicker";
import { Photo } from "../components/Photo";
import { PhotoCredit } from "../components/PhotoCredit";
import { RES_ICON, RES_SINGULAR } from "../components/Reservations";
import { GENERIC_PLACE } from "../lib/geocode";
import { addPlace, changeItem, setCollapsed, setLegMode, setMetaEntry } from "../lib/itemActions";
import { edit } from "../lib/trips";
import { parseISODate } from "../lib/dates";
import { scrollToEl, scrollToId } from "../lib/scroll";
import { useUndo } from "../lib/undo";
import { db } from "../lib/db";
import { useSession } from "../lib/api";
import { useSync } from "../lib/sync";
import { useTrip } from "../lib/useTrip";
import { useTheme } from "../lib/theme";
import {
  addItem,
  addList,
  moveItem,
  moveItems,
  copyItems,
  removeItem,
  removeItems,
  setReadOnly,
  renameList,
  updateItem,
  updateMeta,
  type Item,
  forkDay,
  adoptDraft,
  isDraftSection,
  nextDraftName,
} from "../lib/trips";
import { copiesByItem } from "../lib/trips";
import { daysBetween } from "../lib/dates";
import { DayCompareHost } from "../components/DayCompareHost";
import { TravelView } from "../components/TravelView";
import { ReceiptFlow } from "../components/ReceiptFlow";
import { formatMoney } from "../lib/fx";
import { useIsPhone, useTravelMode } from "../lib/travelMode";
import { DEFAULT_DAY_START } from "../lib/autoTime";
// MapLibre is the heaviest dependency; load it after the plan panel is on screen.
// Start fetching the (large) map chunk as soon as the trip page loads, in parallel with the
// trip's own data, instead of only once the page has rendered
const tripMapChunk = import("../components/TripMap");
const TripMap = lazy(() => tripMapChunk.then((m) => ({ default: m.TripMap })));
import { Section } from "../components/Section";
import { ItemCardDragPreview } from "../components/ItemCard";
import { OfflineMapButton } from "../components/OfflineMapButton";
import { HeroPill } from "../components/HeroPill";
import { AddSection } from "../components/AddSection";
import { ChipScroller } from "../components/ChipScroller";
import { TripOverview } from "../components/TripOverview";
import { SettingsDialog } from "../components/SettingsDialog";
import { useSettings } from "../lib/settings";
import { Settings as SettingsIcon } from "lucide-react";
import { LogoMark } from "../components/Logo";
import { PlacePanel, type PanelMode } from "../components/PlacePanel";
import { SectionPicker, type SectionTarget } from "../components/SectionPicker";
import { ShareDialog } from "../components/ShareDialog";
import { InboxPanel } from "../components/InboxPanel";
import { fetchInbox, type InboxItem } from "../lib/inbox";
import { ReservationForm, ReservationsPanel, dayChips } from "../components/Reservations";
import { BudgetPanel, ExpenseForm } from "../components/Budget";
import { MODES } from "../lib/routing";
import { ORPHAN, planMapData } from "../lib/itinerary";
import { useItinerary } from "../hooks/useItinerary";
import { useTripUpkeep } from "../hooks/useTripUpkeep";
import { MODE_ICON, MODE_LABEL } from "../components/LegChip";
import type { Reservation } from "../lib/trips";
import { askConfirm } from "../components/ConfirmDialog";

const formatChip = (d: string) =>
  dtf(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(parseISODate(d));
const LOADING = "loading" as const;

const NO_CHIPS: ReturnType<typeof dayChips> = [];

export function TripPage() {
  const { id } = useParams();
  const { doc, state, ready } = useTrip(id);
  const [theme] = useTheme();
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
  // Day drafts: which draft each day shows (by date; absent = the day's plan), kept per device
  const [dayDraft, setDayDraftState] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`tp-drafts-${id}`) ?? "{}");
    } catch {
      return {};
    }
  });
  const setDayDraft = (date: string, draft: string | undefined) =>
    setDayDraftState((cur) => {
      const next = { ...cur };
      if (draft) next[date] = draft;
      else delete next[date];
      try {
        localStorage.setItem(`tp-drafts-${id}`, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  const [compareDay, setCompareDay] = useState<string | null>(null);
  const [receiptFor, setReceiptFor] = useState<{ file: File; itemId: string } | null>(null);
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
  const [showSettings, setShowSettings] = useState(false);
  const [mapPicked, setMapPicked] = useState<string | null>(null);
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
  // Settings live in the trip, per account; view-only or signed out: this device
  const { email: myEmail } = useSession();
  const settingsScope = useMemo(() => (doc && myEmail && !readOnly ? { doc, email: myEmail.toLowerCase() } : null), [doc, myEmail, readOnly]);
  const [settings] = useSettings(settingsScope);
  // Travel mode (phones): the light day view; background lookups (photos, pins, notes) pause
  const [travelOn, setTravelOn] = useTravelMode();
  const isPhone = useIsPhone();
  const lite = travelOn && isPhone;

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

  // Settings → Stop times: Auto. Each day's stops get times worked out from the day's start, how
  // long each stop takes and the routes between; the cards show those instead of typed times.
  const autoOn = settings.timing === "auto";
  const { view, flights, legResults, routes, legsBySection, timed } = useItinerary(state, { focus, dayDraft, autoOn });

  // Background fix-ups (pins, photos, notes, old imports)
  useTripUpkeep({ doc, state, readOnly, lite, auth });

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
  const copyGroups = useMemo(() => copiesByItem(state?.items ?? []), [state?.items]);
  // Each day's booking cards, worked out once per change to the bookings (not per day per render)
  const chipsByDay = useMemo(() => {
    const m = new Map<string, ReturnType<typeof dayChips>>();
    if (state) for (const d of daysBetween(state.meta.startDate, state.meta.endDate)) m.set(d, dayChips(state.reservations, d));
    return m;
  }, [state?.reservations, state?.meta.startDate, state?.meta.endDate]);
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
    moveItem(doc!, activeId, target.writeKey ?? target.key, index);
  }

  // A day showing a draft: edits and moves into "that day" land in the draft
  const writeOf = (key: string) => view.sections.find((s) => s.key === key)?.writeKey ?? key;
  const shownKey = (section: string) => (isDraftSection(section) ? (view.sections.find((s) => s.writeKey === section)?.key ?? section) : section);
  // A place can sit on several days/lists (as copies); the day menu ticks and toggles them
  const copiesOf = (itemId: string) => copyGroups.get(itemId) ?? [];
  const sectionsOf = (itemId: string) => [...new Set(copiesOf(itemId).map((x) => shownKey(x.section)))];
  const toggleSection = (itemId: string, shown: string) => {
    if (!doc) return;
    const key = writeOf(shown);
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
    setMapPicked(itemId);
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
  const openSection = selectedId ? timed.sections.find((s) => s.items.some((i) => i.id === selectedId)) : undefined;
  const openItem = openSection?.items.find((i) => i.id === selectedId && i.kind === "place");
  const openPlaces = openSection?.items.filter((i) => i.kind === "place") ?? [];
  const openIdx = openItem ? openPlaces.findIndex((i) => i.id === openItem.id) : -1;
  // After adding a stop: scroll so the leg into the stop above it sits at the top, i.e.
  // route → previous stop → route → new stop (the add box stays just below)
  const revealAdded = (newId: string) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const wrap = document.getElementById(`item-${newId}`)?.closest<HTMLElement>("[data-item-wrap]");
        const prev = wrap?.previousElementSibling as HTMLElement | null;
        const target = prev?.matches("[data-item-wrap]") ? prev : wrap;
        if (target && scrollRef.current) scrollToEl(scrollRef.current, target, "start");
      }),
    );
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
  // "¥2,340 · 2 receipts" on a stop's card
  const receiptsLabel = (itemId: string) => {
    const rs = state.expenses.filter((e) => e.kind === "receipt" && e.itemId === itemId);
    if (!rs.length) return undefined;
    const cur = rs[0].currency;
    const sum = rs.every((e) => e.currency === cur) ? formatMoney(rs.reduce((a, e) => a + e.amount, 0), cur) : `${rs.length} receipts`;
    return rs.length > 1 && !sum.endsWith("receipts") ? `${sum} · ${rs.length} receipts` : sum;
  };
  // ?today=2026-12-03T10:00 previews the overview as on that day (for trying the during/after views)
  const overviewNow = (() => {
    const t = new URLSearchParams(location.search).get("today");
    const d = t ? new Date(t.length <= 10 ? `${t}T12:00` : t) : null;
    return d && !Number.isNaN(d.getTime()) ? d : undefined;
  })();
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
  const thinBar = (
    <div className="flex w-full flex-col items-center gap-1 border-b border-line py-3">
      <Link to="/" title="All trips" className="mb-1">
        <LogoMark size={30} />
      </Link>
      {!readOnly && (
        <div className="flex gap-0.5">
          <button onClick={history.undo} disabled={!history.canUndo} title={`Undo (${mod}Z)`} aria-label="Undo" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
            <Undo2 className="size-4" />
          </button>
          <button onClick={history.redo} disabled={!history.canRedo} title={`Redo (${mod}⇧Z)`} aria-label="Redo" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
            <Redo2 className="size-4" />
          </button>
        </div>
      )}
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

  if (lite)
    return (
      <>
        <TravelView
          title={state.meta.title}
          days={timed.sections.filter((s) => s.kind === "day")}
          legsFor={(d) => legsBySection.get(d.writeKey ?? d.key)}
          reservations={state.reservations}
          theme={theme}
          onExit={() => setTravelOn(false)}
          onToggleCheck={readOnly ? undefined : (itemId, checkId) => {
            const it = state.items.find((x) => x.id === itemId);
            if (it) updateItem(doc, itemId, { checks: (it.checks ?? []).map((c) => (c.id === checkId ? { ...c, done: !c.done } : c)) });
          }}
          mapFor={(d) => {
            const ver = d.writeKey ?? d.key;
            const m = planMapData(view, flights.pins, legResults, ver, d.items, d.color, { includeGhost: false, numberedPins: false });
            return { pins: m.pins, routes: m.routes };
          }}
        />
        {showSettings && <SettingsDialog scope={readOnly ? null : settingsScope} onClose={() => setShowSettings(false)} />}
      </>
    );

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Contents column (wide screens); a drawer below that */}
      <div className={`hidden shrink-0 border-r border-line bg-bg ${planHidden || contentsHidden ? "" : "lg:block"}`}>
        {settings.contentsWidth === "thin" ? (
          <ContentsThin {...contentsProps} header={thinBar} onHide={() => hideContents(true)} />
        ) : (
          <div className="h-full w-[250px] xl:w-[280px]">
            <Contents {...contentsProps} variant="column" header={undoBar} onHide={() => hideContents(true)} />
          </div>
        )}
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
                <HeroPill icon={<SettingsIcon />} label="Settings" onClick={() => setShowSettings(true)} />
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
              <SectionPicker targets={targets} onPick={(k) => (copyItems(doc, checkedIds, writeOf(k)), clearChecked())} align="right" className="rounded-full px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">
                <Copy className="size-4" /> Copy to
              </SectionPicker>
              <SectionPicker targets={targets} onPick={(k) => (moveItems(doc, checkedIds, writeOf(k)), clearChecked())} align="right" className="rounded-full px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">
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
          <TripOverview
            state={state}
            sections={view.sections.filter((s) => s.key !== ORPHAN)}
            spent={spent}
            legs={legsBySection}
            readOnly={readOnly}
            now={overviewNow}
            onSelect={(itemId) => (setSelectedId(itemId), requestAnimationFrame(() => scrollToId(scrollRef.current, `item-${itemId}`, "center")))}
            onOpenRes={(r) => !readOnly && setEditingRes(r)}
            onGo={(t) => (typeof t === "string" ? go(t) : go("plan", `sec-${t.section}`))}
          />
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
            {timed.sections.map((s, si) => (
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
                chips={s.kind === "day" ? (chipsByDay.get(s.date!) ?? NO_CHIPS) : NO_CHIPS}
                chipStyle={settings.bookingStyle}
                people={state.meta.travelers}
                onReceipt={readOnly ? undefined : (itemId, file) => setReceiptFor({ file, itemId })}
                receiptsLabel={receiptsLabel}
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
                onColor={
                  s.kind === "day" && !readOnly
                    ? (c) => setMetaEntry(doc, state, "dayColors", s.date!, c)
                    : undefined
                }
                onFork={
                  s.kind === "day" && !readOnly
                    ? () => {
                        const d = forkDay(doc, s.date!, s.writeKey ?? s.key, nextDraftName(state.drafts, s.date!));
                        setDayDraft(s.date!, d);
                      }
                    : undefined
                }
                onVersion={(d) => setDayDraft(s.date!, d)}
                onCompare={() => setCompareDay(s.date!)}
                onUseDraft={
                  s.draftId && !readOnly
                    ? async () => {
                        const name = s.versions?.find((v) => v.id === s.draftId)?.name ?? "this draft";
                        if (
                          await askConfirm({
                            title: `Make “${name}” the day's plan?`,
                            body: `“${s.versions?.[0]?.name}” moves to the drafts, so you can swap back any time.`,
                            confirmLabel: "Use this plan",
                            danger: false,
                          })
                        ) {
                          adoptDraft(doc, s.draftId!);
                          setDayDraft(s.date!, undefined);
                        }
                      }
                    : undefined
                }
                collapsed={readOnly ? undefined : (state.meta.collapsed ?? []).includes(s.key)}
                onCollapsed={
                  readOnly
                    ? undefined
                    : (c) => setCollapsed(doc, state, s.key, c)
                }
                autoTimes={autoOn && s.kind === "day" ? timed.info : undefined}
                onStay={readOnly ? undefined : (itemId, m) => updateItem(doc, itemId, { stay: m })}
                dayStart={
                  autoOn && s.kind === "day"
                    ? {
                        value: state.meta.dayStarts?.[s.date!] ?? DEFAULT_DAY_START,
                        isDefault: !state.meta.dayStarts?.[s.date!],
                        landed: view.landings.get(s.writeKey ?? s.key),
                        onChange: readOnly
                          ? undefined
                          : (t) => setMetaEntry(doc, state, "dayStarts", s.date!, t),
                      }
                    : undefined
                }
                onSubtitle={(t) => setMetaEntry(doc, state, "subtitles", s.key, t)}
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
          routes={flights.arcs.length && settings.flightPaths !== "hide" ? [...flights.arcs, ...routes] : routes}
          selectedId={selectedId}
          onSelect={selectFromMap}
          theme={theme}
          fitKey={`${id}:${focus ?? "all"}`}
          frameAll={!!focus}
          frame={dayFrame}
          fallbackCenter={near}
          inset={openItem ? (panelInset ?? { top: 0, bottom: 0 }) : null}
          focusColor={openSection?.color}
          // Settings → "Just open the card": a pin clicked on the map doesn't move the map
          holdView={settings.pinClick === "card" && !!selectedId && mapPicked === selectedId}
        />
        </Suspense>
        {receiptFor && <ReceiptFlow doc={doc} state={state} file={receiptFor.file} stop={state.items.find((i) => i.id === receiptFor.itemId)} onClose={() => setReceiptFor(null)} />}
        {compareDay && (
          <DayCompareHost
            doc={doc}
            state={state}
            view={view}
            flightPins={flights.pins}
            legResults={legResults}
            legsBySection={legsBySection}
            date={compareDay}
            theme={theme}
            convert={fx.convert}
            readOnly={readOnly}
            autoOn={autoOn}
            onShowPlan={(d) => {
              const dayKey = view.sections.find((x) => x.kind === "day" && x.date === compareDay)?.key;
              setDayDraft(compareDay, d);
              setCompareDay(null);
              setTab("plan");
              setTimeout(() => scrollToId(scrollRef.current, `sec-${dayKey}`), 60);
            }}
            onDraftShown={(d) => setDayDraft(compareDay, d)}
            onClose={() => setCompareDay(null)}
          />
        )}
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
            onMoveTo={(k) => moveItems(doc, [openItem.id], writeOf(k))}
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
      {showSettings && <SettingsDialog scope={readOnly ? null : settingsScope} onClose={() => setShowSettings(false)} />}

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
