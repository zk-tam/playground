"use client";

import { useState, type MouseEvent } from "react";

export const THEMES = ["light", "dark", "blueprint"] as const;
type Theme = (typeof THEMES)[number];

// How each theme introduces itself on its swatch: its page colour in the top
// left corner, the colour it writes or accents in at the bottom right, and the
// two blending across the diagonal.
const blend = (page: string, mark: string) =>
  `linear-gradient(135deg, ${page} 22%, ${mark} 78%)`;

const SWATCH: Record<Theme, string> = {
  light: blend("#ffffff", "#111111"),
  dark: blend("#0a0a0a", "#ededed"),
  blueprint: blend("#0a1120", "#5cc8ff"),
};

/**
 * One swatch that opens into three. Choosing a theme repaints the page with a
 * circular reveal from the swatch that was pressed.
 */
export function ThemePicker() {
  const [open, setOpen] = useState(false);

  function choose(theme: Theme, event: MouseEvent<HTMLButtonElement>) {
    // Closed, the only swatch showing is the current one: pressing it opens.
    if (!open) return setOpen(true);
    setOpen(false);

    const root = document.documentElement;
    if (root.getAttribute("data-theme") === theme) return;
    const apply = () => {
      root.setAttribute("data-theme", theme);
      try {
        localStorage.setItem("theme", theme);
      } catch {}
    };

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || still) return apply();

    const box = event.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    // Freeze CSS transitions so the snapshot captures final colours.
    root.setAttribute("data-switching", "");
    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 700,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {});
    transition.finished.finally(() => root.removeAttribute("data-switching"));
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      data-open={open || undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
      className="picker -mr-2 flex h-8 items-center rounded-full px-1 transition-[background-color] duration-300 data-open:bg-sunken"
    >
      {THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          data-swatch={theme}
          aria-label={`${theme[0].toUpperCase()}${theme.slice(1)} theme`}
          onClick={(event) => choose(theme, event)}
          style={{ backgroundImage: SWATCH[theme] }}
          className="h-[18px] shrink-0 rounded-[6px] shadow-[0_0_0_1px_color-mix(in_oklab,var(--ink)_22%,transparent)] hover:scale-110 active:scale-90"
        />
      ))}
    </div>
  );
}
