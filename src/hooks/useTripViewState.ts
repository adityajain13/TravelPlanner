import { useState } from "react";
import type { PanelMode } from "../components/PlacePanel";

/**
 * Device-local view state of one trip page: kept in localStorage / sessionStorage so it survives
 * reloads on this device only. Each setter exposed here also writes the stored value.
 */
export function useTripViewState(id: string | undefined) {
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
  const [contentsHidden, setContentsHidden] = useState(() => {
    try {
      return localStorage.getItem("tp-contents-hidden") === "1";
    } catch {
      return false;
    }
  });
  const hideContents = (hidden: boolean) => {
    setContentsHidden(hidden);
    try {
      localStorage.setItem("tp-contents-hidden", hidden ? "1" : "0");
    } catch {
      /* private mode */
    }
  };
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
  // Places a Wanderlog import couldn't locate (set by the importer for this session)
  const [unpinned, setUnpinned] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`tp-unpinned-${id}`) ?? "[]");
    } catch {
      return [];
    }
  });
  const dismissUnpinned = () => (sessionStorage.removeItem(`tp-unpinned-${id}`), setUnpinned([]));

  return {
    panelMode,
    setPanelMode,
    dayDraft,
    setDayDraft,
    contentsHidden,
    hideContents,
    planHidden,
    togglePlan,
    unpinned,
    dismissUnpinned,
  };
}
