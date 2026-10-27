import { Fragment } from "react";

const URL_RE = /\b(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"’”)]|www\.[^\s<>()]+[^\s<>().,;:!?'"’”)])/gi;

export const hasLink = (s?: string) => !!s && new RegExp(URL_RE.source, "i").test(s);

/** "https://www.kintetsu.co.jp/foreign/english/aoniyoshi/" → "kintetsu.co.jp/foreign/english/aoniyoshi" */
export function prettyUrl(u: string) {
  try {
    const url = new URL(/^https?:/i.test(u) ? u : `https://${u}`);
    const path = `${url.pathname}${url.search}`.replace(/\/$/, "");
    const text = `${url.hostname.replace(/^www\./, "")}${path === "/" ? "" : path}`;
    return text.length > 48 ? `${text.slice(0, 46)}…` : text;
  } catch {
    return u;
  }
}

/** Plain text with any web addresses turned into links that open in a new tab. */
export function Linkified({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        i % 2 ? (
          <a
            key={i}
            href={/^https?:/i.test(p) ? p : `https://${p}`}
            target="_blank"
            rel="noreferrer"
            title={p}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-accent underline decoration-accent/40 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-accent"
          >
            {prettyUrl(p)}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}
