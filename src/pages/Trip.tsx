import { Navigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConverter } from "../lib/fx";
import { budgetLines, totals } from "../lib/budget";
import { setShareToken } from "../lib/shareToken";
import { copiesByItem, copyItems, isDraftSection, removeItems, setReadOnly, type Item, type Reservation } from "../lib/trips";
import { setHistoryAuthor } from "../lib/history";
import { daysBetween } from "../lib/dates";
import { scrollToEl, scrollToId } from "../lib/scroll";
import { useUndo } from "../lib/undo";
import { db } from "../lib/db";
import { useSession } from "../lib/api";
import { useSync } from "../lib/sync";
import { useTrip } from "../lib/useTrip";
import { useTheme } from "../lib/theme";
import { useIsPhone, useTravelMode } from "../lib/travelMode";
import { useSettings } from "../lib/settings";
import { ORPHAN } from "../lib/itinerary";
import { fetchInbox, type InboxItem } from "../lib/inbox";
import { useItinerary } from "../hooks/useItinerary";
import { useTripUpkeep } from "../hooks/useTripUpkeep";
import { useTripViewState } from "../hooks/useTripViewState";
import { dayChips, ReservationsPanel } from "../components/Reservations";
import { BudgetPanel } from "../components/Budget";
import { TripOverview } from "../components/TripOverview";
import type { Tab } from "../components/Contents";
import type { SectionTarget } from "../components/SectionPicker";
import { ContentsColumn, ContentsDrawer } from "../components/trip/ContentsColumn";
import { CollapsedContentsBar } from "../components/trip/CollapsedContentsBar";
import { TripHero } from "../components/trip/TripHero";
import { TripTabsBar } from "../components/trip/TripTabsBar";
import { formatChip } from "../components/trip/DayChips";
import { PlanTools } from "../components/trip/PlanTools";
import { ItineraryDays } from "../components/trip/ItineraryDays";
import { TripUnavailable } from "../components/trip/TripUnavailable";
import { PlaceCardOverlay } from "../components/trip/PlaceCardOverlay";
import { MapPane } from "../components/trip/MapPane";
import { MapOverlays } from "../components/trip/MapOverlays";
import { TravelModeView } from "../components/trip/TravelModeView";
import { TripDialogs } from "../components/trip/TripDialogs";
import { HistoryDialog } from "../components/HistoryDialog";
import { MobileViewSwitch } from "../components/trip/MobileViewSwitch";
import type { DayFrame, PhotoFill, PlanContext, ReceiptTarget } from "../components/trip/types";

const LOADING = "loading" as const;

