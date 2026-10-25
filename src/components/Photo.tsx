import { useState } from "react";

// Wikimedia only renders a fixed set of thumbnail widths; others fail. Photos saved before that fix
// carry e.g. "/320px-", so snap to the next standard width and fall back to the original file.
const STANDARD = [120, 250, 330, 500, 960, 1280, 1920];
const WIKI_THUMB = /^(https:\/\/upload\.wikimedia\.org\/[^/]+\/[^/]+)\/thumb\/(.+?)\/(\d+)px-[^/]+$/;
function expand(u: string): string[] {
  const m = u.match(WIKI_THUMB);
  if (!m) return [u];
  const w = Number(m[3]);
  const std = STANDARD.find((x) => x >= w) ?? 1920;
  const snapped = std === w ? u : u.replace(/\/\d+px-([^/]+)$/, `/${std}px-$1`);
  return [snapped, `${m[1]}/${m[2]}`];
}

/** <img> that walks a list of URLs on error (e.g. large → API thumbnail) and reports a final failure. */
export function Photo({ srcs, className, alt = "", onFail }: { srcs: (string | undefined)[]; className?: string; alt?: string; onFail?: () => void }) {
  const list = [...new Set(srcs.filter((s): s is string => !!s && /^https?:\/\//.test(s)).flatMap(expand))];
  const [i, setI] = useState(0);
  if (!list.length || i >= list.length) return null;
  return (
    <img
      key={list[i]}
      src={list[i]}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => {
        if (i + 1 >= list.length) onFail?.();
        setI(i + 1);
      }}
    />
  );
}
