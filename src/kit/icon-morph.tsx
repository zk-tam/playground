"use client";

import { useId, useState, type ReactNode } from "react";
import { Bars, type Pose } from "./bars";

/* ── Bars ───────────────────────────────────────────────────────────────
   Poses are [width, x, y, rotate, opacity?] in a 24px box, from its centre. */

const MENU: [Pose, Pose][] = [
  [[16, 0, -5, 0], [17, 0, 0, 45]],
  [[16, 0, 0, 0], [0, 0, 0, 0, 0]],
  [[16, 0, 5, 0], [17, 0, 0, -45]],
];

const PLUS: [Pose, Pose][] = [
  [[16, 0, 0, 0], [9, -5.5, 2.5, 45]],
  [[16, 0, 0, 90], [17.5, 2.5, -0.5, 135]],
];

const CHEVRON: [Pose, Pose][] = [
  [[10, -3, 0, 45], [10, -3, 0, -45]],
  [[10, 3, 0, -45], [10, 3, 0, 45]],
];

// Shaft, two halves of the arrowhead, and the tray it lands in.
const DOWNLOAD: [Pose, Pose][] = [
  [[12, 0, -3, 90], [17.5, 2.5, -0.5, 135]],
  [[7.5, -2.4, 0.6, 45], [9, -5.5, 2.5, 45]],
  [[7.5, 2.4, 0.6, -45], [2, 2.5, -0.5, -45, 0]],
  [[15, 0, 8, 0], [4, 0, 8, 0, 0]],
];

/* ── Shapes ─────────────────────────────────────────────────────────── */

/** Play splits into two halves that square up into pause bars. */
function PlayPause({ on }: { on: boolean }) {
  const half =
    "absolute inset-0 bg-current transition-[clip-path] duration-500 ease-out-quint";
  return (
    <>
      <span
        className={half}
        style={{
          clipPath: on
            ? "polygon(21% 12%, 41% 12%, 41% 88%, 21% 88%)"
            : "polygon(24% 10%, 57% 30%, 57% 70%, 24% 90%)",
        }}
      />
      <span
        className={half}
        style={{
          clipPath: on
            ? "polygon(59% 12%, 79% 12%, 79% 88%, 59% 88%)"
            : "polygon(56% 29.4%, 90% 50%, 90% 50%, 56% 70.6%)",
        }}
      />
    </>
  );
}

/** The lens flattens into one stroke of the cross; the handle grows into the other. */
function SearchClose({ on }: { on: boolean }) {
  const base =
    "absolute top-1/2 left-1/2 rounded-full transition-[width,height,transform] duration-500 ease-spring-soft";
  return (
    <>
      <span
        className={`${base} shadow-[inset_0_0_0_2px_currentColor]`}
        style={{
          width: on ? 17 : 13,
          height: on ? 2 : 13,
          transform: `translate(-50%, -50%) translate(${on ? 0 : -2}px, ${on ? 0 : -2}px) rotate(-45deg)`,
        }}
      />
      <span
        className={`${base} bg-current`}
        style={{
          width: on ? 17 : 7,
          height: 2,
          transform: `translate(-50%, -50%) translate(${on ? 0 : 5.5}px, ${on ? 0 : 5.5}px) rotate(45deg)`,
        }}
      />
    </>
  );
}

/** A red dot squares off into a stop button. */
function RecordStop({ on }: { on: boolean }) {
  return (
    <span
      className={`absolute inset-0 m-auto size-[14px] transition-[border-radius,scale,background-color] duration-500 ease-spring-soft ${on ? "scale-90 rounded-[3px] bg-ink" : "scale-110 rounded-[7px] bg-danger"}`}
    />
  );
}

/** Four corners, each turning half a circle on the spot. */
function ExpandCollapse({ on }: { on: boolean }) {
  const corners = [
    ["top-[3px] left-[3px]", 0],
    ["top-[3px] right-[3px]", 90],
    ["right-[3px] bottom-[3px]", 180],
    ["bottom-[3px] left-[3px]", 270],
  ] as const;
  return corners.map(([place, turn], i) => (
    <span
      key={turn}
      style={{
        transform: `rotate(${turn + (on ? 180 : 0)}deg)`,
        transitionDelay: `${i * 30}ms`,
      }}
      className={`absolute size-[7px] rounded-tl-[2px] border-t-2 border-l-2 border-current transition-transform duration-500 ease-spring-soft ${place}`}
    />
  ));
}

function Svg({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`absolute inset-0 size-full ${className}`}
    >
      {children}
    </svg>
  );
}

