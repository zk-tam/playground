"use client";

import { useEffect, useRef } from "react";

// Sparse to dense. Small marks only, so at this size they read as tone.
const RAMP = " .`,:;-=+*#%@";
// How many characters the picture is across, whatever size it is shown at.
// The same fineness as the link previews (scripts/ascii-og.mjs): fine enough
// that the characters read as tone, and the picture keeps the same detail on
// a phone as on a desk.
const COLUMNS = 400;
const REVEAL_MS = 900;
const EDGE = 0.09; // how far in from each side an inked picture thins out

// How the pointer disturbs the picture, in css px and per-frame units.
const REACH = 58; // how far from the pointer characters are pushed
const PUSH = 2.1; // how hard, at the pointer itself
const JITTER = 2.6; // random scatter added to the push
const PULL = 0.085; // spring that takes each character home
const DRAG = 0.8; // how quickly it loses speed

type Cell = {
  x: number;
  y: number;
  char: string;
  color: string;
  order: number;
  // Displacement from home, and its velocity, while disturbed.
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  loose: boolean;
};

/** A stable pseudo-random number per cell, 0..1. */
function hash(n: number) {
  n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * A picture, redrawn in characters.
 *
 * The image is shrunk to one pixel per character cell. Each cell's brightness
 * picks its character, and its colour is the picture's own colour at full
 * strength, so the art keeps the palette of the frame it came from. A small
 * fixed nudge per cell (dithering) blends the steps between tones.
 *
 * It does not simply appear: the cells arrive in a scattered order over just
 * under a second, as if the picture were developing.
 *
 * And it is not solid. Every character is a particle on a spring. Move the
 * pointer across the picture and the ones nearby are knocked loose and
 * scattered, then drawn back to where they belong.
 *
 * With `ink`, there is no dark panel behind it. The picture is printed
 * straight onto the page in the theme's own ink, and the page stands in for
 * the tone the ink cannot make: on a light page the ink is the picture's
 * shadows and bare page its highlights, on a dark page the other way round.
 * Its edges thin out into the page instead of ending in a straight line, and
 * it reprints itself when the theme changes.
 */
export function AsciiFrame({
  src,
  alt,
  ink = false,
  className = "",
}: {
  src: string;
  alt: string;
  /** Print in the theme's ink on the bare page, instead of on a dark panel. */
  ink?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = box.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!el || !canvas || !ctx) return;

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let image: HTMLImageElement | null = null;
    let frame = 0; // the reveal
    let stir = 0; // the disturbance
    let live = true;

    // The picture as it currently stands, filled in by `render`.
    let grid: (Cell | null)[] = [];
    let columns = 0;
    let rows = 0;
    let cellW = 1;
    let cellH = 1;
    let ratio = 1;
    let settled = false; // the reveal has finished
    let loose: Cell[] = [];
    let pointer: { x: number; y: number } | null = null;
    let dirty: number[] | null = null; // x0, y0, x1, y1 of what moved last frame

    const paintCell = (cell: Cell) => {
      ctx.fillStyle = cell.color;
      ctx.fillText(cell.char, cell.x + cell.ox, cell.y + cell.oy);
    };

    /** One frame of the disturbance: push, spring back, redraw what moved. */
    const disturb = () => {
      stir = 0;
      if (!live || !settled) return;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const grow = (x: number, y: number) => {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      };

      // Knock loose whatever is within reach of the pointer.
      if (pointer) {
        const reach = REACH * ratio;
        const c0 = Math.max(0, Math.floor((pointer.x - reach) / cellW));
        const c1 = Math.min(columns - 1, Math.ceil((pointer.x + reach) / cellW));
        const r0 = Math.max(0, Math.floor((pointer.y - reach) / cellH));
        const r1 = Math.min(rows - 1, Math.ceil((pointer.y + reach) / cellH));
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const cell = grid[r * columns + c];
            if (!cell) continue;
            const dx = cell.x + cell.ox - pointer.x;
            const dy = cell.y + cell.oy - pointer.y;
            const distance = Math.hypot(dx, dy) || 1;
            if (distance > reach) continue;
            const near = 1 - distance / reach;
            const force = near * near * PUSH * ratio;
            cell.vx += (dx / distance) * force + (Math.random() - 0.5) * JITTER * ratio * near;
            cell.vy += (dy / distance) * force + (Math.random() - 0.5) * JITTER * ratio * near;
            if (!cell.loose) {
              cell.loose = true;
              loose.push(cell);
            }
          }
        }
      }

      // Move every loose character, and let go of the ones that are home.
      const moving: Cell[] = [];
      for (const cell of loose) {
        grow(cell.x + cell.ox, cell.y + cell.oy); // where it was drawn
        grow(cell.x, cell.y); // its home, so the gap it left is redrawn too
        cell.vx = (cell.vx - cell.ox * PULL) * DRAG;
        cell.vy = (cell.vy - cell.oy * PULL) * DRAG;
        cell.ox += cell.vx;
        cell.oy += cell.vy;
        const resting =
          Math.abs(cell.ox) + Math.abs(cell.oy) < 0.3 &&
          Math.abs(cell.vx) + Math.abs(cell.vy) < 0.3;
        if (resting) {
          cell.ox = cell.oy = cell.vx = cell.vy = 0;
          cell.loose = false;
        } else {
          moving.push(cell);
          grow(cell.x + cell.ox, cell.y + cell.oy); // where it is now
        }
      }
      loose = moving;

      // Redraw the smallest block of cells that covers everything that moved,
      // this frame or last.
      const now = x0 === Infinity ? null : [x0, y0, x1, y1];
      const area =
        now && dirty
          ? [
              Math.min(now[0], dirty[0]),
              Math.min(now[1], dirty[1]),
              Math.max(now[2], dirty[2]),
              Math.max(now[3], dirty[3]),
            ]
          : (now ?? dirty);
      dirty = now;
      if (area) {
        const c0 = Math.max(0, Math.floor(area[0] / cellW) - 1);
        const c1 = Math.min(columns - 1, Math.floor(area[2] / cellW) + 1);
        const r0 = Math.max(0, Math.floor(area[1] / cellH) - 1);
        const r1 = Math.min(rows - 1, Math.floor(area[3] / cellH) + 1);
        const left = c0 * cellW;
        const top = r0 * cellH;
        const width = (c1 - c0 + 1) * cellW;
        const height = (r1 - r0 + 1) * cellH;
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, width, height);
        ctx.clip();
        ctx.clearRect(left, top, width, height);
        // One cell further out than the block: a character is a touch wider
        // than its cell, so the neighbours' edges need repainting too.
        for (let r = Math.max(0, r0 - 1); r <= Math.min(rows - 1, r1 + 1); r++) {
          for (let c = Math.max(0, c0 - 1); c <= Math.min(columns - 1, c1 + 1); c++) {
            const cell = grid[r * columns + c];
            if (cell && !cell.loose) paintCell(cell);
          }
        }
        // Loose ones last, on top, wherever they have got to.
        for (const cell of loose) paintCell(cell);
        ctx.restore();
      }

      if (loose.length || pointer) stir = requestAnimationFrame(disturb);
    };

    const wake = () => {
      if (!stir && settled && !still) stir = requestAnimationFrame(disturb);
    };

    const render = (animate: boolean) => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(stir);
      stir = 0;
      settled = false;
      loose = [];
      dirty = null;
      if (!image) return;
      ratio = Math.min(2, devicePixelRatio || 1);
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (!width || !height) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      // Cells are a whole number of screen pixels, so characters stay crisp;
      // the count across lands as near COLUMNS as that allows.
      cellW = Math.max(2, Math.round(canvas.width / COLUMNS));
      cellH = cellW * 2;
      columns = Math.floor(canvas.width / cellW);
      rows = Math.floor(canvas.height / cellH);
      if (!columns || !rows) return;

      // Shrink the picture to the grid, cropped to fill it like `cover`.
      const small = document.createElement("canvas");
      small.width = columns;
      small.height = rows;
      const pen = small.getContext("2d", { willReadFrequently: true });
      if (!pen) return;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const sw = width / scale;
      const sh = height / scale;
      pen.drawImage(
        image,
        (image.naturalWidth - sw) / 2,
        (image.naturalHeight - sh) / 2,
        sw,
        sh,
        0,
        0,
        columns,
        rows,
      );
      let pixels: Uint8ClampedArray;
      try {
        pixels = pen.getImageData(0, 0, columns, rows).data;
      } catch {
        return; // the image came from somewhere that forbids reading it
      }

      grid = new Array<Cell | null>(columns * rows).fill(null);
      const cells: Cell[] = [];
      const top = RAMP.length - 1;

      // Ink: the theme's text colour, and whether the page under it is light.
      // Read from the token, which never sits mid-transition the way a
      // computed colour can while the theme is changing.
      let inkColour = "";
      let onLight = false;
      if (ink) {
        ctx.fillStyle = "#000";
        ctx.fillStyle = getComputedStyle(el).getPropertyValue("--ink").trim() || "#000";
        const hex = String(ctx.fillStyle);
        const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) || 0);
        inkColour = `${r} ${g} ${b}`;
        onLight = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          const n = r * columns + c;
          const i = n * 4;
          const red = pixels[i];
          const green = pixels[i + 1];
          const blue = pixels[i + 2];
          // Perceived brightness, with the mid-tones opened up a little.
          let light = Math.pow((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255, 0.85);
          if (ink) {
            // How much ink this cell takes: its darkness on a light page, its
            // lightness on a dark one.
            if (onLight) light = 1 - light;
            // Towards the edges the ink thins out, unevenly, so the picture
            // dissolves into the page rather than stopping at a line.
            const edge = Math.min(
              (Math.min(c, columns - 1 - c) + 0.5) / (columns * EDGE),
              (Math.min(r, rows - 1 - r) + 0.5) / (rows * EDGE * 1.4),
            );
            const kept = edge + (hash(n + 104729) - 0.5) * 0.7;
            light *= Math.min(1, Math.max(0, kept)) ** 1.5;
          }
          const level = Math.round(light * top + (hash(n) - 0.5) * 0.9);
          if (level < 1) continue;
          // The cell's hue at full strength; brightness is carried by the
          // character and its opacity instead.
          const peak = Math.max(red, green, blue, 1);
          const lift = (value: number) => Math.round(((value / peak) * 0.86 + 0.14) * 255);
          const cell: Cell = {
            x: c * cellW + cellW / 2,
            y: r * cellH + cellH / 2,
            char: RAMP[Math.min(top, level)],
            color: ink
              ? `rgb(${inkColour} / ${(0.34 + 0.66 * light).toFixed(2)})`
              : `rgb(${lift(red)} ${lift(green)} ${lift(blue)} / ${(0.3 + 0.7 * light).toFixed(2)})`,
            order: hash(n + 7919),
            ox: 0,
            oy: 0,
            vx: 0,
            vy: 0,
            loose: false,
          };
          grid[n] = cell;
          cells.push(cell);
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `bold ${cellH * 0.95}px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const finish = () => {
        settled = true;
        if (pointer) wake();
      };

      if (!animate || still) {
        cells.forEach(paintCell);
        return finish();
      }

      // Develop: draw only the newly arrived cells each frame.
      cells.sort((a, b) => a.order - b.order);
      let start: number | null = null;
      let done = 0;
      const step = (now: number) => {
        // Time from the first frame's own clock. A frame's timestamp can be
        // slightly earlier than "now" was when it was requested, and a
        // negative elapsed time must never reach the maths below.
        start ??= now;
        const progress = Math.min(1, Math.max(0, (now - start) / REVEAL_MS));
        const upTo = Math.min(
          cells.length,
          Math.max(done, Math.round(cells.length * (1 - Math.pow(1 - progress, 2.2)))),
        );
        for (let i = done; i < upTo; i++) paintCell(cells[i]);
        done = upTo;
        if (progress >= 1) finish();
        else if (live) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const loading = new Image();
    loading.crossOrigin = "anonymous";
    loading.decoding = "async";
    loading.onload = () => {
      if (!live) return;
      image = loading;
      render(true);
    };
    loading.src = src;

    // The pointer, in the canvas's own pixels.
    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      pointer = {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
      wake();
    };
    const leave = () => {
      pointer = null;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointercancel", leave);

    // Re-fit on resize, without replaying the reveal. Wait until the size
    // has stopped changing: while the frame is being animated to a new size
    // the canvas simply stretches, and it is redrawn sharp once it lands.
    let lastWidth = el.clientWidth;
    let refit = 0;
    const resizing = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      clearTimeout(refit);
      refit = window.setTimeout(() => live && render(false), 240);
    });
    resizing.observe(el);

    // Ink follows the theme: print again, without the reveal, when it changes.
    const theme = new MutationObserver(() => live && render(false));
    if (ink) {
      for (let node: HTMLElement | null = el; node; node = node.parentElement)
        if (node.hasAttribute("data-theme"))
          theme.observe(node, { attributes: true, attributeFilter: ["data-theme"] });
    }

    return () => {
      live = false;
      theme.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(stir);
      clearTimeout(refit);
      resizing.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointercancel", leave);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [src, ink]);

  return (
    <div
      ref={box}
      role="img"
      aria-label={alt}
      className={`relative ${ink ? "" : "bg-[#05070c]"} ${className}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
