/*
 * Smooth scroll that survives layout shifts. Day sections use content-visibility:auto, so sections
 * that haven't rendered yet sit at a 240px estimate and grow as they come into view. Native smooth
 * scrolling gets cancelled by those shifts (most visibly when scrolling up, where it just jumps).
 * This recomputes the target every frame and finishes once the position stops moving.
 */
const running = new WeakMap<HTMLElement, number>();

export function scrollToEl(container: HTMLElement, el: HTMLElement, block: "start" | "center" = "start", duration = 450) {
  const prev = running.get(container);
  if (prev) cancelAnimationFrame(prev);
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const target = () => {
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const top = container.scrollTop + (r.top - c.top);
    const t = block === "center" ? top - (c.height - r.height) / 2 : top - margin;
    return Math.max(0, Math.min(t, container.scrollHeight - container.clientHeight));
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) duration = 0;
  const from = container.scrollTop;
  const start = performance.now();
  const anchor = container.style.overflowAnchor;
  container.style.overflowAnchor = "none"; // don't let the browser "correct" our position mid-flight
  let settled = 0;
  const ease = (x: number) => 1 - Math.pow(1 - x, 3);
  const step = (now: number) => {
    const p = duration ? Math.min(1, (now - start) / duration) : 1;
    const to = target();
    container.scrollTop = from + (to - from) * ease(p);
    if (p < 1) return running.set(container, requestAnimationFrame(step));
    // Sections near the target may still be rendering; keep snapping until it holds for a few frames
    settled = Math.abs(container.scrollTop - to) < 1 ? settled + 1 : 0;
    if (settled < 4 && now - start < duration + 1200) return running.set(container, requestAnimationFrame(step));
    container.style.overflowAnchor = anchor;
    running.delete(container);
  };
  running.set(container, requestAnimationFrame(step));
}

export function scrollToId(container: HTMLElement | null | undefined, id: string, block: "start" | "center" = "start") {
  const el = document.getElementById(id);
  if (container && el) scrollToEl(container, el, block);
  return !!el;
}
