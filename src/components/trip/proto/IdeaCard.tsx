// PROTOTYPE (proto/trip-focus): one idea. Folded: name, town and country, category (editable), your why,
// must-do and votes, the day button and a ⋯ menu. Unfolded: a Recommendation section (good / watch out /
// won't work, each with an icon and a word, not just a colour) and About (address, visit length, links).
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Map as MapIcon,
  MoreHorizontal,
  Pencil,
  Star,
  ThumbsUp,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { googleMapsLink } from "../../../lib/photon";
import { factsOf, isGoodFit } from "../../../lib/protoFit";
import { useCardStyle } from "../../../lib/protoTripLayout";
import {
  addedByOf,
  autoGroupOf,
  GROUP_LABEL,
  GROUP_ORDER,
  hasOwnGroup,
  isMustDo,
  mentionParts,
  votesOf,
  type BookingState,
  type Group,
  type Answer,
} from "../../../lib/protoIdeas";
import { Avatar, MentionInput } from "./MentionInput";
import { DayMenu, dayShort, type DayFit } from "./DayMenu";
import { IdeaFitCard, type AddOptions } from "./IdeaFitCard";
import type { Idea } from "./IdeasShelf";

const BEST_TIME = {
  morning: "Best early in the day",
  sunset: "Best around sunset",
  evening: "Best in the evening",
} as const;
const WEEKDAYS = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

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
  answers,
  onAnswer,
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
  onAdd: (dayKey: string, opts?: AddOptions) => void;
  /** Each person's answer in the poll (the "fit" card) */
  answers: Record<string, Answer>;
  onAnswer: (a: Answer) => void;
  onOpen: () => void;
  onVote: () => void;
  onMustDo: () => void;
  onWhy: (text: string) => void;
  onGroup: (g: Group | undefined) => void;
  onRemove: () => void;
  onDoneWhy: () => void;
}) {
  const it = idea.item;
  const [style] = useCardStyle();
  if (style === "fit")
    return (
      <IdeaFitCard
        idea={idea}
        where={where}
        days={days}
        best={best}
        people={people}
        me={me}
        answers={answers}
        readOnly={readOnly}
        highlight={highlight}
        selected={selected}
        booking={booking}
        startWhy={startWhy}
        onAdd={onAdd}
        onOpen={onOpen}
        onAnswer={onAnswer}
        onWhy={onWhy}
        onRemove={onRemove}
        onDoneWhy={onDoneWhy}
      />
    );
  const group = people.length >= 2;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<null | "main" | "category">(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) =>
      box.current && !box.current.contains(e.target as Node) && setMenu(null);
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
        <button
          onClick={() => (onGroup(undefined), setMenu(null))}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2"
        >
          <span className="w-3.5">
            {!hasOwnGroup(it) && <Check className="size-3.5 text-accent" />}
          </span>
          <span>
            Automatic{" "}
            <span className="text-muted">({GROUP_LABEL[autoGroupOf(it)]})</span>
          </span>
        </button>
      </li>
      <li className="my-1 border-t border-line" aria-hidden />
      {GROUP_ORDER.map((g) => (
        <li key={g}>
          <button
            onClick={() => (onGroup(g), setMenu(null))}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2"
          >
            <span className="w-3.5">
              {hasOwnGroup(it) && idea.group === g && (
                <Check className="size-3.5 text-accent" />
              )}
            </span>
            {GROUP_LABEL[g]}
          </button>
        </li>
      ))}
    </ul>
  );

  // Recommendation: the best day's reasons, then any day this can't go on
  const good = best && isGoodFit(best.fit) ? best.fit.reasons : [];
  const booked = booking.kind === "booked" ? booking : null;
  const warn = best
    ? best.fit.blockers.filter(
        (b) =>
          (!best.fit.out || b.weight < 100) &&
          !(booked && b.text === "Book ahead"),
      )
    : [];
  const bookedDay = booked?.date
    ? days.find((d) => d.date === booked.date)
    : undefined;
  const bookedText = booked
    ? booked.date
      ? `${dayShort(booked.date)}${booked.time ? `, ${booked.time}` : ""}`
      : "no date yet"
    : "";
  const ruledOut = days.filter((d) => d.fit.out);
  // The badge already says it's booked, so the glance line says how that day works out instead
  const glanceDay = bookedDay ?? (best && isGoodFit(best.fit) ? best : null);
  const glanceGood = glanceDay?.fit.reasons[0]
    ? `${dayShort(glanceDay.date)} · ${glanceDay.fit.reasons[0].text}`
    : null;
  const firstWarn = warn.find((b) => b.text !== "Book ahead");
  const glanceBad = ruledOut.length
    ? {
        text: `${ruledOut[0].fit.blockers[0].text} (${ruledOut.map((d) => dayShort(d.date)).join(", ")})`,
        out: true,
      }
    : firstWarn
      ? { text: firstWarn.text, out: false }
      : null;
  const line = (kind: "good" | "warn" | "out", text: string, key: string) => (
    <li
      key={key}
      className={`flex items-start gap-2 ${kind === "good" ? "text-accent" : kind === "out" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}
    >
      {kind === "good" ? (
        <Check className="mt-0.5 size-3.5 shrink-0" />
      ) : kind === "out" ? (
        <X className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
      )}
      <span>
        <b className="font-semibold">
          {kind === "good"
            ? "Good: "
            : kind === "out"
              ? "Won't work: "
              : "Watch out: "}
        </b>
        <span className="text-fg/85">{text}</span>
      </span>
    </li>
  );

  if (style === "zones") {
    // Four zones, top to bottom: what it is · how the group feels · why and fit · decision.
    // Folded, each zone shows its one-line summary; unfolded, each grows in place with its detail.
    const visit = facts.stay
      ? facts.stay >= 60
        ? `About ${Math.round((facts.stay / 60) * 2) / 2} h`
        : `About ${facts.stay} min`
      : null;
    const factBits = [
      visit,
      facts.best ? BEST_TIME[facts.best] : null,
      facts.closed?.length
        ? `Closed ${facts.closed.map((d) => WEEKDAYS[d]).join(", ")}`
        : null,
    ].filter(Boolean) as string[];
    const zoneLabel = (t: string) =>
      open && (
        <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
          {t}
        </h3>
      );
    const zone = open
      ? "border-t border-line px-3.5 py-3"
      : "px-3.5 pt-2.5 first:pt-3.5";
    const why = whyOpen ? (
      <MentionInput
        autoFocus
        initial={it.notes ?? ""}
        people={people}
        placeholder={
          group
            ? "Why this? Type @ to mention someone · Enter to save"
            : "Why this? · Enter to save"
        }
        onSave={(t) => (t !== (it.notes ?? "") && onWhy(t), closeWhy())}
        onCancel={closeWhy}
      />
    ) : it.notes ? (
      <button
        onClick={() => !readOnly && setEditing(true)}
        className="block w-full text-left text-[13.5px] leading-snug text-fg/85 italic"
      >
        “
        {mentionParts(it.notes, people).map((p, i) =>
          p.who ? (
            <span
              key={i}
              className="rounded bg-accent/12 px-1 font-semibold text-accent not-italic"
            >
              {p.text}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
        ”
        {group && by && (
          <span className="text-muted not-italic">
            {" "}
            · {by === me ? "you" : by}
          </span>
        )}
      </button>
    ) : open && !readOnly ? (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
      >
        <Pencil className="size-3.5" /> Add why
      </button>
    ) : null;
    const mustBtn = (!readOnly || mustOn) && (
      <button
        onClick={() => !readOnly && onMustDo()}
        title={
          mustOn ? "Must do: make sure this gets on a day" : "Mark as a must do"
        }
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold ${mustOn ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
      >
        <Star className={`size-3.5 ${mustOn ? "fill-current" : ""}`} />{" "}
        {mustOn ? "Must do" : "Must do?"}
      </button>
    );
    const voteBtn = group && me && !readOnly && (
      <button
        onClick={onVote}
        title={mine ? "Remove your vote" : "I want to do this"}
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold ${mine ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
      >
        <ThumbsUp className="size-3.5" /> {votes.length || ""}
      </button>
    );
    const ticket = booked
      ? {
          tone: "text-accent",
          text: `Booked · ${bookedText}${booked.res.confirmation ? ` · #${booked.res.confirmation}` : ""}`,
        }
      : booking.kind === "needed"
        ? {
            tone: "text-amber-700 dark:text-amber-300",
            text: "Book ahead · not booked yet",
          }
        : null;

    return (
      <div
        id={`item-${it.id}`}
        onClick={(e) =>
          !(e.target as HTMLElement).closest("button,a,input,select,ul") &&
          onOpen()
        }
        className={`cursor-pointer rounded-2xl border bg-surface transition-all duration-500 ${
          highlight === "lit" || selected
            ? "border-accent ring-4 ring-accent/20"
            : highlight === "new"
              ? "border-accent"
              : mustOn
                ? "border-amber-400/70"
                : "border-line"
        }`}
      >
        {/* 1 · What it is */}
        <div className={open ? "px-3.5 pt-3.5 pb-3" : "px-3.5 pt-3.5"}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 truncate text-[16px] font-semibold">
                  {it.name}
                </p>
                {booking.kind === "needed" && (
                  <span
                    className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/25 px-2 py-0.5 text-[11.5px] font-semibold text-amber-800 dark:text-amber-300"
                    title="Needs tickets or a reservation"
                  >
                    <Ticket className="size-3" /> Not booked
                  </span>
                )}
                {booked && (
                  <span
                    className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11.5px] font-semibold text-accent"
                    title={booked.res.title}
                  >
                    <Check className="size-3" /> Booked · {bookedText}
                  </span>
                )}
              </div>
              <div
                ref={menu === "category" ? box : undefined}
                className="relative mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted"
              >
                {where && <span>{where}</span>}
                {where && <span aria-hidden>·</span>}
                <button
                  onClick={() =>
                    !readOnly &&
                    setMenu(menu === "category" ? null : "category")
                  }
                  title={readOnly ? undefined : "Change category"}
                  className="flex items-center gap-0.5 rounded hover:text-fg"
                >
                  {GROUP_LABEL[idea.group]}
                  {!readOnly && <ChevronDown className="size-3" />}
                </button>
                {menu === "category" && categoryMenu}
              </div>
            </div>
            {!readOnly && (
              <div
                ref={menu === "main" ? box : undefined}
                className="relative flex shrink-0 items-center gap-1"
              >
                <button
                  onClick={() => setMenu(menu === "main" ? null : "main")}
                  aria-label="More"
                  className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
                >
                  <MoreHorizontal className="size-4" />
                </button>
                {menu === "main" && (
                  <div className="absolute top-full right-0 z-40 mt-1 w-48 rounded-xl border border-line bg-surface p-1 shadow-xl">
                    <button
                      onClick={() => (setEditing(true), setMenu(null))}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2"
                    >
                      <Pencil className="size-3.5" />{" "}
                      {it.notes ? "Edit why" : "Add why"}
                    </button>
                    <button
                      onClick={() => (onOpen(), setMenu(null))}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2"
                    >
                      <MapIcon className="size-3.5" /> Show on map
                    </button>
                    <button
                      onClick={() => (onRemove(), setMenu(null))}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-red-500 hover:bg-surface-2"
                    >
                      <Trash2 className="size-3.5" /> Remove idea
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Grows: the place's facts, address and links */}
          {open && (
            <div
              className="mt-2 space-y-1 text-[13px]"
              onClick={(e) => e.stopPropagation()}
            >
              {factBits.length > 0 && (
                <p className="text-fg/85">{factBits.join(" · ")}</p>
              )}
              {it.address && <p className="text-muted">{it.address}</p>}
              <div className="flex gap-3 pt-0.5 text-[12.5px]">
                <button
                  onClick={onOpen}
                  className="flex items-center gap-1 text-accent hover:underline"
                >
                  <MapIcon className="size-3.5" /> Show on map
                </button>
                {it.kind === "place" && (
                  <a
                    href={googleMapsLink(it)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-accent hover:underline"
                  >
                    <ExternalLink className="size-3.5" /> Google Maps
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2 · How the group feels */}
        <div className={zone} onClick={(e) => open && e.stopPropagation()}>
          {zoneLabel(group ? "How the group feels" : "How you feel")}
          {open && group ? (
            <>
              <ul className="space-y-1.5">
                {[...people]
                  .sort((a, b) => (a === me ? -1 : b === me ? 1 : 0))
                  .map((p) => {
                    const wants = votes.includes(p);
                    return (
                      <li
                        key={p}
                        className="flex items-center gap-2 text-[13px]"
                      >
                        <Avatar name={p} />
                        <span className={p === me ? "font-semibold" : ""}>
                          {p === me ? "You" : p}
                        </span>
                        {by === p && (
                          <span className="text-[11.5px] text-muted">
                            added it
                          </span>
                        )}
                        <span
                          className={`ml-auto text-[12.5px] ${wants ? "font-semibold text-accent" : "text-muted"}`}
                        >
                          {wants ? "Wants to go" : "No answer yet"}
                        </span>
                        {p === me && !readOnly && (
                          <button
                            onClick={onVote}
                            aria-label={
                              mine ? "Remove your vote" : "I want to do this"
                            }
                            className={`grid size-7 place-items-center rounded-full ${mine ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
                          >
                            <ThumbsUp className="size-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
              <div className="mt-2">{mustBtn}</div>
            </>
          ) : (
            <div className="-ml-2 flex items-center gap-1.5">
              {mustBtn}
              {group && votes.length > 0 && (
                <span
                  className="flex -space-x-1.5 pl-1"
                  title={`Wanted by ${votes.join(", ")}`}
                >
                  {votes.map((n) => (
                    <Avatar key={n} name={n} />
                  ))}
                </span>
              )}
              {voteBtn}
            </div>
          )}
        </div>

        {/* 3 · Why and fit */}
        {(why || glanceGood || glanceBad || open) && (
          <div className={zone} onClick={(e) => open && e.stopPropagation()}>
            {zoneLabel("Why and fit")}
            {why}
            {open ? (
              <div className={why ? "mt-2.5" : ""}>
                {best && isGoodFit(best.fit) ? (
                  <p className="mb-1.5 text-[13px]">
                    Best on <b>{dayShort(best.date)}</b>
                    {best.title && (
                      <span className="text-muted"> · {best.title}</span>
                    )}
                  </p>
                ) : (
                  <p className="mb-1.5 text-[13px] text-muted">
                    Nothing planned nearby yet, so no day stands out.
                  </p>
                )}
                <ul className="space-y-1 text-[13px]">
                  {good
                    .slice(0, 2)
                    .map((r, i) => line("good", r.text, `g${i}`))}
                  {warn
                    .filter((b) => b.text !== "Book ahead")
                    .map((b, i) => line("warn", b.text, `w${i}`))}
                  {ruledOut.length > 0 &&
                    line(
                      "out",
                      `${ruledOut[0].fit.blockers[0].text}: ${ruledOut.map((d) => dayShort(d.date)).join(", ")}`,
                      "out",
                    )}
                </ul>
              </div>
            ) : (
              (glanceGood || glanceBad) && (
                <div
                  className={`flex min-w-0 items-center gap-x-4 text-[12.5px] ${why ? "mt-2" : ""}`}
                >
                  {glanceGood && (
                    <span className="flex min-w-0 items-center gap-1.5 text-accent">
                      <Check className="size-3.5 shrink-0" />
                      <span className="truncate">{glanceGood}</span>
                    </span>
                  )}
                  {glanceBad && (
                    <span
                      className={`flex min-w-0 shrink-0 items-center gap-1.5 ${glanceBad.out ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}
                    >
                      {glanceBad.out ? (
                        <X className="size-3.5 shrink-0" />
                      ) : (
                        <CircleAlert className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate">{glanceBad.text}</span>
                    </span>
                  )}
                </div>
              )
            )}
          </div>
        )}

        {/* 4 · Decision: tickets (when they matter) and the day */}
        {(!readOnly || (open && ticket)) && (
          <div
            className={`${zone} ${open ? "" : "pb-3"}`}
            onClick={(e) => open && e.stopPropagation()}
          >
            {zoneLabel("Decision")}
            <div className="flex items-center gap-2">
              {open && ticket && (
                <span
                  className={`flex min-w-0 items-center gap-1.5 text-[13px] ${ticket.tone}`}
                >
                  <Ticket className="size-3.5 shrink-0" />
                  <span className="truncate">{ticket.text}</span>
                </span>
              )}
              {!readOnly && (
                <div className="ml-auto">
                  <DayMenu
                    days={days}
                    best={best}
                    booked={bookedDay}
                    onAdd={onAdd}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-center gap-1 rounded-b-2xl border-t border-line py-1.5 text-[12px] text-muted hover:bg-surface-2/60 hover:text-fg"
        >
          {open ? "Show less" : "Show more"}
          <ChevronDown
            className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    );
  }

  return (
    // Clicking the card selects it (his place card opens over the map); the strip along the bottom unfolds it
    <div
      id={`item-${it.id}`}
      onClick={(e) =>
        !(e.target as HTMLElement).closest("button,a,input,select,ul") &&
        onOpen()
      }
      className={`cursor-pointer rounded-2xl border bg-surface transition-all duration-500 ${
        highlight === "lit" || selected
          ? "border-accent ring-4 ring-accent/20"
          : highlight === "new"
            ? "border-accent"
            : mustOn
              ? "border-amber-400/70"
              : "border-line"
      }`}
    >
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {/* The booking state sits right by the name: amber until it's booked, green once it is */}
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-[16px] font-semibold">
                {it.name}
              </p>
              {booking.kind === "needed" && (
                <span
                  className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/25 px-2 py-0.5 text-[11.5px] font-semibold text-amber-800 dark:text-amber-300"
                  title="Needs tickets or a reservation"
                >
                  <Ticket className="size-3" /> Not booked
                </span>
              )}
              {booked && (
                <span
                  className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11.5px] font-semibold text-accent"
                  title={booked.res.title}
                >
                  <Check className="size-3" /> Booked · {bookedText}
                </span>
              )}
            </div>
            <div
              ref={menu === "category" ? box : undefined}
              className="relative mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted"
            >
              {where && <span>{where}</span>}
              {where && <span aria-hidden>·</span>}
              <button
                onClick={() =>
                  !readOnly && setMenu(menu === "category" ? null : "category")
                }
                title={readOnly ? undefined : "Change category"}
                className="flex items-center gap-0.5 rounded hover:text-fg"
              >
                {GROUP_LABEL[idea.group]}
                {!readOnly && <ChevronDown className="size-3" />}
              </button>
              {menu === "category" && categoryMenu}
            </div>
          </div>
          {!readOnly && (
            <div
              ref={menu === "main" ? box : undefined}
              className="relative flex shrink-0 items-center gap-1"
            >
              <button
                onClick={() => setMenu(menu === "main" ? null : "main")}
                aria-label="More"
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
              >
                <MoreHorizontal className="size-4" />
              </button>
              {menu === "main" && (
                <div className="absolute top-full right-0 z-40 mt-1 w-48 rounded-xl border border-line bg-surface p-1 shadow-xl">
                  <button
                    onClick={() => (setEditing(true), setMenu(null))}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2"
                  >
                    <Pencil className="size-3.5" />{" "}
                    {it.notes ? "Edit why" : "Add why"}
                  </button>
                  <button
                    onClick={() => (onOpen(), setMenu(null))}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2"
                  >
                    <MapIcon className="size-3.5" /> Show on map
                  </button>
                  <button
                    onClick={() => (onRemove(), setMenu(null))}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-red-500 hover:bg-surface-2"
                  >
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
              placeholder={
                group
                  ? "Why this? Type @ to mention someone · Enter to save"
                  : "Why this? · Enter to save"
              }
              onSave={(t) => (t !== (it.notes ?? "") && onWhy(t), closeWhy())}
              onCancel={closeWhy}
            />
          </div>
        ) : (
          it.notes && (
            <button
              onClick={() => !readOnly && setEditing(true)}
              className="mt-2 block w-full text-left text-[13.5px] leading-snug text-fg/85 italic"
            >
              “
              {mentionParts(it.notes, people).map((p, i) =>
                p.who ? (
                  <span
                    key={i}
                    className="rounded bg-accent/12 px-1 font-semibold text-accent not-italic"
                  >
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

        {/* At a glance: the strongest reason for and the strongest concern (the badge already covers booking) */}
        {(glanceGood || glanceBad) && (
          <div className="mt-2 flex min-w-0 items-center gap-x-4 text-[12.5px]">
            {glanceGood && (
              <span className="flex min-w-0 items-center gap-1.5 text-accent">
                <Check className="size-3.5 shrink-0" />
                <span className="truncate">{glanceGood}</span>
              </span>
            )}
            {glanceBad && (
              <span
                className={`flex min-w-0 shrink-0 items-center gap-1.5 ${glanceBad.out ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}
              >
                {glanceBad.out ? (
                  <X className="size-3.5 shrink-0" />
                ) : (
                  <CircleAlert className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{glanceBad.text}</span>
              </span>
            )}
          </div>
        )}

        {/* Read top to bottom, then decide: the day button closes the card at the bottom right */}
        <div className="mt-2.5 flex items-center gap-1.5">
          {(!readOnly || mustOn) && (
            <button
              onClick={() => !readOnly && onMustDo()}
              title={
                mustOn
                  ? "Must do: make sure this gets on a day"
                  : "Mark as a must do"
              }
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold ${mustOn ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
            >
              <Star className={`size-3.5 ${mustOn ? "fill-current" : ""}`} />{" "}
              {mustOn ? "Must do" : "Must do?"}
            </button>
          )}
          {group && (
            <div className="flex items-center gap-1">
              {votes.length > 0 && (
                <span
                  className="flex -space-x-1.5"
                  title={`Wanted by ${votes.join(", ")}`}
                >
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
          {!readOnly && (
            <div className="ml-auto">
              <DayMenu
                days={days}
                best={best}
                booked={bookedDay}
                onAdd={onAdd}
              />
            </div>
          )}
        </div>
      </div>

      {open && (
        <div
          className="space-y-4 border-t border-line px-3.5 pt-3 pb-1 text-[13px]"
          onClick={(e) => e.stopPropagation()}
        >
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
              Recommendation
            </h3>
            {best && isGoodFit(best.fit) ? (
              <p className="mb-1.5">
                Best on <b>{dayShort(best.date)}</b>
                {best.title && (
                  <span className="text-muted"> · {best.title}</span>
                )}
              </p>
            ) : (
              <p className="mb-1.5 text-muted">
                Nothing planned nearby yet, so no day stands out.
              </p>
            )}
            <ul className="space-y-1">
              {booked &&
                line(
                  "good",
                  `Booked (${bookedText}): ${booked.res.title}`,
                  "booked",
                )}
              {good.slice(0, 2).map((r, i) => line("good", r.text, `g${i}`))}
              {warn.map((b, i) => line("warn", b.text, `w${i}`))}
              {ruledOut.length > 0 &&
                line(
                  "out",
                  `${ruledOut[0].fit.blockers[0].text}: ${ruledOut.map((d) => dayShort(d.date)).join(", ")}`,
                  "out",
                )}
            </ul>
          </section>
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
              About
            </h3>
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
                  <dd>
                    {facts.stay >= 60
                      ? `About ${Math.round((facts.stay / 60) * 2) / 2} h`
                      : `About ${facts.stay} min`}
                  </dd>
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
                  <dd>
                    {booked
                      ? `Booked · ${bookedText}${booked.res.confirmation ? ` · #${booked.res.confirmation}` : ""}`
                      : "Book ahead"}
                  </dd>
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
              <button
                onClick={onOpen}
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] hover:border-accent"
              >
                <MapIcon className="size-3.5" /> Show on map
              </button>
              {it.kind === "place" && (
                <a
                  href={googleMapsLink(it)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] hover:border-accent"
                >
                  <ExternalLink className="size-3.5" /> Google Maps
                </a>
              )}
            </div>
          </section>
        </div>
      )}
      {/* Its own full-width strip at the bottom, apart from the actions, so unfolding is never a mis-click.
          Open, the details carry the one divider and the strip sits under them without another. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-center justify-center gap-1 rounded-b-2xl py-1.5 text-[12px] text-muted hover:bg-surface-2/60 hover:text-fg ${open ? "" : "border-t border-line"}`}
      >
        {open ? "Less" : "Details"}
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}
