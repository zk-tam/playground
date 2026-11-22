"use client";

import { useEffect, useRef, useState } from "react";
import { Spring, rubber } from "@/lib/spring";
import type { PlayerController } from "./controller";
import { formatTime } from "./youtube";

/**
 * The timeline. It reads the controller's clock every frame and writes
 * straight to the DOM, so playback never re-renders React. A hairline at rest;
 * it thickens, grows a thumb and shows the time under the pointer on hover,
 * and stretches a little if you drag past either end.
 */
export function Scrubber({ controller }: { controller: PlayerController }) {
  const track = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const buffer = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const elapsed = useRef<HTMLSpanElement>(null);
  const total = useRef<HTMLButtonElement>(null);
  const [remaining, setRemaining] = useState(false);

  useEffect(() => {
    const trackEl = track.current;
    const railEl = rail.current;
    const bufferEl = buffer.current;
    const fillEl = fill.current;
    const thumbEl = thumb.current;
    const tipEl = tip.current;
    const elapsedEl = elapsed.current;
    const totalEl = total.current;
    if (
      !trackEl || !railEl || !bufferEl || !fillEl ||
      !thumbEl || !tipEl || !elapsedEl || !totalEl
    )
      return;

    let width = 1;
    let drag: number | null = null; // fraction while scrubbing
    let frame = 0;

    const stretch = new Spring(
      0,
      (s) => {
        railEl.style.transformOrigin = s > 0 ? "left center" : "right center";
        railEl.style.transform = `scaleX(${1 + Math.abs(s) / width})`;
      },
      { stiffness: 520, damping: 20, precision: 0.05 },
    );

    const write = (el: HTMLElement, text: string) => {
      if (el.textContent !== text) el.textContent = text;
    };

    const paint = () => {
      frame = requestAnimationFrame(paint);
      const { duration, status } = controller.getSnapshot();
      const t = drag !== null ? drag * duration : controller.time();
      const f = duration ? Math.min(1, t / duration) : 0;

      fillEl.style.transform = `scaleX(${f})`;
      thumbEl.style.left = `${f * 100}%`;
      bufferEl.style.transform = `scaleX(${Math.max(f, controller.loaded())})`;

      const live = !duration && status === "playing";
      write(elapsedEl, formatTime(t));
      write(
        totalEl,
        live
          ? "Live"
          : "remaining" in totalEl.dataset
            ? `-${formatTime(duration - t)}`
            : formatTime(duration),
      );
      trackEl.setAttribute("aria-valuenow", String(Math.round(t)));
      trackEl.setAttribute("aria-valuemax", String(Math.round(duration)));
      trackEl.setAttribute("aria-valuetext", formatTime(t));
    };
    frame = requestAnimationFrame(paint);

    const fractionAt = (event: PointerEvent) => {
      const rect = trackEl.getBoundingClientRect();
      width = rect.width || 1;
      return (event.clientX - rect.left) / width;
    };

    const showTip = (f: number) => {
      tipEl.style.left = `${f * 100}%`;
      write(tipEl, formatTime(f * controller.getSnapshot().duration));
    };

    const down = (event: PointerEvent) => {
      if (!controller.getSnapshot().duration) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      trackEl.setPointerCapture(event.pointerId);
      trackEl.dataset.dragging = "";
      stretch.jump(0);
      move(event, true);
    };

    const move = (event: PointerEvent, start = false) => {
      const raw = fractionAt(event);
      const f = Math.min(1, Math.max(0, raw));
      showTip(f);
      if (drag === null && !start) return;
      drag = f;
      stretch.jump(rubber((raw - f) * width, width, 0.12));
    };

    const up = () => {
      if (drag === null) return;
      controller.seek(drag * controller.getSnapshot().duration);
      drag = null;
      delete trackEl.dataset.dragging;
      stretch.to(0);
    };

    const onMove = (event: PointerEvent) => move(event);
    trackEl.addEventListener("pointerdown", down);
    trackEl.addEventListener("pointermove", onMove);
    trackEl.addEventListener("pointerup", up);
    trackEl.addEventListener("pointercancel", up);
    return () => {
      cancelAnimationFrame(frame);
      stretch.stop();
      trackEl.removeEventListener("pointerdown", down);
      trackEl.removeEventListener("pointermove", onMove);
      trackEl.removeEventListener("pointerup", up);
      trackEl.removeEventListener("pointercancel", up);
    };
  }, [controller]);

  const tone = "bg-[color-mix(in_oklab,var(--ink)_12%,transparent)]";

  return (
    <div>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={0}
        aria-valuenow={0}
        className="group/seek relative flex h-5 cursor-pointer touch-none items-center outline-none data-dragging:cursor-grabbing"
      >
        <div
          ref={rail}
          className={`relative h-[3px] w-full rounded-full transition-[height] duration-200 ease-out-quint group-hover/seek:h-[5px] group-focus-visible/seek:h-[5px] group-data-dragging/seek:h-[5px] ${tone}`}
        >
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div
              ref={buffer}
              style={{ transform: "scaleX(0)" }}
              className={`absolute inset-0 origin-left ${tone}`}
            />
            <div
              ref={fill}
              style={{ transform: "scaleX(0)" }}
              className="absolute inset-0 origin-left bg-ink"
            />
          </div>
          <div
            ref={thumb}
            className="absolute top-1/2 -mt-1.5 -ml-1.5 size-3 scale-0 rounded-full bg-ink transition-[scale] duration-300 ease-spring-soft group-hover/seek:scale-100 group-focus-visible/seek:scale-100 group-data-dragging/seek:scale-125"
          />
        </div>
        <div
          ref={tip}
          className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-ink px-1.5 text-[12px] leading-5 font-medium text-bg tabular-nums opacity-0 transition-opacity duration-150 group-hover/seek:opacity-100 group-data-dragging/seek:opacity-100"
        >
          0:00
        </div>
      </div>

      <div className="flex justify-between text-[12px] leading-5 text-muted tabular-nums">
        <span ref={elapsed}>0:00</span>
        <button
          ref={total}
          type="button"
          data-remaining={remaining || undefined}
          onClick={() => setRemaining((v) => !v)}
          aria-label={remaining ? "Show total time" : "Show time remaining"}
          className="transition-colors duration-150 hover:text-ink"
        >
          0:00
        </button>
      </div>
    </div>
  );
}
