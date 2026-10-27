/*
 * Light formatting for notes, checklists and stop notes, stored as plain text with markers so it
 * still reads fine anywhere that shows it raw (Claude connector, exports):
 *
 *   **bold**  *italic*  ++underline++  ~~strikethrough~~
 *   "- item" / "1. item" lines are lists; each tab (or two spaces) in front is one level in
 *
 * parse → blocks for display; toHtml → the editor's starting content; fromDom → back to text.
 */

export type Inline = string | { tag: "b" | "i" | "u" | "s"; kids: Inline[] };
export type ListItem = { kids: Inline[]; sub?: ListBlock };
export type ListBlock = { type: "list"; ordered: boolean; items: ListItem[] };
export type Block = { type: "p"; kids: Inline[] } | ListBlock;

const MARKS: [string, "b" | "u" | "s" | "i"][] = [
  ["**", "b"],
  ["++", "u"],
  ["~~", "s"],
  ["*", "i"],
];

/** Where `mark` closes after `from` ("*" must be a lone star, not half of "**"). */
function closeOf(s: string, mark: string, from: number) {
  for (let j = s.indexOf(mark, from); j !== -1; j = s.indexOf(mark, j + 1)) {
    if (mark !== "*") return j;
    const double = s[j + 1] === "*";
    if (!double && s[j - 1] !== "*") return j;
    if (double) j++; // skip the "**"
  }
  return -1;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  let i = 0;
  while (i < s.length) {
    let hit = false;
    for (const [m, tag] of MARKS) {
      if (!s.startsWith(m, i) || (m === "*" && s[i + 1] === "*")) continue;
      const close = closeOf(s, m, i + m.length);
      if (close <= i + m.length) continue;
      if (buf) out.push(buf), (buf = "");
      out.push({ tag, kids: parseInline(s.slice(i + m.length, close)) });
      i = close + m.length;
      hit = true;
      break;
    }
    if (!hit) buf += s[i++];
  }
  if (buf) out.push(buf);
  return out;
}

const LINE = /^((?:\t| {2})*)(?:([-*•])\s+|(\d+)[.)]\s+)(.*)$/;

export function parse(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    if (!LINE.test(lines[i])) {
      blocks.push({ type: "p", kids: parseInline(lines[i]) });
      i++;
      continue;
    }
    // A run of list lines, nested by indentation
    const run: { depth: number; ordered: boolean; text: string }[] = [];
    while (i < lines.length && LINE.test(lines[i])) {
      const m = LINE.exec(lines[i])!;
      const depth = (m[1].match(/\t/g)?.length ?? 0) + Math.floor((m[1].match(/ /g)?.length ?? 0) / 2);
      run.push({ depth, ordered: !!m[3], text: m[4] });
      i++;
    }
    let k = 0;
    const build = (depth: number): ListBlock => {
      const list: ListBlock = { type: "list", ordered: run[k].ordered, items: [] };
      while (k < run.length && run[k].depth >= depth) {
        if (run[k].depth === depth && run[k].ordered !== list.ordered) break; // "- " then "1. ": a new list
        if (run[k].depth > depth) {
          const last = list.items.at(-1) ?? (list.items.push({ kids: [] }), list.items[0]);
          last.sub = build(depth + 1);
        } else list.items.push({ kids: parseInline(run[k++].text) });
      }
      return list;
    };
    while (k < run.length) blocks.push(build(0));
  }
  return blocks;
}

/** True when the text uses any formatting (else it can be shown as before). */
export const hasFormatting = (s?: string) => !!s && (/(\*\*|\+\+|~~|\*)[^\n]+?\1/.test(s) || s.split("\n").some((l) => LINE.test(l)));

/** The text without markers (titles, search, short previews). */
export function plain(s: string): string {
  const flat = (xs: Inline[]): string => xs.map((x) => (typeof x === "string" ? x : flat(x.kids))).join("");
  return s
    .split("\n")
    .map((l) => {
      const m = LINE.exec(l);
      return flat(parseInline(m ? m[4] : l));
    })
    .join("\n");
}

