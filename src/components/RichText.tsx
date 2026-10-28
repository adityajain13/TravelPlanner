import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Bold, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, Strikethrough, Underline } from "lucide-react";
import { fromDom, parse, toHtml, type Block, type Inline, type ListBlock } from "../lib/richtext";
import { Linkified } from "./Linkified";

/* ---- Display ---- */

function renderInline(xs: Inline[], key = ""): ReactNode {
  return xs.map((x, i) => {
    const k = `${key}${i}`;
    if (typeof x === "string") return <Linkified key={k} text={x} />;
    const kids = renderInline(x.kids, `${k}-`);
    if (x.tag === "b") return <strong key={k} className="font-bold text-fg">{kids}</strong>;
    if (x.tag === "i") return <em key={k}>{kids}</em>;
    if (x.tag === "u") return <u key={k} className="underline-offset-2">{kids}</u>;
    return <s key={k}>{kids}</s>;
  });
}

const MARKERS = ["list-disc", "list-[circle]", "list-[square]"];
const NUMBERS = ["list-decimal", "list-[lower-alpha]", "list-[lower-roman]"];

function renderList(l: ListBlock, key: string, depth = 0): ReactNode {
  const Tag = l.ordered ? "ol" : "ul";
  return (
    <Tag key={key} className={`my-0.5 pl-5 ${(l.ordered ? NUMBERS : MARKERS)[depth % 3]} marker:text-muted`}>
      {l.items.map((it, i) => (
        <li key={i} className="pl-0.5">
          {renderInline(it.kids)}
          {it.sub && renderList(it.sub, `${key}-${i}`, depth + 1)}
        </li>
      ))}
    </Tag>
  );
}

const renderBlocks = (bs: Block[]) =>
  bs.map((b, i) => (b.type === "p" ? <div key={i} className="min-h-[1lh] whitespace-pre-wrap [tab-size:4]">{renderInline(b.kids)}</div> : <Fragment key={i}>{renderList(b, String(i))}</Fragment>));

/** Formatted note text (bold, lists…) with clickable links. */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`[overflow-wrap:anywhere] ${className}`}>{renderBlocks(parse(text))}</div>;
}

/** One-line variant (checklist rows): inline formatting only. */
export function RichLine({ text, className = "" }: { text: string; className?: string }) {
  const b = parse(text)[0];
  return <span className={className}>{b?.type === "p" ? renderInline(b.kids) : text}</span>;
}

/* ---- Editing ---- */

interface EditorProps {
  value: string;
  onCommit: (text: string) => void;
  placeholder?: string;
  className?: string;
  /** Checklist rows: no lists or new lines; Enter / Backspace-on-empty are handed back. */
  singleLine?: boolean;
  onEnter?: (text: string) => void;
  onBackspaceEmpty?: () => void;
  onEscape?: () => void;
  autoFocus?: boolean;
  /** Put the caret where the reader clicked (screen point), else at the end. */
  caretAt?: { x: number; y: number } | null;
  /** After the edit is written back; gets the final text (empty notes remove themselves). */
  onBlur?: (text: string) => void;
}

/** Everything the key handler needs from the editor. */
interface KeyContext {
  p: EditorProps;
  ref: RefObject<HTMLDivElement | null>;
  last: RefObject<string>;
  read: () => string;
  run: (cmd: string) => void;
  inList: () => boolean;
}

/** Keyboard handling: formatting shortcuts, Escape, Enter / Backspace for checklist rows, Tab and "- " lists. */
function handleEditorKey(e: React.KeyboardEvent<HTMLDivElement>, { p, ref, last, read, run, inList }: KeyContext) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.shiftKey && (e.key === "x" || e.key === "X")) return e.preventDefault(), run("strikeThrough");
  if (mod && (e.key === "u" || e.key === "U")) return e.preventDefault(), run("underline");
  if (e.key === "Escape") return e.preventDefault(), p.onEscape ? p.onEscape() : ref.current?.blur();
  if (p.singleLine) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!p.onEnter) return ref.current?.blur();
      const t = read();
      last.current = t; // handed over here; the blur that follows mustn't write it again
      return p.onEnter(t);
    }
    if (e.key === "Backspace" && !ref.current?.textContent && p.onBackspaceEmpty) return e.preventDefault(), p.onBackspaceEmpty();
    return;
  }
  if (e.key === "Tab") {
    e.preventDefault();
    if (inList()) run(e.shiftKey ? "outdent" : "indent");
    else if (!e.shiftKey) document.execCommand("insertText", false, "\t");
    return;
  }
  // "- " or "1. " at the start of a line starts a list
  if (e.key === " ") {
    const sel = getSelection();
    const node = sel?.anchorNode;
    if (!sel || !node || node.nodeType !== Node.TEXT_NODE || inList()) return;
    const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
    if (!/^(-|\*|1\.)$/.test(before) || node.previousSibling) return;
    e.preventDefault();
    const r = document.createRange();
    r.setStart(node, 0);
    r.setEnd(node, sel.anchorOffset);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand("delete");
    run(before === "1." ? "insertOrderedList" : "insertUnorderedList");
  }
}

