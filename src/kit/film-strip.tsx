"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";

export type FilmFrame = {
  id: string;
  /** A small picture of it. */
  src: string;
  /** A short label shown under it: a year, say. */
  code: string;
  title: string;
};

// One frame's share of the row, in px. Must match --cell in globals.css.
const CELL = 88;
const SETTLE_MS = 140; // quiet for this long, and the row has come to rest
const SPAN = 1000; // the length of the row-to-sheet change, on its own clock
const TRAVEL_MS = 520; // how long the whole change takes when let go
const FLICK = 0.35; // px per ms: faster than this and the flick decides

const now = () => performance.now();
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** How far a finger travels to take the row all the way to the sheet. */
const reach = () => Math.min(300, innerHeight * 0.36);

type Box = { left: number; top: number; width: number; height: number };

/** The move that makes `to` look as if it were sitting at `from`. */
const from = (a: Box, to: Box) =>
  `translate(${a.left - to.left}px, ${a.top - to.top}px) scale(${a.width / to.width}, ${a.height / to.height})`;

/** Rows of frames: the mark for "show them all". */
function SheetMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="4.5" width="7" height="6" rx="1" />
      <rect x="13.5" y="4.5" width="7" height="6" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="6" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="6" rx="1" />
    </svg>
  );
}

/** A frame's picture: a small cover. */
function Band({ frame }: { frame: FilmFrame }) {
  return (
    <span className="film-band">
      {/* eslint-disable-next-line @next/next/no-img-element -- a 14KB picture made to size; nothing for the optimiser to do */}
      <img src={frame.src} alt="" loading="lazy" decoding="async" draggable={false} className="film-pic" />
    </span>
  );
}

/** A pull in progress: where it began, and how fast it is going. */
type Pull = {
  id: number;
  x: number;
  y: number;
  /** Progress when it began: 0 in the row, 1 on the sheet. */
  base: number;
  lifting: boolean;
  lastY: number;
  lastAt: number;
  /** Upwards is positive, px per ms. */
  speed: number;
};

/**
 * A row of frames to choose from, in the way of a strip of film, without the
 * dressing: each item is a small picture with a short code (a year) under
 * it. Drag the row through the ring in the middle, or press a frame, and the
 * one in the ring is the one chosen. Frames grow and brighten as they near it.
 *
 * The row is for what is near. For what is far, it opens into a sheet: every
 * frame laid out at once, with its title. That change belongs to the finger.
 * Pull the row up and the frames leave it and spread towards their places on
 * the sheet exactly as far as you have pulled; let go and it finishes, or
 * goes back, whichever is nearer or whichever way it was flicked. The handle
 * at the top of the sheet pulls it back down the same way. A button beside
 * the row does it in one press where there is room for one.
 *
 * `onChange` is called once the row has come to rest, not while it is
 * moving, so whatever follows the choice is not redrawn for every frame that
 * passes through the ring.
 */
