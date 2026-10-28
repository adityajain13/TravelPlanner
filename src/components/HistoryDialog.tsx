import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Mail, RotateCcw, Sparkles, User, X } from "lucide-react";
import type * as Y from "yjs";
import { changedSince, describeChange, historyArray, type HistoryChange, type HistoryEntry } from "../lib/history";
import { isDraftSection, revertHistory, type TripState } from "../lib/trips";
import { daysBetween, formatShort } from "../lib/dates";
import { askConfirm } from "./ConfirmDialog";

type Filter = "all" | "me" | "claude" | "email";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["me", "People"],
  ["claude", "Claude"],
  ["email", "Email"],
];
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Edit history of the trip: who changed what, when, and a way to put any change back. */
export function HistoryDialog({ doc, state, readOnly, myEmail, onClose }: { doc: Y.Doc; state: TripState; readOnly: boolean; myEmail?: string; onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const arr = historyArray(doc);
    const sync = () => setEntries(arr.toArray());
    sync();
    arr.observe(sync);
    return () => arr.unobserve(sync);
  }, [doc]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      // Escape closes the confirm card first (it has its own listener)
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const shown = useMemo(() => entries.slice().reverse().filter((e) => filter === "all" || e.by === filter), [entries, filter]);
  const groups = useMemo(() => groupByDay(shown), [shown]);
  const open = shown.filter((e) => !e.revertedBy);
  const bulk = (filter === "claude" || filter === "email") && open.length >= 2;

  return createPortal(
    <div className="fixed inset-0 z-[100] grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label="History" onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-3xl border border-line bg-surface p-6 shadow-2xl max-sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">History</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full border border-line text-muted hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterChips value={filter} onPick={setFilter} />
          {bulk && <RevertAll doc={doc} list={open} />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0 && <p className="py-8 text-center text-[14px] text-muted">No changes recorded yet. Changes made from now on show up here.</p>}
          {groups.map((g) => (
            <DayGroup key={g.key} label={g.label} entries={g.entries} state={state} doc={doc} readOnly={readOnly} myEmail={myEmail} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FilterChips({ value, onPick }: { value: Filter; onPick: (f: Filter) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onPick(key)}
          className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${value === key ? "border-accent text-fg" : "border-line text-muted hover:border-accent hover:text-fg"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function RevertAll({ doc, list }: { doc: Y.Doc; list: HistoryEntry[] }) {
  return (
    <button onClick={() => confirmRevert(doc, list)} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[13px] font-semibold text-muted hover:border-accent hover:text-fg">
      <RotateCcw className="size-3.5" /> Revert all {list.length}
    </button>
  );
}

function DayGroup({ label, entries, state, doc, readOnly, myEmail }: { label: string; entries: HistoryEntry[]; state: TripState; doc: Y.Doc; readOnly: boolean; myEmail?: string }) {
  return (
    <section className="mb-2">
      <h3 className="sticky top-0 bg-surface py-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">{label}</h3>
      <ul className="divide-y divide-line">
        {entries.map((e) => (
          <EntryRow key={e.id} e={e} state={state} doc={doc} readOnly={readOnly} myEmail={myEmail} />
        ))}
      </ul>
    </section>
  );
}

const SHOWN_CHANGES = 4;

function EntryRow({ e, state, doc, readOnly, myEmail }: { e: HistoryEntry; state: TripState; doc: Y.Doc; readOnly: boolean; myEmail?: string }) {
  const [more, setMore] = useState(false);
  const lines = [...new Set(e.changes.map((c) => headline(c, state)))];
  const reverted = !!e.revertedBy;
  const hidden = lines.length - SHOWN_CHANGES;
  return (
    <li className={`group flex gap-3 py-3 ${reverted ? "opacity-50" : ""}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted [&>svg]:size-4">{entryIcon(e)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
          <span className="font-semibold">{whoLabel(e, myEmail)}</span>
          {e.label && <span className="text-muted">· {e.label}</span>}
          {reverted && <span className="rounded-full border border-line px-2 text-[11px] text-muted">Reverted</span>}
          <span className="ml-auto text-[12px] text-muted tabular-nums">{timeFmt.format(e.at)}</span>
        </div>
        <ul className="mt-1 space-y-0.5 text-[13px] leading-snug text-muted">
          {(more ? lines : lines.slice(0, SHOWN_CHANGES)).map((t, i) => (
            <li key={i} className="truncate">
              {t}
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <button onClick={() => setMore((m) => !m)} className="mt-0.5 text-[12px] font-semibold text-muted hover:text-fg">
            {more ? "Show less" : `+${hidden} more`}
          </button>
        )}
        {!readOnly && !reverted && (
          <button onClick={() => confirmRevert(doc, [e])} className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-fg">
            <RotateCcw className="size-3.5" /> Revert
          </button>
        )}
      </div>
    </li>
  );
}

/** Asks first, then puts the records back. Edits made since are reported, not blocked. */
async function confirmRevert(doc: Y.Doc, list: HistoryEntry[]) {
  const edited = list.reduce((n, e) => n + changedSince(doc, e), 0);
  const what = list.length === 1 ? "this change" : `these ${list.length} changes`;
  const body = edited > 0 ? `${edited} of these ${edited === 1 ? "was" : "were"} edited again since. Only what this change touched goes back; later edits to other fields stay.` : `Puts things back to how they were before ${what}.`;
  const ok = await askConfirm({ icon: <RotateCcw />, title: list.length === 1 ? "Revert this change?" : `Revert ${list.length} changes?`, body, confirmLabel: "Revert", danger: false });
  if (ok) revertHistory(doc, list);
}

const entryIcon = (e: HistoryEntry): ReactNode => {
  if (e.revertOf) return <RotateCcw />;
  if (e.by === "claude") return <Sparkles />;
  if (e.by === "email") return <Mail />;
  return <User />;
};

function whoLabel(e: HistoryEntry, myEmail?: string): string {
  if (e.by === "claude") return "Claude";
  if (e.by === "email") return "Email import";
  if (!e.who) return "Guest";
  if (myEmail && e.who.toLowerCase() === myEmail.toLowerCase()) return "You";
  return e.who.split("@")[0];
}

function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Entries are newest first, so each day's group comes out in order too. */
function groupByDay(list: HistoryEntry[]) {
  const now = Date.now();
  const today = dayKey(now);
  const yesterday = dayKey(now - 86_400_000);
  const out = new Map<string, { key: string; label: string; entries: HistoryEntry[] }>();
  for (const e of list) {
    const key = dayKey(e.at);
    let g = out.get(key);
    if (!g) out.set(key, (g = { key, label: key === today ? "Today" : key === yesterday ? "Yesterday" : dayFmt.format(e.at), entries: [] }));
    g.entries.push(e);
  }
  return [...out.values()];
}

function sectionLabel(section: string, state: TripState): string {
  if (section.startsWith("day:")) {
    const date = section.slice(4);
    const i = daysBetween(state.meta.startDate, state.meta.endDate).indexOf(date);
    return i >= 0 ? `Day ${i + 1}` : formatShort(date);
  }
  if (section.startsWith("list:")) return state.lists.find((l) => l.id === section.slice(5))?.title ?? "a list";
  if (isDraftSection(section)) return "a draft plan";
  return "another section";
}

/** One line per change, e.g. "Added stop Fushimi Inari" or "Changed Nishiki Market · time, notes". */
function headline(c: HistoryChange, state: TripState): string {
  const v = describeChange(c);
  if (v.verb === "added") return `Added ${v.noun} ${v.name}`;
  if (v.verb === "removed") return `Removed ${v.noun} ${v.name}`;
  if (v.verb === "moved") return `Moved ${v.name} to ${sectionLabel(v.toSection!, state)}`;
  const what = c.map === "meta" ? "trip" : v.name;
  return v.fields.length ? `Changed ${what} · ${v.fields.join(", ")}` : `Changed ${what}`;
}