export function TripPage() {
  const { id } = useParams();
  const { doc, state, ready } = useTrip(id);
  const [theme] = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Multi-select (checkboxes) — separate from the single "open" card
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const lastChecked = useRef<string | null>(null);
  // Device-local view state (panel mode, hidden columns, day drafts, unpinned places)
  const { panelMode, setPanelMode, dayDraft, setDayDraft, contentsHidden, hideContents, planHidden, togglePlan, unpinned, dismissUnpinned } = useTripViewState(id);
  const [panelInset, setPanelInset] = useState<{ top: number; bottom: number } | null>(null);
  const [costFor, setCostFor] = useState<string | null>(null); // stop whose cost details are open
  const [focus, setFocus] = useState<string | null>(null); // section shown alone on the map
  const [compareDay, setCompareDay] = useState<string | null>(null);
  const [receiptFor, setReceiptFor] = useState<ReceiptTarget | null>(null);
  const [mobileView, setMobileView] = useState<"plan" | "map">("plan");
  const [dragging, setDragging] = useState<Item | null>(null);
  const [sharing, setSharing] = useState(false);
  const [tab, setTab] = useState<Tab>("plan");
  const [contentsDrawer, setContentsDrawer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [mapPicked, setMapPicked] = useState<string | null>(null);
  const [dayFrame, setDayFrame] = useState<DayFrame | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const fx = useConverter(state?.meta.currency ?? "CAD");
  const [editingRes, setEditingRes] = useState<Partial<Reservation> | null>(null);
  const [pickingCover, setPickingCover] = useState(false);
  const [photoFill, setPhotoFill] = useState<PhotoFill | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
  // Who "me" edits are credited to in the trip history
  useEffect(() => {
    if (doc) setHistoryAuthor(doc, myEmail?.toLowerCase());
  }, [doc, myEmail]);
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
  if (!state || !doc || !view) return <TripUnavailable canSync={canSync} syncStatus={syncStatus} synced={synced} waited={waited} />;

  const near = state.meta.center;
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
  const showContents = () => (window.matchMedia("(min-width: 1024px)").matches ? hideContents(false) : setContentsDrawer(true));
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
  // ?today=2026-12-03T10:00 previews the overview as on that day (for trying the during/after views)
  const overviewNow = (() => {
    const t = new URLSearchParams(location.search).get("today");
    const d = t ? new Date(t.length <= 10 ? `${t}T12:00` : t) : null;
    return d && !Number.isNaN(d.getTime()) ? d : undefined;
  })();
  const contentsProps = {
    sections: view.sections.filter((s) => s.key !== ORPHAN),
    reservations: state.reservations,
    tab,
    budgetTotal: spent > 0 ? { amount: spent, currency: state.meta.currency ?? "CAD" } : undefined,
    scrollRef,
    go,
    subtitles: state.meta.subtitles,
  };
  // Everything the itinerary's sections read or change
  const plan: PlanContext = {
    doc,
    state,
    view,
    timed,
    readOnly,
    autoOn,
    near,
    focus,
    setFocus,
    selectedId,
    setSelectedId,
    checked,
    onCheck,
    targets,
    writeOf,
    sectionsOf,
    toggleSection,
    chipsByDay,
    chipStyle: settings.bookingStyle,
    legsBySection,
    revealAdded,
    setReceiptFor,
    setEditingRes,
    setCostFor,
    setCompareDay,
    setDayDraft,
  };

  if (lite)
    return (
      <TravelModeView
        doc={doc}
        state={state}
        view={view}
        timed={timed}
        flights={flights}
        legResults={legResults}
        legsBySection={legsBySection}
        theme={theme}
        readOnly={readOnly}
        onExit={() => setTravelOn(false)}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        settingsScope={settingsScope}
      />
    );

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Contents column (wide screens); a drawer below that */}
      <ContentsColumn
        collapsed={planHidden || contentsHidden}
        thin={settings.contentsWidth === "thin"}
        contents={contentsProps}
        history={history}
        readOnly={readOnly}
        onHide={() => hideContents(true)}
      />
      {contentsDrawer && <ContentsDrawer contents={contentsProps} history={history} readOnly={readOnly} onClose={() => setContentsDrawer(false)} />}
      {/* Plan panel */}
      <aside
        className={`flex min-h-0 flex-col border-line bg-bg md:w-[480px] md:shrink-0 md:border-r lg:w-[540px] xl:w-[620px] 2xl:w-[680px] ${planHidden ? "md:hidden" : ""} ${
          mobileView === "map" ? "max-md:hidden" : "flex-1 md:flex-none"
        }`}
      >
        <CollapsedContentsBar hidden={contentsHidden} readOnly={readOnly} history={history} onShow={showContents} />
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-28 md:pb-10">
          <TripHero
            headerRef={headerRef}
            doc={doc}
            meta={state.meta}
            readOnly={readOnly}
            canSync={canSync}
            syncStatus={syncStatus}
            isOwner={isOwner}
            onShare={() => setSharing(true)}
            onHistory={() => setShowHistory(true)}
            onSettings={() => setShowSettings(true)}
            onPickCover={() => setPickingCover(true)}
          />
          <TripTabsBar
            doc={doc}
            state={state}
            tripId={id!}
            view={view}
            tab={tab}
            setTab={setTab}
            scrollRef={scrollRef}
            setDayFrame={setDayFrame}
            focus={focus}
            setFocus={setFocus}
            checked={checked}
            checkedIds={checkedIds}
            clearChecked={clearChecked}
            targets={targets}
            writeOf={writeOf}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            onOpenContents={() => setContentsDrawer(true)}
          />
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
            <PlanTools
              doc={doc}
              state={state}
              readOnly={readOnly}
              unpinned={unpinned}
              onDismissUnpinned={dismissUnpinned}
              canReview={canReview}
              inbox={inbox}
              setInbox={setInbox}
              setEditingRes={setEditingRes}
              photoFill={photoFill}
              setPhotoFill={setPhotoFill}
            />
            <ItineraryDays c={plan} sensors={sensors} dragging={dragging} setDragging={setDragging} />
            <p className="mt-6 px-2 text-[10px] text-muted/70">
              Routes: © OpenStreetMap contributors via FOSSGIS OSRM · Transit: <a className="underline" href="https://transitous.org/sources/" target="_blank" rel="noreferrer">Transitous</a>
            </p>
            </>)}
          </div>
        </div>
      </aside>

      <MapPane
        planHidden={planHidden}
        togglePlan={togglePlan}
        mobileView={mobileView}
        view={view}
        flights={flights}
        routes={routes}
        flightPaths={settings.flightPaths}
        selectedId={selectedId}
        onSelect={selectFromMap}
        theme={theme}
        tripId={id}
        focus={focus}
        dayFrame={dayFrame}
        near={near}
        openItem={openItem}
        openSection={openSection}
        panelInset={panelInset}
        pinClick={settings.pinClick}
        mapPicked={mapPicked}
      >
        <MapOverlays
          doc={doc}
          state={state}
          view={view}
          flights={flights}
          legResults={legResults}
          legsBySection={legsBySection}
          theme={theme}
          convert={fx.convert}
          readOnly={readOnly}
          autoOn={autoOn}
          receiptFor={receiptFor}
          setReceiptFor={setReceiptFor}
          compareDay={compareDay}
          setCompareDay={setCompareDay}
          setDayDraft={setDayDraft}
          setTab={setTab}
          scrollRef={scrollRef}
        />
        <PlaceCardOverlay
          doc={doc}
          state={state}
          readOnly={readOnly}
          openItem={openItem}
          openSection={openSection}
          openIdx={openIdx}
          openPlaces={openPlaces}
          goTo={goTo}
          setSelectedId={setSelectedId}
          panelMode={panelMode}
          setPanelMode={setPanelMode}
          targets={targets}
          writeOf={writeOf}
          sectionsOf={sectionsOf}
          toggleSection={toggleSection}
          setPanelInset={setPanelInset}
        />
      </MapPane>

      <TripDialogs
        doc={doc}
        state={state}
        tripId={id}
        readOnly={readOnly}
        costFor={costFor}
        setCostFor={setCostFor}
        pickingCover={pickingCover}
        setPickingCover={setPickingCover}
        editingRes={editingRes}
        setEditingRes={setEditingRes}
        sharing={sharing}
        setSharing={setSharing}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        settingsScope={settingsScope}
      />
      {showHistory && <HistoryDialog doc={doc} state={state} readOnly={readOnly} myEmail={myEmail ?? undefined} onClose={() => setShowHistory(false)} />}
      <MobileViewSwitch mobileView={mobileView} setMobileView={setMobileView} />
    </div>
  );
}
