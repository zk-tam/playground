"use client";

import { useEffect, useRef } from "react";
import { Spring, rubber, velocityTracker } from "@/lib/spring";

const RADIUS = 240; // px, wheel centre to the outer end of a tick
const DEGREES = 14; // rotation between neighbouring stops
const BETWEEN = 3; // small ticks drawn between two stops
const TRAVEL = (RADIUS * DEGREES * Math.PI) / 180; // px of drag per stop

/**
 * Pulls a position towards its nearest stop. Under the finger the wheel
 * lingers on each one and then lets go quickly, which is what makes it feel
 * notched rather than smooth.
 */
function notch(p: number, last: number) {
  if (p < 0 || p > last) return p;
  const nearest = Math.round(p);
  const off = p - nearest;
  return nearest + Math.sign(off) * 0.5 * Math.pow(Math.abs(off) * 2, 2.6);
}

/**
 * A wheel of labelled stops that turns under a fixed needle. Far larger than
 * its window, so only the top of the arc shows. Drag it, flick it, or use the
 * arrow keys; it settles on a stop and reports which one.
 */
export function Wheel({
  labels,
  value,
  onChange,
  label,
}: {
  labels: string[];
  value: number;
  onChange: (index: number) => void;
  /** What the wheel chooses, for screen readers. */
  label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const needle = useRef<HTMLDivElement>(null);
  const spring = useRef<Spring | null>(null);
  const report = useRef(onChange);
  const count = labels.length;

  useEffect(() => {
    report.current = onChange;
  });

  // Follow the value when something else changes it.
  useEffect(() => {
    const position = spring.current;
    if (position && Math.round(position.target) !== value) position.to(value);
  }, [value]);

  useEffect(() => {
    const el = root.current;
    const cardEl = card.current;
    const needleEl = needle.current;
    if (!el || !cardEl || !needleEl) return;

    const last = count - 1;
    const clamp = (p: number) => Math.min(last, Math.max(0, p));
    const ticks = Array.from(cardEl.querySelectorAll<HTMLElement>("[data-at]"));
    const places = ticks.map((tick) => Number(tick.dataset.at));
    const names = Array.from(cardEl.querySelectorAll<HTMLElement>("[data-name]"));
    const tracker = velocityTracker();
    let index = Math.round(clamp(Number(el.getAttribute("aria-valuenow"))));
    let drag: { x: number; position: number } | null = null;

    const render = (shown: number) => {
      cardEl.style.transform = `rotate(${-shown * DEGREES}deg)`;
      // Ticks swell and darken as they pass under the needle.
      ticks.forEach((tick, i) => {
        const d = places[i] - shown;
        const near = Math.exp(-(d * d) / 0.22);
        tick.style.transform = `rotate(${places[i] * DEGREES}deg) translateY(${-RADIUS}px) scaleY(${1 + near * 0.7})`;
        tick.style.opacity = String(0.26 + near * 0.74);
      });
      names.forEach((name, i) => {
        const d = i - shown;
        name.style.opacity = String(0.42 + 0.58 * Math.exp(-(d * d) / 0.3));
      });

      const next = Math.round(clamp(shown));
      if (next === index) return;
      index = next;
      el.setAttribute("aria-valuenow", String(index));
      el.setAttribute("aria-valuetext", labels[index]);
      // A click you can see, and on phones that allow it, feel.
      needleEl.animate(
        [{ transform: "scaleY(1)" }, { transform: "scaleY(0.7)" }, { transform: "scaleY(1)" }],
        { duration: 200, easing: "ease-out" },
      );
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8);
    };

    const position = new Spring(
      index,
      (v) => render(drag ? notch(v, last) : v),
      { stiffness: 300, damping: 24, precision: 0.002 },
    );
    spring.current = position;
    render(index);

    const settle = (target: number, velocity?: number) => {
      position.to(target, velocity === undefined ? {} : { velocity });
      report.current(target);
    };

    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      el.setPointerCapture(event.pointerId);
      el.dataset.active = "";
      position.stop();
      drag = { x: event.clientX, position: position.value };
      tracker.reset();
      tracker.add(event.clientX, 0);
    };

    const move = (event: PointerEvent) => {
      if (!drag) return;
      tracker.add(event.clientX, 0);
      // The wheel follows the finger: dragging left brings later stops in.
      const raw = drag.position - (event.clientX - drag.x) / TRAVEL;
      const inside = clamp(raw);
      position.jump(inside + rubber((raw - inside) * TRAVEL, 90, 0.35) / TRAVEL);
    };

    const up = () => {
      if (!drag) return;
      const velocity = Math.max(-30, Math.min(30, -tracker.get().x / TRAVEL));
      // Throw it: land on the stop the momentum would carry it to.
      const target = Math.round(clamp(position.value + velocity * 0.16));
      const from = notch(position.value, last);
      drag = null;
      delete el.dataset.active;
      position.jump(from);
      settle(target, velocity);
    };

    const key = (event: KeyboardEvent) => {
      const by = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key] ?? 0;
      const at = Math.round(position.target);
      const to = event.key === "Home" ? 0 : event.key === "End" ? last : by ? at + by : null;
      if (to === null) return;
      event.preventDefault();
      event.stopPropagation();
      const target = clamp(to);
      // Stepping past either end gives a small bump instead of nothing.
      if (to !== target) position.to(target, { velocity: Math.sign(to - target) * 5 });
      else settle(target);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("keydown", key);
    return () => {
      position.stop();
      spring.current = null;
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("keydown", key);
    };
    // The wheel is rebuilt only when the set of stops changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels.join("|")]);

  // Stops, and the small ticks between each pair.
  const marks: { at: number; stop: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    marks.push({ at: i, stop: true });
    if (i < count - 1)
      for (let k = 1; k < BETWEEN; k++) marks.push({ at: i + k / BETWEEN, stop: false });
  }

  return (
    <div
      ref={root}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={value}
      aria-valuetext={labels[value]}
      className="group relative h-[92px] w-full cursor-grab touch-none overflow-hidden outline-none [mask-image:linear-gradient(90deg,transparent,black_24%,black_76%,transparent)] data-active:cursor-grabbing"
    >
      <div
        ref={needle}
        className="absolute top-0 left-1/2 z-10 -ml-px h-[34px] w-[2px] origin-top rounded-full bg-accent transition-[height] duration-300 ease-spring-soft group-focus-visible:h-[42px] group-data-active:h-[40px]"
      />

      {/* A zero-size point at the wheel's centre, far below the visible arc. */}
      <div ref={card} className="absolute top-[250px] left-1/2 size-0">
        {marks.map(({ at, stop }) => (
          <span
            key={at}
            data-at={at}
            style={{ transform: `rotate(${at * DEGREES}deg) translateY(${-RADIUS}px)` }}
            className={`absolute top-0 left-0 -ml-px w-[2px] origin-top rounded-full bg-ink ${stop ? "h-[15px]" : "h-[7px]"}`}
          />
        ))}
        {labels.map((name, i) => (
          <span
            key={name + i}
            data-name
            style={{ transform: `rotate(${i * DEGREES}deg) translate(-50%, ${-RADIUS + 36}px)` }}
            className="absolute top-0 left-0 origin-top-left text-[12px] leading-none font-medium text-ink tabular-nums"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
