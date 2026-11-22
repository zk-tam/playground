"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { modules, type Module } from "@/modules/registry";

function Mark({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const HOME = (
  <Mark>
    <path d="M4 10.8 12 4l8 6.8V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </Mark>
);

const MARKS: Record<Module["icon"], ReactNode> = {
  // A clapperboard: the slate, and the striped arm resting on top of it.
  clapper: (
    <Mark>
      <path d="M4 10.5h16V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="m4 10.5-.6-3.3a1 1 0 0 1 .8-1.15l13.8-2.5a1 1 0 0 1 1.15.8l.45 2.55z" />
      <path d="m8.3 5.2 2.2 4.3M13.2 4.3l2.2 4.3" />
    </Mark>
  ),
};

const NAME_MS = 1600; // how long a place's name stays up after arriving there

/**
 * The way around the site: a strip of glass floating at the bottom of every
 * page, with one icon per place.
 *
 * Where you are is marked by a drop of clearer glass under the icon. Moving
 * to another place, the drop does not slide: its front edge runs ahead and
 * its back edge catches up, so it stretches and settles like liquid.
 *
 * The dock itself says nothing. A place's name floats up above it while the
 * pointer is on its icon, and for a moment after you arrive.
 */
export function Dock() {
  const path = usePathname();
  const places = [
    { href: "/", title: "Home", mark: HOME },
    ...modules.map((module) => ({
      href: `/${module.slug}`,
      title: module.title,
      mark: MARKS[module.icon],
    })),
  ];
  const here = places.findIndex(({ href }) =>
    href === "/" ? path === "/" : path.startsWith(href),
  );

  // Which way the drop last travelled, and whether we have just arrived.
  const [seen, setSeen] = useState(here);
  const [heading, setHeading] = useState<"left" | "right">("right");
  const [arrived, setArrived] = useState(false);
  if (here !== seen) {
    setHeading(here > seen ? "right" : "left");
    setSeen(here);
    setArrived(here >= 0);
  }
  useEffect(() => {
    if (!arrived) return;
    const id = setTimeout(() => setArrived(false), NAME_MS);
    return () => clearTimeout(id);
  }, [arrived, here]);

  // The name on show: the place under the pointer, or the one just reached.
  const [over, setOver] = useState<number | null>(null);
  const naming = over ?? (arrived ? here : null);
  // Keep the last name while it fades, so it does not blank mid-fade.
  const [named, setNamed] = useState(Math.max(0, here));
  if (naming !== null && naming !== named) setNamed(naming);

  // The glass catches the light from wherever the pointer is.
  function light(event: PointerEvent<HTMLUListElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--light", `${event.clientX - box.left}px`);
  }

  return (
    <nav
      aria-label="Site"
      className="dock fixed inset-x-0 bottom-5 z-30 flex justify-center px-4 pb-[env(safe-area-inset-bottom)] transition-[translate,opacity] duration-500 ease-out-quint"
    >
      <div
        className="relative"
        style={{ "--count": places.length, "--at": Math.max(0, here) } as CSSProperties}
      >
        <p
          aria-hidden
          style={{ "--at": named } as CSSProperties}
          className={`dock-name glass ${naming === null ? "" : "is-up"}`}
        >
          {places[named]?.title}
        </p>

        <ul
          onPointerMove={light}
          onPointerLeave={() => setOver(null)}
          className="glass relative flex items-center gap-1 rounded-full p-1.5"
        >
          <li
            aria-hidden
            data-heading={heading}
            className={`dock-drop ${here < 0 ? "opacity-0" : ""}`}
          />
          {places.map(({ href, title, mark }, index) => (
            <li key={href}>
              <Link
                href={href}
                aria-label={title}
                aria-current={index === here ? "page" : undefined}
                onPointerEnter={(event) => event.pointerType === "mouse" && setOver(index)}
                onFocus={(event) => event.currentTarget.matches(":focus-visible") && setOver(index)}
                onBlur={() => setOver(null)}
                className={`relative grid size-11 place-items-center rounded-full transition-[color,scale] duration-300 ease-spring-soft active:scale-[0.86] active:duration-100 ${
                  index === here ? "text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {mark}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
