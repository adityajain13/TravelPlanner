import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Round icon button over the cover photo; its label slides out on hover / keyboard focus. */
const shell =
  "group/pill flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-black/35 px-2.5 text-white backdrop-blur transition-colors duration-300 hover:bg-black/55 focus-visible:bg-black/55 focus-visible:outline-none";
// The label column animates 0fr → 1fr, i.e. to the label's real width, so the whole duration is
// visible (a max-width transition reached the short label's width in the first ~100ms).
const labelWrap =
  "grid grid-cols-[0fr] transition-[grid-template-columns] duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none group-hover/pill:grid-cols-[1fr] group-focus-visible/pill:grid-cols-[1fr]";
const labelCls =
  "min-w-0 overflow-hidden whitespace-nowrap text-[13px] font-semibold opacity-0 transition-opacity duration-500 group-hover/pill:opacity-100 group-hover/pill:delay-150 group-focus-visible/pill:opacity-100";

interface Props {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  to?: string;
  className?: string;
  title?: string;
}

export function HeroPill({ icon, label, onClick, to, className = "", title }: Props) {
  const inner = (
    <>
      <span className="grid shrink-0 place-items-center [&>svg]:size-4">{icon}</span>
      <span className={labelWrap}>
        <span className={labelCls}>
          <span className="pl-1.5">{label}</span>
        </span>
      </span>
    </>
  );
  if (to)
    return (
      <Link to={to} className={`${shell} ${className}`} aria-label={label} title={title}>
        {inner}
      </Link>
    );
  if (!onClick)
    return (
      <span tabIndex={0} className={`${shell} cursor-default ${className}`} aria-label={label} title={title}>
        {inner}
      </span>
    );
  return (
    <button onClick={onClick} className={`${shell} ${className}`} aria-label={label} title={title}>
      {inner}
    </button>
  );
}
