"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { easing } from "./bars";

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
const SETTLE_MS = 140; // quiet for this long, and the strip has come to rest
const PULL = 30; // drag the row up this far and it opens out
const UNSPOOL_MS = 560;

type Box = { left: number; top: number; width: number; height: number };

/** The move that makes `to` look as if it were sitting at `from`. */
const from = (a: Box, to: Box) =>
  `translate(${a.left - to.left}px, ${a.top - to.top}px) scale(${a.width / to.width}, ${a.height / to.height})`;

/** A frame's picture: a small cover. */
function Band({ frame }: { frame: FilmFrame }) {
  return (
    <span className="film-band">
      {/* eslint-disable-next-line @next/next/no-img-element -- a 14KB picture made to size; nothing for the optimiser to do */}
      <img src={frame.src} alt="" loading="lazy" decoding="async" draggable={false} className="film-pic" />
    </span>
  );
}

/**
 * A row of frames to choose from, in the way of a strip of film, without the
 * dressing: each item is a small picture with a short code (a year) under
 * it. Drag the row through the ring in the middle, or press a frame, and the
 * one in the ring is the one chosen. Frames grow and brighten as they near it.
 *
 * The row is for what is near. For what is far, it opens out: pull it up (or
 * press the button beside it) and every frame is laid out at once as a sheet,
 * with its title. The frames travel from their places in the row to their
 * places on the sheet; press one and they travel back with it in the ring.
 *
 * `onChange` is called once the strip has come to rest, not while it is
 * moving, so whatever follows the choice is not redrawn for every frame that
 * passes through the ring.
 */
