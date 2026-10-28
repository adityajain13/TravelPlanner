import { createElement, memo, useRef, type ComponentType } from "react";

/*
 * Skipping re-renders of unchanged days and cards.
 *
 * The trip page rebuilds its data on every edit (fresh objects with the same contents) and passes
 * fresh callbacks each render, so React.memo alone never skips anything. memoLatest() fixes both:
 *  - props are compared by value (arrays, plain objects, Maps and Sets, a few levels deep), so a
 *    day whose stops didn't change counts as unchanged;
 *  - every function prop is swapped for a stable forwarder that always calls the newest version,
 *    so a skipped component can't hold on to an outdated handler.
 */

// React elements are plain objects too, but holding a stale one would skip its new handlers
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype && !("$$typeof" in v);

/** Value equality for render data. Functions count as equal (they're forwarded, see below). */
export function sameData(a: unknown, b: unknown, depth = 9): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === "function" && typeof b === "function") return true;
  if (depth <= 0 || typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameData(a[i], b[i], depth - 1)) return false;
    return true;
  }
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !sameData(v, b.get(k), depth - 1)) return false;
    return true;
  }
  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (!isPlain(a) || !isPlain(b)) return false; // React elements, DOM nodes, class instances: identity only
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!(k in b) || !sameData(a[k], b[k], depth - 1)) return false;
  return true;
}

/**
 * React.memo by value, with function props forwarded to their latest version. Use for list rows
 * that re-render a lot (days, stop cards). Don't use for components whose children are elements.
 */
export function memoLatest<P extends object>(Component: ComponentType<P>, name = Component.displayName || Component.name) {
  const Inner = memo(Component, (prev, next) => sameData(prev, next));
  function Latest(props: P) {
    const latest = useRef(props);
    latest.current = props;
    const forwarders = useRef(new Map<string, (...args: unknown[]) => unknown>());
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (typeof v !== "function") {
        out[k] = v;
        continue;
      }
      let f = forwarders.current.get(k);
      if (!f) {
        f = (...args: unknown[]) => (latest.current as Record<string, (...a: unknown[]) => unknown>)[k]?.(...args);
        forwarders.current.set(k, f);
      }
      out[k] = f;
    }
    return createElement(Inner as ComponentType<Record<string, unknown>>, out);
  }
  Latest.displayName = `memoLatest(${name})`;
  return Latest;
}