/* ---- Editor: text → HTML, HTML → text ---- */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TAG = { b: "b", i: "i", u: "u", s: "s" } as const;
const inlineHtml = (xs: Inline[]): string => xs.map((x) => (typeof x === "string" ? esc(x) : `<${TAG[x.tag]}>${inlineHtml(x.kids)}</${TAG[x.tag]}>`)).join("");
const listHtml = (l: ListBlock): string => {
  const t = l.ordered ? "ol" : "ul";
  return `<${t}>${l.items.map((it) => `<li>${inlineHtml(it.kids) || "<br>"}</li>${it.sub ? listHtml(it.sub) : ""}`).join("")}</${t}>`;
};

export function toHtml(text: string): string {
  return parse(text)
    .map((b) => (b.type === "p" ? `<div>${inlineHtml(b.kids) || "<br>"}</div>` : listHtml(b)))
    .join("");
}

const WRAP: Record<string, string> = { B: "**", STRONG: "**", I: "*", EM: "*", U: "++", S: "~~", STRIKE: "~~", DEL: "~~" };

function inlineMd(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? "").replace(/ /g, " ");
  if (!(n instanceof HTMLElement)) return "";
  if (n.tagName === "BR") return "\n";
  let inner = [...n.childNodes].map(inlineMd).join("");
  if (!inner.trim()) return inner;
  // Styled spans (some browsers format with CSS)
  const st = n.style;
  const wraps = [WRAP[n.tagName]];
  if (n.tagName === "SPAN") {
    if (st.fontWeight === "bold" || Number(st.fontWeight) >= 600) wraps.push("**");
    if (st.fontStyle === "italic") wraps.push("*");
    if (st.textDecorationLine?.includes("underline") || st.textDecoration?.includes("underline")) wraps.push("++");
    if (st.textDecorationLine?.includes("line-through") || st.textDecoration?.includes("line-through")) wraps.push("~~");
  }
  for (const w of wraps) if (w) inner = wrapKeepingSpaces(inner, w);
  return inner;
}

/** "**bold **" → "**bold** ": markers hug the words. */
function wrapKeepingSpaces(s: string, w: string) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  return `${m[1]}${w}${m[2]}${w}${m[3]}`;
}

function listLines(list: Element, depth: number): string[] {
  const ordered = list.tagName === "OL";
  const out: string[] = [];
  let n = 0;
  for (const c of list.children) {
    if (c.tagName === "UL" || c.tagName === "OL") {
      out.push(...listLines(c, depth + 1));
      continue;
    }
    if (c.tagName !== "LI") continue;
    n++;
    const text = [...c.childNodes]
      .filter((x) => !(x instanceof Element && (x.tagName === "UL" || x.tagName === "OL")))
      .map(inlineMd)
      .join("")
      .replace(/\n+$/, "")
      .replace(/\n/g, " ");
    out.push(`${"\t".repeat(depth)}${ordered ? `${n}. ` : "- "}${text}`);
    for (const sub of c.children) if (sub.tagName === "UL" || sub.tagName === "OL") out.push(...listLines(sub, depth + 1));
  }
  return out;
}

function blockLines(el: Node): string[] {
  const lines: string[] = [];
  let cur: string | null = null;
  const end = () => {
    if (cur !== null) lines.push(cur), (cur = null);
  };
  for (const c of el.childNodes) {
    if (c instanceof HTMLElement && (c.tagName === "DIV" || c.tagName === "P")) {
      end();
      const inner = blockLines(c);
      lines.push(...(inner.length ? inner : [""]));
    } else if (c instanceof HTMLElement && (c.tagName === "UL" || c.tagName === "OL")) {
      end();
      lines.push(...listLines(c, 0));
    } else if (c instanceof HTMLElement && c.tagName === "BR") {
      if (cur === null) lines.push("");
      else end();
    } else cur = (cur ?? "") + inlineMd(c);
  }
  end();
  return lines.flatMap((l) => l.split("\n"));
}

/** The editor's DOM back to marked-up text. */
export function fromDom(root: HTMLElement): string {
  const lines = blockLines(root);
  while (lines.length && !lines.at(-1)!.trim()) lines.pop();
  return lines.join("\n");
}