export function FilmStrip({
  frames,
  value,
  onChange,
  label,
  className = "",
}: {
  frames: FilmFrame[];
  value: number;
  onChange: (index: number) => void;
  /** What these are, for the sheet's heading: "9 artifacts". */
  label: string;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  // The frame nearest the ring right now, while the row is moving.
  const [near, setNear] = useState(value);
  const [moving, setMoving] = useState(false);
  const [open, setOpen] = useState(false);
  // The sheet stays in the page a little longer than `open`, while it winds back.
  const [shown, setShown] = useState(false);
  if (open && !shown) setShown(true);

  // Sizes every frame for where the row is right now, without waiting for
  // the next animation frame. Filled in by the effect that owns the row.
  const resize = useRef(() => {});
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  }, [value, onChange]);

  /* ── The strip ──────────────────────────────────────────────────────── */

  // Start with the chosen frame in the ring, with no travel.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = value * CELL;
    // Only on mount: after that, the effect below keeps it in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chosen from somewhere else (the keyboard, the sheet): run the strip to it.
  useEffect(() => {
    const el = scroller.current;
    if (!el || Math.round(el.scrollLeft / CELL) === value) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: value * CELL, behavior: still ? "auto" : "smooth" });
  }, [value]);

  // Size the frames by how near the ring they are, and notice when the
  // strip comes to rest.
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
        if (performance.now() < holdUntil) {
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
      holdUntil = performance.now() + 500;
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

  // A mouse cannot fling a scroller the way a finger can, so dragging is done
  // by hand for it. Either pointer can pull the row up to open the sheet.
  const drag = useRef<{ id: number; x: number; y: number; left: number; moved: boolean; mouse: boolean } | null>(null);
  const dragged = useRef(false);

  function grab(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragged.current = false;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: event.currentTarget.scrollLeft,
      moved: false,
      mouse: event.pointerType === "mouse",
    };
  }

  function pull(event: PointerEvent<HTMLDivElement>) {
    const held = drag.current;
    if (!held || held.id !== event.pointerId) return;
    const dx = event.clientX - held.x;
    const dy = event.clientY - held.y;
    // Upwards, and clearly not sideways: open the sheet.
    if (dy < -PULL && Math.abs(dy) > Math.abs(dx) * 1.3) {
      drag.current = null;
      dragged.current = true;
      event.currentTarget.removeAttribute("data-dragging");
      return setOpen(true);
    }
    if (!held.mouse) return;
    if (!held.moved && Math.abs(dx) < 4) return;
    if (!held.moved) {
      held.moved = true;
      dragged.current = true;
      event.currentTarget.setAttribute("data-dragging", "");
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
    }
    event.currentTarget.scrollLeft = held.left - dx;
  }

  function drop(event: PointerEvent<HTMLDivElement>) {
    const held = drag.current;
    drag.current = null;
    if (!held?.moved) return;
    const el = event.currentTarget;
    el.removeAttribute("data-dragging");
    const landed = Math.min(frames.length - 1, Math.max(0, Math.round(el.scrollLeft / CELL)));
    el.scrollTo({ left: landed * CELL, behavior: "smooth" });
  }

  /* ── The sheet ──────────────────────────────────────────────────────── */

  const was = useRef(false);
  useLayoutEffect(() => {
    const strip = scroller.current;
    const page = sheet.current;
    const host = root.current;
    if (!shown || !strip || !page || !host || open === was.current) return;
    was.current = open;

    const html = document.documentElement;
    const bands = (within: HTMLElement) =>
      [...within.querySelectorAll<HTMLElement>("[data-frame] .film-band")].map((el) => el.getBoundingClientRect());
    const cells = [...page.querySelectorAll<HTMLElement>("[data-frame]")];
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = still ? 0 : UNSPOOL_MS;
    const chosen = latest.current.value;
    // Frames nearest the chosen one go first, so the sheet opens outwards.
    const wait = (i: number) => (still ? 0 : Math.min(Math.abs(i - chosen), 9) * 16);

    // The row may just have been moved to a newly chosen frame. Its frames
    // are normally resized a moment later; here they must be right now,
    // because their sizes and fades are about to be read.
    resize.current();

    // Where each frame sits in the row, and on the sheet. Both are read
    // before anything is hidden or moved.
    const onStrip = bands(strip);
    const onSheet = bands(page);

    // How faint each frame is at rest in the row, so a travelling frame can
    // start from, or arrive at, exactly that.
    const inRow = [...strip.querySelectorAll<HTMLElement>("[data-frame] .film-band")].map((band) => ({
      opacity: Number(getComputedStyle(band).opacity),
    }));
    // Frames with no place in the row's window have nowhere to be seen
    // arriving. They fade where they are, early, and are gone before the
    // others land; on the way out they are the last to appear.
    const window_ = strip.getBoundingClientRect();
    const unseen = onStrip.map((box) => box.right <= window_.left || box.left >= window_.right);
    const whole = { opacity: 1 };
    const words = (cell: HTMLElement) => [...cell.querySelectorAll<HTMLElement>(".film-title, .film-code")];

    // The row only shows what is inside its window, and fades out at both
    // ends. The travelling frames are not in the row, so nothing does that for
    // them: left alone, the ones that belong outside the window would be seen
    // whole beside it. So the sheet wears the row's own mask, and the mask
    // travels too: wide open over the whole screen at the sheet's end, closed
    // down to the row's window at the row's end. Frames slide in under its
    // edges just as they do in the row, and the hand-over is exact.
    // The mask goes on the layer that fills the screen and holds the frames,
    // so it is measured from the screen's own left edge, as the row's window is.
    const stage = page.querySelector<HTMLElement>(".film-sheet-stage");
    const view = strip.getBoundingClientRect();
    const mask = {
      maskImage: "linear-gradient(90deg, transparent, black 14%, black 86%, transparent)",
      maskRepeat: "no-repeat",
    };
    const wide = {
      ...mask,
      // Three screens wide, centred: its faded ends are well off-screen.
      maskSize: `${innerWidth * 3}px 100%`,
      maskPosition: `${-innerWidth}px 0px`,
    };
    const closed = {
      ...mask,
      maskSize: `${view.width}px 100%`,
      maskPosition: `${view.left}px 0px`,
    };

    if (open) {
      html.setAttribute("data-sheet", "");
      host.setAttribute("data-away", "");
      cells.forEach((cell, i) => {
        const timing = { duration, delay: wait(i), easing: easing("out-quint"), fill: "backwards" as const };
        if (unseen[i]) {
          cell.animate([{ transform: from(onStrip[i], onSheet[i]) }, { transform: "none" }], timing);
          cell.animate({ opacity: [0, 0, 1], offset: [0, 0.45, 1] }, { ...timing, easing: "ease-out" });
        } else
          cell.animate(
            [
              { transform: from(onStrip[i], onSheet[i]), ...inRow[i] },
              { transform: "none", ...whole },
            ],
            timing,
          );
        // Its title belongs to the sheet: it arrives once the frame has.
        words(cell).forEach((el) => el.animate({ opacity: [0, 0, 1] }, timing));
      });
      stage?.animate([closed, wide], { duration, easing: easing("out-quint") });
      veil.current?.animate({ opacity: [0, 1] }, { duration, easing: "ease-out" });
      page.querySelector<HTMLElement>(".film-sheet-head")?.animate({ opacity: [0, 1] }, { duration, easing: "ease-out" });
      page.querySelector<HTMLElement>("[data-frame][aria-current]")?.focus({ preventScroll: true });
      return;
    }

    const leaving = cells.map((cell, i) => {
      const timing = { duration, delay: wait(i) / 2, easing: easing("out-quint"), fill: "forwards" as const };
      words(cell).forEach((el) => el.animate({ opacity: [1, 0, 0] }, timing));
      if (unseen[i]) {
        cell.animate({ opacity: [1, 0] }, { duration: duration * 0.3, easing: "ease-out", fill: "forwards" });
        return cell.animate([{ transform: "none" }, { transform: from(onStrip[i], onSheet[i]) }], timing);
      }
      return cell.animate(
        [
          { transform: "none", ...whole },
          { transform: from(onStrip[i], onSheet[i]), ...inRow[i] },
        ],
        timing,
      );
    });
    const closing = { duration, easing: "ease-out", fill: "forwards" as const };
    stage?.animate([wide, closed], { duration, easing: easing("out-quint"), fill: "forwards" });
    veil.current?.animate({ opacity: [1, 0] }, closing);
    page.querySelector<HTMLElement>(".film-sheet-head")?.animate({ opacity: [1, 0] }, closing);
    const done = () => {
      html.removeAttribute("data-sheet");
      host.removeAttribute("data-away");
      // The row takes over from frames that are already where its own are.
      // Only its year labels and the ring are new: let them in gently.
      if (!still)
        host
          .querySelectorAll<HTMLElement>(".film-code, .film-gate")
          .forEach((el) => el.animate([{ opacity: 0 }, {}], { duration: 260, easing: "ease-out" }));
      setShown(false);
    };
    Promise.all(leaving.map((animation) => animation.finished)).then(done, done);
  }, [open, shown]);

  // Never leave the page locked or the strip hidden if this goes away mid-way.
  useEffect(() => {
    const host = root.current;
    return () => {
      document.documentElement.removeAttribute("data-sheet");
      host?.removeAttribute("data-away");
    };
  }, []);

  /** Close the sheet, with `index` in the ring if one was pressed. */
  function wind(index?: number) {
    if (index !== undefined && scroller.current) {
      // The row is out of sight: put the frame in the ring before the
      // sheet's frames fly back to where the strip's are.
      scroller.current.scrollLeft = index * CELL;
      if (index !== value) onChange(index);
    }
    setOpen(false);
  }

  const shownFrame = frames[near] ?? frames[value];

  return (
    <div ref={root} className={`film ${className}`}>
      {/* While the row is moving: what is passing through the ring. */}
      <p aria-hidden className={`film-caption ${moving ? "is-on" : ""}`}>
        {shownFrame?.title}
      </p>

      <div className="relative min-w-0 flex-1">
        <div
          ref={scroller}
          role="listbox"
          aria-label={label}
          aria-orientation="horizontal"
          onPointerDown={grab}
          onPointerMove={pull}
          onPointerUp={drop}
          onPointerCancel={drop}
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
        onClick={() => setOpen(true)}
        className="mt-[5px] grid size-[45px] shrink-0 place-items-center rounded-full bg-sunken text-ink-2 transition-[scale,color] duration-200 ease-out-quint hover:text-ink active:scale-90"
      >
        {/* Rows of frames: the sheet. */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
          <rect x="3.5" y="4.5" width="7" height="6" rx="1" />
          <rect x="13.5" y="4.5" width="7" height="6" rx="1" />
          <rect x="3.5" y="13.5" width="7" height="6" rx="1" />
          <rect x="13.5" y="13.5" width="7" height="6" rx="1" />
        </svg>
      </button>

      {shown &&
        createPortal(
          <div
            ref={sheet}
            role="dialog"
            aria-modal
            aria-label={label}
            onKeyDown={(event) => event.key === "Escape" && wind()}
            className="film-sheet"
          >
            <div ref={veil} className="film-sheet-veil" />
            {/* Fills the screen and scrolls. Pressing its empty part closes. */}
            <div
              className="film-sheet-stage"
              onClick={(event) => event.target === event.currentTarget && wind()}
            >
              <div className="film-sheet-head">
                <p className="font-medium">{label}</p>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => wind()}
                  className="grid size-9 place-items-center rounded-full bg-sunken text-ink-2 transition-[scale,color] duration-200 ease-out-quint hover:text-ink active:scale-90"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
              <div className="film-sheet-grid" onClick={(event) => event.target === event.currentTarget && wind()}>
                {frames.map((frame, i) => (
                  <button
                    key={frame.id}
                    type="button"
                    data-frame
                    aria-current={i === value ? "true" : undefined}
                    onClick={() => wind(i)}
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