export function FilmStrip({
  frames,
  value,
  onChange,
  label,
  ownButton = "always",
  className = "",
}: {
  frames: FilmFrame[];
  value: number;
  onChange: (index: number) => void;
  /** What these are, for the sheet's heading: "9 artifacts". */
  label: string;
  /**
   * When the row shows a button for the sheet, beside itself. "wide" leaves
   * it out on a phone, where there is no room beside the row: there a small
   * handle above the row says it can be pulled up.
   */
  ownButton?: "always" | "wide";
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  // The frame nearest the ring right now, while the row is moving.
  const [near, setNear] = useState(value);
  const [moving, setMoving] = useState(false);
  // Whether the sheet is in the page at all, and whether it is the thing in
  // front. In between, while a finger is part-way, it is shown but not open.
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);

  // Sizes every frame for where the row is right now, without waiting for
  // the next animation frame. Filled in by the effect that owns the row.
  const resize = useRef(() => {});
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  }, [value, onChange]);

  /* ── The row ────────────────────────────────────────────────────────── */

  // Start with the chosen frame in the ring, with no travel.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = value * CELL;
    // Only on mount: after that, the effect below keeps it in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chosen from somewhere else (the keyboard, the sheet): run the row to it.
  useEffect(() => {
    const el = scroller.current;
    if (!el || Math.round(el.scrollLeft / CELL) === value) return;
    el.scrollTo({ left: value * CELL, behavior: still() ? "auto" : "smooth" });
  }, [value]);

  // Size the frames by how near the ring they are, and notice when the row
  // comes to rest.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const cells = [...el.querySelectorAll<HTMLElement>("[data-frame]")];
    let frame = 0;
    let rest = 0;
    let fade = 0;
    let holdUntil = 0;

    const paint = () => {
      frame = 0;
      const at = el.scrollLeft / CELL;
      cells.forEach((cell, i) => {
        cell.style.setProperty("--near", String(Math.max(0, 1 - Math.abs(i - at) / 2.4).toFixed(3)));
      });
      setNear(Math.min(cells.length - 1, Math.max(0, Math.round(at))));
    };
    const scrolled = () => {
      frame ||= requestAnimationFrame(paint);
      setMoving(true);
      clearTimeout(rest);
      clearTimeout(fade);
      rest = window.setTimeout(() => {
        if (el.hasAttribute("data-dragging")) return;
        // The row moved because its width changed, not because anyone moved
        // it: put the chosen frame back in the ring and choose nothing.
        if (now() < holdUntil) {
          el.scrollLeft = latest.current.value * CELL;
          return setMoving(false);
        }
        const landed = Math.min(cells.length - 1, Math.max(0, Math.round(el.scrollLeft / CELL)));
        if (landed !== latest.current.value) latest.current.onChange(landed);
        fade = window.setTimeout(() => setMoving(false), 700);
      }, SETTLE_MS);
    };
    paint();
    resize.current = paint;
    el.addEventListener("scroll", scrolled, { passive: true });
    // A window being resized or a phone being turned can leave the browser
    // snapped to a different frame. Hold the chosen one where it was.
    const resized = new ResizeObserver(() => {
      holdUntil = now() + 500;
      el.scrollLeft = latest.current.value * CELL;
    });
    resized.observe(el);
    return () => {
      resized.disconnect();
      el.removeEventListener("scroll", scrolled);
      cancelAnimationFrame(frame);
      clearTimeout(rest);
      clearTimeout(fade);
    };
  }, [frames.length]);

  /* ── Between the row and the sheet ──────────────────────────────────── */

  // The whole change is one stretch of time, 0 in the row and 1 on the sheet,
  // and everything that changes is a paused animation along it. A finger
  // sets where on that stretch things are; letting go runs it to an end.
  const change = useRef({ parts: [] as Animation[], at: 0, frame: 0, timer: 0 });
  // What to do the moment the sheet is in the page and can be measured.
  const wanted = useRef<{ at: number; then: "open" | "close" | "follow" } | null>(null);

  function place(at: number) {
    const state = change.current;
    state.at = clamp(at);
    for (const part of state.parts) part.currentTime = state.at * SPAN;
  }

  function halt() {
    cancelAnimationFrame(change.current.frame);
    clearTimeout(change.current.timer);
  }

  function clear() {
    halt();
    change.current.parts.forEach((part) => part.cancel());
    change.current.parts = [];
  }

  /**
   * Measures where every frame is in the row and on the sheet, and lays the
   * change out between the two. The sheet must be in the page, at rest.
   */
  function build() {
    const strip = scroller.current;
    const page = sheet.current;
    const host = root.current;
    if (!strip || !page || !host) return false;
    clear();
    // The row may just have been moved to a newly chosen frame. Its frames
    // are normally resized a moment later; here they must be right now.
    resize.current();

    const bands = (within: HTMLElement) =>
      [...within.querySelectorAll<HTMLElement>("[data-frame] .film-band")].map((el) => el.getBoundingClientRect());
    const onStrip = bands(strip);
    const onSheet = bands(page);
    const view = strip.getBoundingClientRect();
    const inRow = [...strip.querySelectorAll<HTMLElement>("[data-frame] .film-band")].map((band) =>
      Number(getComputedStyle(band).opacity),
    );

    const linear = { duration: SPAN, fill: "both" as const, easing: "linear" };
    const late = (el: Element, since: number) =>
      el.animate({ opacity: [0, 0, 1], offset: [0, since, 1] }, linear);
    const parts: Animation[] = [];

    page.querySelectorAll<HTMLElement>("[data-frame]").forEach((cell, i) => {
      const there = from(onStrip[i], onSheet[i]);
      // Frames with no place in the row's window have nowhere to be seen
      // leaving from. They appear on the sheet, in the second half.
      if (onStrip[i].right <= view.left || onStrip[i].left >= view.right) {
        parts.push(cell.animate([{ transform: there }, { transform: "none" }], linear), late(cell, 0.5));
      } else {
        parts.push(
          cell.animate(
            [
              { transform: there, opacity: inRow[i] },
              { transform: "none", opacity: 1 },
            ],
            linear,
          ),
        );
      }
      // A frame's title belongs to the sheet: it arrives once the frame has.
      cell.querySelectorAll(".film-title, .film-code").forEach((el) => parts.push(late(el, 0.55)));
    });

    // The row only shows what is inside its window, and fades out at both
    // ends. The travelling frames are not in the row, so the layer they are
    // on wears the row's own mask, and the mask travels too: closed down to
    // the row's window at the row's end, wide open at the sheet's.
    const stage = page.querySelector<HTMLElement>(".film-sheet-stage");
    const mask = {
      maskImage: "linear-gradient(90deg, transparent, black 14%, black 86%, transparent)",
      maskRepeat: "no-repeat",
    };
    if (stage)
      parts.push(
        stage.animate(
          [
            { ...mask, maskSize: `${view.width}px 100%`, maskPosition: `${view.left}px 0px` },
            // Three screens wide, centred: its faded ends are well off-screen.
            { ...mask, maskSize: `${innerWidth * 3}px 100%`, maskPosition: `${-innerWidth}px 0px` },
          ],
          linear,
        ),
      );
    const veil = page.querySelector(".film-sheet-veil");
    if (veil) parts.push(veil.animate({ opacity: [0, 1] }, linear));
    // What the frames leave behind in the row goes quickly: its ring, its
    // years, its handle. An empty ring is not worth looking at.
    host.querySelectorAll(".film-gate, .film-scroll .film-code, .film-reach > .film-grab").forEach((el) =>
      parts.push(el.animate([{}, { opacity: 0, offset: 0.25 }, { opacity: 0 }], linear)),
    );
    const head = page.querySelector(".film-sheet-head");
    if (head) parts.push(late(head, 0.4));

    parts.forEach((part) => part.pause());
    change.current.parts = parts;
    // The sheet's frames now stand in for the row's own.
    host.setAttribute("data-lifted", "");
    document.documentElement.setAttribute("data-sheet", "");
    return true;
  }

  /** The change has reached an end: settle there. */
  function land(end: 0 | 1) {
    // Back in the row, the sheet is finished with, but it stays in the page
    // until the next render. Clearing the change lets go of its frames, and
    // for that moment they would jump back to their places on the sheet and
    // show it whole. So it is put out of sight first.
    if (end === 0) sheet.current?.setAttribute("hidden", "");
    clear();
    change.current.at = end;
    if (end === 1) {
      sheet.current?.querySelector<HTMLElement>("[data-frame][aria-current]")?.focus({ preventScroll: true });
      return;
    }
    root.current?.removeAttribute("data-lifted");
    document.documentElement.removeAttribute("data-sheet");
    setShown(false);
  }

  /** Let go: run from wherever things are to one end. */
  function run(end: 0 | 1) {
    halt();
    const state = change.current;
    const start = state.at;
    const length = still() ? 0 : Math.max(200, TRAVEL_MS * Math.abs(end - start));
    const began = now();
    const step = () => {
      halt();
      const t = length ? Math.min(1, (now() - began) / length) : 1;
      place(start + (end - start) * (1 - Math.pow(1 - t, 5)));
      if (t >= 1) return land(end);
      // Both, so it still arrives where animation frames are held back.
      state.frame = requestAnimationFrame(step);
      state.timer = window.setTimeout(step, 90);
    };
    step();
  }

  // The sheet has just been put in the page: measure, and do what was asked.
  useLayoutEffect(() => {
    if (!shown) return;
    const ask = wanted.current;
    wanted.current = null;
    if (!build()) return;
    place(ask?.at ?? 0);
    if (!ask || ask.then === "open") run(1);
    else if (ask.then === "close") run(0);
    // Reads and writes only refs and the page; nothing here re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  // Never leave the page locked or the row's frames hidden if this goes away.
  useEffect(() => {
    const host = root.current;
    const state = change.current;
    return () => {
      cancelAnimationFrame(state.frame);
      clearTimeout(state.timer);
      document.documentElement.removeAttribute("data-sheet");
      host?.removeAttribute("data-lifted");
    };
  }, []);

  /** Open the sheet in one go. */
  function unfold() {
    setOpen(true);
    if (shown) return run(1);
    wanted.current = { at: 0, then: "open" };
    setShown(true);
  }

  /** Close the sheet in one go, with `index` in the ring if one was pressed. */
  function fold(index?: number) {
    if (index !== undefined && scroller.current) {
      // The row is under the sheet: put the frame in the ring before the
      // sheet's frames are sent back to where the row's are.
      scroller.current.scrollLeft = index * CELL;
      if (index !== value) onChange(index);
    }
    setOpen(false);
    // Measured afresh: the row may have moved, the sheet may have scrolled.
    if (!build()) return;
    place(1);
    run(0);
  }

  /* ── Fingers ────────────────────────────────────────────────────────── */

  const pull = useRef<Pull | null>(null);
  // A mouse cannot fling a scroller the way a finger can, so sideways
  // dragging is done by hand for it.
  const slide = useRef<{ left: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  function begin(event: PointerEvent<HTMLElement>, base: 0 | 1) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragged.current = false;
    pull.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      base,
      lifting: false,
      lastY: event.clientY,
      lastAt: event.timeStamp,
      speed: 0,
    };
    slide.current =
      base === 0 && event.pointerType === "mouse" && scroller.current
        ? { left: scroller.current.scrollLeft, moved: false }
        : null;
  }

  function move(event: PointerEvent<HTMLElement>) {
    const held = pull.current;
    if (!held || held.id !== event.pointerId) return;
    const dx = event.clientX - held.x;
    let dy = event.clientY - held.y;

    // Up from the row, or down from the sheet, and clearly not sideways:
    // from here the finger has hold of the change.
    const away = held.base === 0 ? -dy : dy;
    if (!held.lifting && !slide.current?.moved && away > 8 && Math.abs(dy) > Math.abs(dx) * 1.3) {
      held.lifting = true;
      dragged.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
      halt();
      if (held.base === 0 && !shown) {
        wanted.current = { at: 0, then: "follow" };
        setShown(true);
      } else if (change.current.parts.length) {
        // Caught part-way through opening or closing: carry on from there.
        held.base = change.current.at;
      } else if (build()) place(held.base);
      // Measure the pull from here, so nothing jumps as the finger takes over.
      held.y = event.clientY;
      dy = 0;
    }

    if (held.lifting) {
      const dt = event.timeStamp - held.lastAt;
      if (dt > 0) held.speed = 0.7 * ((held.lastY - event.clientY) / dt) + 0.3 * held.speed;
      held.lastY = event.clientY;
      held.lastAt = event.timeStamp;
      const at = clamp(held.base - dy / reach());
      // Before the sheet is in the page there is nothing to move yet.
      if (wanted.current) wanted.current.at = at;
      else place(at);
      return;
    }

    const sliding = slide.current;
    const el = scroller.current;
    if (!sliding || !el) return;
    if (!sliding.moved && Math.abs(dx) < 4) return;
    if (!sliding.moved) {
      sliding.moved = true;
      dragged.current = true;
      el.setAttribute("data-dragging", "");
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
    }
    el.scrollLeft = sliding.left - dx;
  }

  function end() {
    const held = pull.current;
    pull.current = null;
    const sliding = slide.current;
    slide.current = null;

    if (held?.lifting) {
      const at = wanted.current?.at ?? change.current.at;
      // A flick decides; otherwise whichever end is nearer.
      const up = held.speed > FLICK ? true : held.speed < -FLICK ? false : at > 0.42;
      setOpen(up);
      if (wanted.current) wanted.current.then = up ? "open" : "close";
      else run(up ? 1 : 0);
      return;
    }

    const el = scroller.current;
    if (!sliding?.moved || !el) return;
    el.removeAttribute("data-dragging");
    const landed = Math.min(frames.length - 1, Math.max(0, Math.round(el.scrollLeft / CELL)));
    el.scrollTo({ left: landed * CELL, behavior: "smooth" });
  }

  const shownFrame = frames[near] ?? frames[value];

  return (
    <div ref={root} className={`film ${className}`} data-button={ownButton}>
      <div
        className="film-reach"
        onPointerDown={(event) => begin(event, 0)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {/* Says the row can be pulled up. While the row is moving it gives
            way to the title of whatever is passing through the ring. */}
        <span aria-hidden className={`film-grab ${moving ? "is-off" : ""}`} />
        <p aria-hidden className={`film-caption ${moving ? "is-on" : ""}`}>
          {shownFrame?.title}
        </p>

        <div
          ref={scroller}
          role="listbox"
          aria-label={label}
          aria-orientation="horizontal"
          // Holding a picture must not bring up the browser's own menu for it.
          onContextMenu={(event) => event.preventDefault()}
          className="film-scroll"
        >
          <div className="film-track">
            {frames.map((frame, i) => (
              <button
                key={frame.id}
                type="button"
                role="option"
                data-frame
                aria-selected={i === value}
                aria-label={`${frame.code}, ${frame.title}`}
                tabIndex={i === value ? 0 : -1}
                onClick={() => {
                  // A press, not the end of a drag.
                  if (dragged.current) return;
                  if (i !== value) onChange(i);
                }}
                className="film-cell"
              >
                <Band frame={frame} />
                <span className="film-code" aria-hidden>
                  {frame.code}
                </span>
              </button>
            ))}
          </div>
        </div>
        <span aria-hidden className="film-gate" />
      </div>

      <button
        type="button"
        aria-label={`All ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={unfold}
        className="film-all grid size-[45px] shrink-0 place-items-center rounded-full bg-sunken text-ink-2 transition-[scale,color] duration-200 ease-out-quint hover:text-ink active:scale-90"
      >
        <SheetMark />
      </button>

      {shown &&
        createPortal(
          <div
            ref={sheet}
            role="dialog"
            aria-modal
            aria-label={label}
            aria-hidden={!open}
            data-open={open || undefined}
            onKeyDown={(event) => event.key === "Escape" && fold()}
            className="film-sheet"
          >
            <div className="film-sheet-veil" />
            {/* Fills the screen and scrolls. Pressing its empty part closes. */}
            <div
              className="film-sheet-stage"
              onClick={(event) => event.target === event.currentTarget && fold()}
            >
              {/* The top of the sheet is its handle: pull it down to close. */}
              <div
                className="film-sheet-head"
                onPointerDown={(event) => begin(event, 1)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
              >
                <span aria-hidden className="film-grab" />
                <p className="font-medium">{label}</p>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => !dragged.current && fold()}
                  className="grid size-9 place-items-center rounded-full bg-sunken text-ink-2 transition-[scale,color] duration-200 ease-out-quint hover:text-ink active:scale-90"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
              <div className="film-sheet-grid" onClick={(event) => event.target === event.currentTarget && fold()}>
                {frames.map((frame, i) => (
                  <button
                    key={frame.id}
                    type="button"
                    data-frame
                    aria-current={i === value ? "true" : undefined}
                    onClick={() => fold(i)}
                    className="film-cell"
                  >
                    <Band frame={frame} />
                    <span className="film-title">{frame.title}</span>
                    <span className="film-code">{frame.code}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
