import type { Dispatch, SetStateAction } from "react";
import { List, Map as MapIcon } from "lucide-react";

/** Phones: a floating button that flips between the plan and the map. */
export function MobileViewSwitch({ mobileView, setMobileView }: { mobileView: "plan" | "map"; setMobileView: Dispatch<SetStateAction<"plan" | "map">> }) {
  return (
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
  );
}
