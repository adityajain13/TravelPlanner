/** On a day where the group splits: "Everyone", or one person's view of the day. Shown on this device only. */
export function WhoChips({ people, viewing, onViewing }: { people: string[]; viewing?: string; onViewing: (person: string | undefined) => void }) {
  const chip = (on: boolean) =>
    `rounded-full px-2.5 py-1 text-[12.5px] font-semibold transition-colors ${on ? "bg-accent text-on-accent" : "bg-surface-2 text-muted hover:text-fg"}`;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 pr-3 pl-14" role="group" aria-label="Whose day to show">
      <button aria-pressed={!viewing} onClick={() => onViewing(undefined)} className={chip(!viewing)}>
        Everyone
      </button>
      {people.map((person) => (
        <button key={person} aria-pressed={viewing === person} onClick={() => onViewing(person)} className={chip(viewing === person)}>
          {person}
        </button>
      ))}
    </div>
  );
}
