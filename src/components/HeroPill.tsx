import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Round icon button over the cover photo; its label slides out on hover / keyboard focus. */
const shell =
  "group/pill flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-black/35 px-2.5 text-white backdrop-blur transition-colors duration-300 hover:bg-black/55 focus-visible:bg-black/55 focus-visible:outline-none";
const labelCls =
  "max-w-0 overflow-hidden whitespace-nowrap text-[13px] font-semibold opacity-0 transition-[max-width,opacity,margin] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/pill:delay-0 motion-reduce:transition-none group-hover/pill:ml-1.5 group-hover/pill:max-w-48 group-hover/pill:opacity-100 group-focus-visible/pill:ml-1.5 group-focus-visible/pill:max-w-48 group-focus-visible/pill:opacity-100";

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
      <span className={labelCls}>{label}</span>
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
