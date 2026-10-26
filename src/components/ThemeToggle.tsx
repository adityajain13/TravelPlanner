import { Moon, MoonStar, Sun } from "lucide-react";
import { NEXT, THEME_LABEL, type Theme } from "../lib/theme";

/** Icon for the theme you'd switch to. */
export const ThemeIcon = ({ theme, className }: { theme: Theme; className?: string }) => {
  const next = NEXT[theme];
  return next === "light" ? <Sun className={className} /> : next === "amoled" ? <MoonStar className={className} /> : <Moon className={className} />;
};

export function ThemeToggle({ theme, toggle }: { theme: Theme; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      aria-label={`Switch to ${THEME_LABEL[NEXT[theme]].toLowerCase()}`}
      title={`Switch to ${THEME_LABEL[NEXT[theme]].toLowerCase()}`}
    >
      <ThemeIcon theme={theme} className="size-4" />
    </button>
  );
}
