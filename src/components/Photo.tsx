import { useState } from "react";

/** <img> that walks a list of URLs on error (e.g. large → API thumbnail) and reports a final failure. */
export function Photo({ srcs, className, alt = "", onFail }: { srcs: (string | undefined)[]; className?: string; alt?: string; onFail?: () => void }) {
  const list = srcs.filter((s): s is string => !!s && /^https?:\/\//.test(s));
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