/** Paste as plain text (no fonts/colours from the source); single-line fields also lose their line breaks. */
function pasteAsPlainText(e: React.ClipboardEvent<HTMLDivElement>, singleLine?: boolean) {
  e.preventDefault();
  const t = e.clipboardData.getData("text/plain");
  document.execCommand("insertText", false, singleLine ? t.replace(/\s*\n\s*/g, " ") : t);
}

/** Where editing starts: at the screen point the reader clicked (when it lands inside the editor), else at the end. */
function startRange(el: HTMLElement, caretAt?: { x: number; y: number } | null): Range {
  let range: Range | null = null;
  if (caretAt) {
    const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    if (d.caretPositionFromPoint) {
      const pos = d.caretPositionFromPoint(caretAt.x, caretAt.y);
      if (pos && el.contains(pos.offsetNode)) (range = document.createRange()), range.setStart(pos.offsetNode, pos.offset);
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(caretAt.x, caretAt.y);
      if (r && el.contains(r.startContainer)) range = r;
    }
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }
  return range;
}

/**
 * contenteditable with a formatting bar that pops up over selected text. Writes back on blur
 * (like the plain fields did), so a remote edit never jumps the cursor mid-typing.
 */
export function RichEditor(p: EditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; y: number } | null>(null);
  const [, force] = useState(0);
  const last = useRef(p.value);

  // Starting content; only replaced from outside while not being edited
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    el.innerHTML = p.singleLine ? toHtml(p.value).replace(/^<div>|<\/div>$/g, "").replace(/^<br>$/, "") : p.value ? toHtml(p.value) : "";
    last.current = p.value;
  }, [p.value, p.singleLine]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !p.autoFocus) return;
    el.focus();
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(startRange(el, p.caretAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The bar follows the selection while it's inside this editor
  useEffect(() => {
    const onSel = () => {
      const el = ref.current;
      const sel = getSelection();
      if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed || !el.contains(sel.anchorNode)) return setBar(null);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r.width && !r.height) return setBar(null);
      setBar({ x: r.left + r.width / 2, y: r.top });
      force((n) => n + 1); // refresh the bold/italic… states
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const read = () => (ref.current ? fromDom(ref.current) : "");
  const commit = () => {
    const t = read();
    if (t !== last.current) (last.current = t), p.onCommit(t);
  };
  const run = (cmd: string) => {
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(cmd);
    force((n) => n + 1);
  };
  const inList = () => {
    const n = getSelection()?.anchorNode;
    const el = n instanceof Element ? n : n?.parentElement; // caret in an empty <li> sits on the <li> itself
    return !!el?.closest("li") && !!ref.current?.contains(el!);
  };

  return (
    <>
      <EditSurface
        surfaceRef={ref}
        multiline={!p.singleLine}
        placeholder={p.placeholder}
        className={p.className ?? ""}
        onBlur={() => {
          commit();
          setBar(null);
          p.onBlur?.(last.current);
        }}
        onInput={() => {
          const el = ref.current;
          // Fully cleared: drop the stray <br> so the placeholder shows
          if (el && !el.textContent && !el.querySelector("li")) el.innerHTML = "";
        }}
        onPaste={(e) => pasteAsPlainText(e, p.singleLine)}
        onKeyDown={(e) => handleEditorKey(e, { p, ref, last, read, run, inList })}
      />
      {bar && <Toolbar at={bar} lists={!p.singleLine} run={run} inList={inList()} />}
    </>
  );
}

/** The contenteditable box; its event handlers come from the editor. */
function EditSurface({
  surfaceRef,
  multiline,
  placeholder,
  className,
  onBlur,
  onInput,
  onPaste,
  onKeyDown,
}: {
  surfaceRef: RefObject<HTMLDivElement | null>;
  multiline: boolean;
  placeholder?: string;
  className: string;
  onBlur: () => void;
  onInput: () => void;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      ref={surfaceRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline}
      data-placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onBlur={onBlur}
      onInput={onInput}
      onPaste={onPaste}
      onKeyDown={onKeyDown}
      className={`min-w-0 outline-none empty:before:pointer-events-none empty:before:text-muted/60 empty:before:content-[attr(data-placeholder)] [overflow-wrap:anywhere] [tab-size:4] whitespace-pre-wrap [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul_ul]:list-[circle] [&_ol_ol]:list-[lower-alpha] [&_li]:pl-0.5 [&_ol]:my-0.5 [&_ul]:my-0.5 [&_b]:font-bold [&_b]:text-fg ${className}`}
    />
  );
}

function Toolbar({ at, lists, run, inList }: { at: { x: number; y: number }; lists: boolean; run: (cmd: string) => void; inList: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => setW(ref.current?.offsetWidth ?? 0), [lists, inList]);
  const on = (cmd: string) => {
    try {
      return document.queryCommandState(cmd);
    } catch {
      return false;
    }
  };
  const btn = (cmd: string, icon: ReactNode, label: string) => (
    <button
      key={cmd}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on(cmd)}
      // mousedown: act before the editor loses the selection
      onMouseDown={(e) => (e.preventDefault(), run(cmd))}
      className={`grid size-8 place-items-center rounded-lg transition-colors [&>svg]:size-4 ${on(cmd) ? "bg-accent/20 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
    >
      {icon}
    </button>
  );
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, at.x - w / 2));
  const top = at.y - 48 < 8 ? at.y + 28 : at.y - 48;
  return createPortal(
    <div ref={ref} role="toolbar" aria-label="Formatting" onMouseDown={(e) => e.preventDefault()} className="fixed z-[130] flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-2xl" style={{ left, top }}>
      {btn("bold", <Bold />, "Bold")}
      {btn("italic", <Italic />, "Italic")}
      {btn("underline", <Underline />, "Underline")}
      {btn("strikeThrough", <Strikethrough />, "Strikethrough")}
      {lists && (
        <>
          <span className="mx-1 h-5 w-px bg-line" />
          {btn("insertUnorderedList", <List />, "Bulleted list")}
          {btn("insertOrderedList", <ListOrdered />, "Numbered list")}
          {inList && btn("outdent", <IndentDecrease />, "Outdent (Shift+Tab)")}
          {inList && btn("indent", <IndentIncrease />, "Indent (Tab)")}
        </>
      )}
    </div>,
    document.body,
  );
}

/**
 * Shows the formatted text; click it (anywhere but a link) to edit in place with the caret where
 * you clicked. Empty fields open straight into the editor.
 */
export function RichField({
  value,
  onCommit,
  readOnly,
  placeholder,
  className = "",
  viewClassName = "",
  editClassName = "",
  autoFocus,
  onDone,
}: {
  value: string;
  onCommit: (t: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  viewClassName?: string;
  editClassName?: string;
  autoFocus?: boolean;
  /** After editing ends (blur), with the final text. */
  onDone?: (t: string) => void;
}) {
  const [editing, setEditing] = useState<{ x: number; y: number } | null | false>(autoFocus ? null : false);
  if (readOnly || (editing === false && value))
    return (
      <div
        onClick={(e) => {
          if (readOnly || (e.target as HTMLElement).closest("a")) return;
          e.stopPropagation();
          setEditing({ x: e.clientX, y: e.clientY });
        }}
        className={`${className} ${viewClassName} ${readOnly ? "" : "cursor-text"}`}
      >
        <RichText text={value} />
      </div>
    );
  return (
    <RichEditor
      value={value}
      autoFocus={editing !== false}
      caretAt={editing || null}
      placeholder={placeholder}
      onCommit={onCommit}
      onBlur={(t) => {
        setEditing(false);
        onDone?.(t);
      }}
      className={`${className} ${editClassName}`}
    />
  );
}