/** A disc slides across the sun and bites it into a crescent; the rays retract. */
function SunMoon({ on }: { on: boolean }) {
  const mask = useId();
  return (
    <Svg className={`transition-transform duration-700 ease-spring-soft ${on ? "-rotate-90" : ""}`}>
      <mask id={mask}>
        <rect width="24" height="24" fill="white" stroke="none" />
        <circle
          r="8"
          cy="6"
          fill="black"
          stroke="none"
          className={`transition-transform duration-500 ease-out-quint ${on ? "translate-x-[17px]" : "translate-x-[32px]"}`}
        />
      </mask>
      <circle
        cx="12"
        cy="12"
        r="5"
        fill="currentColor"
        stroke="none"
        mask={`url(#${mask})`}
        className={`origin-center transition-transform duration-500 ease-spring-soft ${on ? "scale-[1.7]" : ""}`}
      />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        className={`origin-center transition-[transform,opacity] duration-500 ease-spring-soft ${on ? "scale-50 opacity-0" : ""}`}
      />
    </Svg>
  );
}

/** The upper lid swings down onto the lower one, and the lashes come out. */
function Eye({ on }: { on: boolean }) {
  return (
    <Svg>
      <path
        d="M2.5 12C5 7.8 8.2 5.5 12 5.5s7 2.3 9.5 6.5"
        className={`origin-center transition-transform duration-500 ease-spring-soft ${on ? "-scale-y-100" : ""}`}
      />
      <path d="M2.5 12c2.5 4.2 5.7 6.5 9.5 6.5s7-2.3 9.5-6.5" />
      <circle
        cx="12"
        cy="12"
        r="2.75"
        fill="currentColor"
        stroke="none"
        className={`origin-center transition-[transform,opacity] duration-300 ease-out-quint ${on ? "scale-0 opacity-0" : "delay-150"}`}
      />
      <path
        d="M12 18.5V21M6.6 16.9 5.2 19M17.4 16.9l1.4 2.1"
        className={`transition-[opacity,translate] duration-300 ease-out-quint ${on ? "delay-200" : "-translate-y-1 opacity-0"}`}
      />
    </Svg>
  );
}

/** The shackle lifts and swings open on its right leg. */
function Lock({ on }: { on: boolean }) {
  return (
    <Svg>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path
        d="M8 11V7.5a4 4 0 0 1 8 0V11"
        className={`[transform-origin:66.67%_45.83%] transition-[rotate,translate] duration-600 ease-spring ${on ? "-translate-y-px rotate-[34deg]" : ""}`}
      />
      <circle cx="12" cy="16" r="1.25" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** The waves fold back into the cone and a cross takes their place. */
function Sound({ on }: { on: boolean }) {
  const wave = "transition-[opacity,translate] duration-300 ease-out-quint";
  const gone = "-translate-x-1.5 opacity-0";
  return (
    <Svg>
      <path d="M11 5.5 6.5 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.5L11 18.5z" fill="currentColor" />
      <path d="M15 9.5a4 4 0 0 1 0 5" className={`${wave} ${on ? gone : "delay-75"}`} />
      <path d="M17.8 6.8a8 8 0 0 1 0 10.4" className={`${wave} ${on ? gone : "delay-150"}`} />
      <path
        d="m15.5 9.5 5 5m0-5-5 5"
        className={`origin-[75%_50%] transition-[opacity,scale] duration-300 ease-spring-soft ${on ? "delay-100" : "scale-50 opacity-0"}`}
      />
    </Svg>
  );
}

/* ── The grid ───────────────────────────────────────────────────────── */

const ICONS: { label: string; render: (on: boolean) => ReactNode }[] = [
  { label: "Menu", render: (on) => <Bars on={on} poses={MENU} /> },
  { label: "Search", render: (on) => <SearchClose on={on} /> },
  { label: "Play", render: (on) => <PlayPause on={on} /> },
  { label: "Record", render: (on) => <RecordStop on={on} /> },
  { label: "Add", render: (on) => <Bars on={on} poses={PLUS} /> },
  { label: "Download", render: (on) => <Bars on={on} poses={DOWNLOAD} /> },
  { label: "Expand", render: (on) => <Bars on={on} poses={CHEVRON} /> },
  { label: "Full screen", render: (on) => <ExpandCollapse on={on} /> },
  { label: "Theme", render: (on) => <SunMoon on={on} /> },
  { label: "Visibility", render: (on) => <Eye on={on} /> },
  { label: "Lock", render: (on) => <Lock on={on} /> },
  { label: "Sound", render: (on) => <Sound on={on} /> },
];

function IconToggle({
  label,
  render,
}: {
  label: string;
  render: (on: boolean) => ReactNode;
}) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={() => setOn((v) => !v)}
      className="grid size-14 place-items-center rounded-[18px] bg-sunken transition-[scale,background-color] duration-200 ease-out-quint hover:bg-[color-mix(in_oklab,var(--sunken),var(--ink)_5%)] active:scale-90"
    >
      <span className="relative size-6">{render(on)}</span>
    </button>
  );
}

export function IconMorph() {
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
      {ICONS.map((icon) => (
        <IconToggle key={icon.label} {...icon} />
      ))}
    </div>
  );
}
