"use client";

import type { PointerEvent } from "react";

/* The small parts every player needs: the buttons and the volume slider. */

export const iconButton =
  "grid size-9 place-items-center rounded-full text-ink-2 transition-[scale,color,background-color,opacity] duration-200 ease-out-quint hover:bg-sunken hover:text-ink active:scale-90 disabled:pointer-events-none disabled:opacity-30";

/** Play splits into two halves that square up into pause bars. */
export function PlayPause({ playing }: { playing: boolean }) {
  const half =
    "absolute inset-0 bg-current transition-[clip-path] duration-400 ease-out-quint";
  return (
    <span className="relative block size-[18px]">
      <span
        className={half}
        style={{
          clipPath: playing
            ? "polygon(17% 10%, 40% 10%, 40% 90%, 17% 90%)"
            : "polygon(22% 8%, 57% 29%, 57% 71%, 22% 92%)",
        }}
      />
      <span
        className={half}
        style={{
          clipPath: playing
            ? "polygon(60% 10%, 83% 10%, 83% 90%, 60% 90%)"
            : "polygon(56% 28.4%, 92% 50%, 92% 50%, 56% 71.6%)",
        }}
      />
    </span>
  );
}

export function Skip({ back = false }: { back?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={back ? "-scale-x-100" : ""}
    >
      <path d="M5.5 6.1v11.8a1 1 0 0 0 1.55.83L16 13v4.5a1.25 1.25 0 0 0 2.5 0v-11a1.25 1.25 0 0 0-2.5 0V11L7.05 5.27A1 1 0 0 0 5.5 6.1Z" />
    </svg>
  );
}

/** Speaker whose waves follow the level, and cross out when muted. */
export function Speaker({ level }: { level: 0 | 1 | 2 }) {
  const wave = "transition-[opacity,translate] duration-300 ease-out-quint";
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 5.5 6.5 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.5L11 18.5z" fill="currentColor" />
      <path d="M15 9.5a4 4 0 0 1 0 5" className={`${wave} ${level >= 1 ? "" : "-translate-x-1 opacity-0"}`} />
      <path d="M17.8 6.8a8 8 0 0 1 0 10.4" className={`${wave} ${level >= 2 ? "" : "-translate-x-1 opacity-0"}`} />
      <path d="m15.5 9.5 5 5m0-5-5 5" className={`${wave} ${level === 0 ? "" : "translate-x-1 opacity-0"}`} />
    </svg>
  );
}

export function VolumeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const set = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange(((event.clientX - rect.left) / rect.width) * 100);
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e);
      }}
      onKeyDown={(e) => {
        const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[e.key];
        if (!step) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(value + step);
      }}
      className="group/level flex h-9 w-16 cursor-pointer touch-none items-center outline-none"
    >
      <span className="block h-[3px] w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ink)_12%,transparent)] transition-[height] duration-200 ease-out-quint group-hover/level:h-[5px] group-focus-visible/level:h-[5px]">
        <span
          style={{ transform: `scaleX(${value / 100})` }}
          className="block h-full origin-left bg-ink transition-transform duration-150 ease-out"
        />
      </span>
    </div>
  );
}
