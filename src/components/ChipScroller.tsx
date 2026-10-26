import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Horizontal row that actually scrolls with a mouse: the wheel scrolls sideways, arrow buttons
 * appear at whichever end has more, edges fade, and you can drag it. Touch scrolling is native.
 */
export function ChipScroller({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    // drag to scroll (mouse only; clicks on a chip still work when you don't move)
    let start: { x: number; left: number } | null = null;
    let moved = false;
    const down = (e: PointerEvent) => e.pointerType === "mouse" && ((start = { x: e.clientX, left: el.scrollLeft }), (moved = false));
    const move = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      if (Math.abs(dx) > 4) moved = true;
      if (moved) el.scrollLeft = start.left - dx;
    };
    const up = () => (start = null);
    const click = (e: MouseEvent) => moved && (e.stopPropagation(), e.preventDefault(), (moved = false));
    update();
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("click", click, true);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("click", click, true);
      ro.disconnect();
    };
  }, []);

  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });
  const fade = `${edge.left ? "transparent, black 40px" : "black, black"}, black calc(100% - 40px), ${edge.right ? "transparent" : "black"}`;
  const arrow = "absolute top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-muted shadow-md hover:text-fg max-md:hidden";

  return (
    // Padding goes on the outside so the arrows centre on the chips, not on uneven padding
    <div className={className}>
    <div className="relative">
      <div
        ref={ref}
        className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] select-none [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: `linear-gradient(to right, ${fade})`, WebkitMaskImage: `linear-gradient(to right, ${fade})` }}
      >
        {children}
      </div>
      {edge.left && (
        <button onClick={() => by(-1)} className={`${arrow} -left-1`} aria-label="Earlier days">
          <ChevronLeft className="size-4" />
        </button>
      )}
      {edge.right && (
        <button onClick={() => by(1)} className={`${arrow} -right-1`} aria-label="Later days">
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
    </div>
  );
}
