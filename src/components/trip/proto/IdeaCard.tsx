// PROTOTYPE (proto/trip-focus): one idea. Folded: name, town and country, category (editable), your why,
// must-do and votes, the day button and a ⋯ menu. Unfolded: a Recommendation section (good / watch out /
// won't work, each with an icon and a word, not just a colour) and About (address, visit length, links).
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, ExternalLink, Map as MapIcon, MoreHorizontal, Pencil, Star, ThumbsUp, Ticket, Trash2, X } from "lucide-react";
import { googleMapsLink } from "../../../lib/photon";
import { factsOf, isGoodFit } from "../../../lib/protoFit";
import { addedByOf, autoGroupOf, GROUP_LABEL, GROUP_ORDER, hasOwnGroup, isMustDo, mentionParts, votesOf, type BookingState, type Group } from "../../../lib/protoIdeas";
import { Avatar, MentionInput } from "./MentionInput";
import { DayMenu, dayShort, type DayFit } from "./DayMenu";
import type { Idea } from "./IdeasShelf";

const BEST_TIME = { morning: "Best early in the day", sunset: "Best around sunset", evening: "Best in the evening" } as const;
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

export function IdeaCard({
  idea,
  where,
  days,
  best,
  people,
  me,
  readOnly,
  highlight,
  selected,
  booking,
  startWhy,
  onAdd,
  onOpen,
  onVote,
  onMustDo,
  onWhy,
  onGroup,
  onRemove,
  onDoneWhy,
}: {
  idea: Idea;
  /** "Kyoto, Japan" */
  where: string;
  /** This idea's fit with every day */
  days: DayFit[];
  best: DayFit | null;
  people: string[];
  me: string | null;
  readOnly: boolean;
  highlight: "lit" | "new" | null;
  /** Open on the map (his place card) */
  selected: boolean;
  booking: BookingState;
  /** Just captured: open the why field */
  startWhy: boolean;
  onAdd: (dayKey: string) => void;
  onOpen: () => void;
  onVote: () => void;
  onMustDo: () => void;
  onWhy: (text: string) => void;
  onGroup: (g: Group | undefined) => void;
  onRemove: () => void;
  onDoneWhy: () => void;
}) {
  const it = idea.item;
  const group = people.length >= 2;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<null | "main" | "category">(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setMenu(null);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [menu]);
  const whyOpen = (editing || startWhy) && !readOnly;
  const closeWhy = () => (setEditing(false), onDoneWhy());
  const mustOn = isMustDo(it);
  const votes = votesOf(it);
  const mine = !!me && votes.includes(me);
  const by = addedByOf(it);
  const facts = factsOf(it);

  const categoryMenu = (
    <ul className="absolute top-full left-0 z-40 mt-1 w-44 rounded-xl border border-line bg-surface p-1 shadow-xl">
      {/* Automatic: the app's guess from the place's map category and name; picking one below overrides it */}
      <li>
        <button onClick={() => (onGroup(undefined), setMenu(null))} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2">
          <span className="w-3.5">{!hasOwnGroup(it) && <Check className="size-3.5 text-accent" />}</span>
          <span>
            Automatic <span className="text-muted">({GROUP_LABEL[autoGroupOf(it)]})</span>
          </span>
        </button>
      </li>
      <li className="my-1 border-t border-line" aria-hidden />
      {GROUP_ORDER.map((g) => (
        <li key={g}>
          <button onClick={() => (onGroup(g), setMenu(null))} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2">
            <span className="w-3.5">{hasOwnGroup(it) && idea.group === g && <Check className="size-3.5 text-accent" />}</span>
            {GROUP_LABEL[g]}
          </button>
        </li>
      ))}
    </ul>
  );

  // Recommendation: the best day's reasons, then any day this can't go on
  const good = best && isGoodFit(best.fit) ? best.fit.reasons : [];
  const booked = booking.kind === "booked" ? booking : null;
  const warn = best ? best.fit.blockers.filter((b) => (!best.fit.out || b.weight < 100) && !(booked && b.text === "Book ahead")) : [];
  const bookedDay = booked?.date ? days.find((d) => d.date === booked.date) : undefined;
  const bookedText = booked ? (booked.date ? `${dayShort(booked.date)}${booked.time ? `, ${booked.time}` : ""}` : "no date yet") : "";
  const ruledOut = days.filter((d) => d.fit.out);
  const line = (kind: "good" | "warn" | "out", text: string, key: string) => (
    <li key={key} className={`flex items-start gap-2 ${kind === "good" ? "text-accent" : kind === "out" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
      {kind === "good" ? <Check className="mt-0.5 size-3.5 shrink-0" /> : kind === "out" ? <X className="mt-0.5 size-3.5 shrink-0" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
      <span>
        <b className="font-semibold">{kind === "good" ? "Good: " : kind === "out" ? "Won't work: " : "Watch out: "}</b>
        <span className="text-fg/85">{text}</span>
      </span>
    </li>
  );

  return (
    // Clicking the card selects it (his place card opens over the map); the strip along the bottom unfolds it
    <div
      id={`item-${it.id}`}
      onClick={(e) => !(e.target as HTMLElement).closest("button,a,input,select,ul") && onOpen()}
      className={`cursor-pointer rounded-2xl border bg-surface transition-all duration-500 ${
        highlight === "lit" || selected ? "border-accent ring-4 ring-accent/20" : highlight === "new" ? "border-accent" : mustOn ? "border-amber-400/70" : "border-line"
      }`}
    >
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold">{it.name}</p>
            <div ref={menu === "category" ? box : undefined} className="relative mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
              {where && <span>{where}</span>}
              {where && <span aria-hidden>·</span>}
              <button
                onClick={() => !readOnly && setMenu(menu === "category" ? null : "category")}
                title={readOnly ? undefined : "Change category"}
                className="flex items-center gap-0.5 rounded hover:text-fg"
              >
                {GROUP_LABEL[idea.group]}
                {!readOnly && <ChevronDown className="size-3" />}
              </button>
              {menu === "category" && categoryMenu}
              {booking.kind === "needed" && (
                <span className="ml-1 flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-px text-[11.5px] font-semibold text-amber-800 dark:text-amber-300">
                  <Ticket className="size-3" /> Book ahead
                </span>
              )}
              {booked && (
                <span className="ml-1 flex items-center gap-1 rounded-full bg-accent/15 px-2 py-px text-[11.5px] font-semibold text-accent" title={booked.res.title}>
                  <Ticket className="size-3" /> <Check className="-ml-0.5 size-3" /> Booked · {bookedText}
                </span>
              )}
            </div>
          </div>
          {!readOnly && (
            <div ref={menu === "main" ? box : undefined} className="relative flex shrink-0 items-center gap-1">
              <DayMenu days={days} best={best} booked={bookedDay} onAdd={onAdd} />
              <button onClick={() => setMenu(menu === "main" ? null : "main")} aria-label="More" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
                <MoreHorizontal className="size-4" />
              </button>
              {menu === "main" && (
                <div className="absolute top-full right-0 z-40 mt-1 w-48 rounded-xl border border-line bg-surface p-1 shadow-xl">
                  <button onClick={() => (setEditing(true), setMenu(null))} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2">
                    <Pencil className="size-3.5" /> {it.notes ? "Edit why" : "Add why"}
                  </button>
                  <button onClick={() => (onOpen(), setMenu(null))} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2">
                    <MapIcon className="size-3.5" /> Show on map
                  </button>
                  <button onClick={() => (onRemove(), setMenu(null))} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-red-500 hover:bg-surface-2">
                    <Trash2 className="size-3.5" /> Remove idea
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {whyOpen ? (
          <div className="mt-2.5">
            <MentionInput
              autoFocus
              initial={it.notes ?? ""}
              people={people}
              placeholder={group ? "Why this? Type @ to mention someone · Enter to save" : "Why this? · Enter to save"}
              onSave={(t) => (t !== (it.notes ?? "") && onWhy(t), closeWhy())}
              onCancel={closeWhy}
            />
          </div>
        ) : (
          it.notes && (
            <button onClick={() => !readOnly && setEditing(true)} className="mt-2 block w-full text-left text-[13.5px] leading-snug text-fg/85 italic">
              “
              {mentionParts(it.notes, people).map((p, i) =>
                p.who ? (
                  <span key={i} className="rounded bg-accent/12 px-1 font-semibold text-accent not-italic">
                    {p.text}
                  </span>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
              ”
            </button>
          )
        )}

        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!(e.target as HTMLElement).closest("button")) setOpen((o) => !o);
          }}
          className="-mx-3.5 -mb-3.5 mt-1.5 flex items-center gap-1.5 rounded-b-2xl px-3.5 pt-1 pb-2.5 hover:bg-surface-2/50"
        >
          {(!readOnly || mustOn) && (
            <button
              onClick={() => !readOnly && onMustDo()}
              title={mustOn ? "Must do: make sure this gets on a day" : "Mark as a must do"}
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold ${mustOn ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
            >
              <Star className={`size-3.5 ${mustOn ? "fill-current" : ""}`} /> {mustOn ? "Must do" : "Must do?"}
            </button>
          )}
          {group && (
            <div className="flex items-center gap-1">
              {votes.length > 0 && (
                <span className="flex -space-x-1.5" title={`Wanted by ${votes.join(", ")}`}>
                  {votes.map((n) => (
                    <Avatar key={n} name={n} />
                  ))}
                </span>
              )}
              {me && !readOnly && (
                <button
                  onClick={onVote}
                  title={mine ? "Remove your vote" : "I want to do this"}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold ${mine ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
                >
                  <ThumbsUp className="size-3.5" /> {votes.length || ""}
                </button>
              )}
            </div>
          )}
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-fg">
            {open ? "Less" : "Details"}
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-4 border-t border-line px-3.5 py-3 text-[13px]">
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">Recommendation</h3>
            {best && isGoodFit(best.fit) ? (
              <p className="mb-1.5">
                Best on <b>{dayShort(best.date)}</b>
                {best.title && <span className="text-muted"> · {best.title}</span>}
              </p>
            ) : (
              <p className="mb-1.5 text-muted">Nothing planned nearby yet, so no day stands out.</p>
            )}
            <ul className="space-y-1">
              {booked && line("good", `Booked (${bookedText}): ${booked.res.title}`, "booked")}
              {good.slice(0, 2).map((r, i) => line("good", r.text, `g${i}`))}
              {warn.map((b, i) => line("warn", b.text, `w${i}`))}
              {ruledOut.length > 0 && line("out", `${ruledOut[0].fit.blockers[0].text}: ${ruledOut.map((d) => dayShort(d.date)).join(", ")}`, "out")}
            </ul>
          </section>
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">About</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {it.address && (
                <>
                  <dt className="text-muted">Address</dt>
                  <dd>{it.address}</dd>
                </>
              )}
              {facts.stay && (
                <>
                  <dt className="text-muted">Typical visit</dt>
                  <dd>{facts.stay >= 60 ? `About ${Math.round((facts.stay / 60) * 2) / 2} h` : `About ${facts.stay} min`}</dd>
                </>
              )}
              {facts.best && (
                <>
                  <dt className="text-muted">Timing</dt>
                  <dd>{BEST_TIME[facts.best]}</dd>
                </>
              )}
              {facts.closed?.length ? (
                <>
                  <dt className="text-muted">Closed</dt>
                  <dd>{facts.closed.map((d) => WEEKDAYS[d]).join(", ")}</dd>
                </>
              ) : null}
              {(facts.book || booked) && (
                <>
                  <dt className="text-muted">Tickets</dt>
                  <dd>{booked ? `Booked · ${bookedText}${booked.res.confirmation ? ` · #${booked.res.confirmation}` : ""}` : "Book ahead"}</dd>
                </>
              )}
              {group && by && (
                <>
                  <dt className="text-muted">Added by</dt>
                  <dd>{by === me ? "You" : by}</dd>
                </>
              )}
            </dl>
            <div className="mt-2.5 flex gap-2">
              <button onClick={onOpen} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] hover:border-accent">
                <MapIcon className="size-3.5" /> Show on map
              </button>
              {it.kind === "place" && (
                <a href={googleMapsLink(it)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] hover:border-accent">
                  <ExternalLink className="size-3.5" /> Google Maps
                </a>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
