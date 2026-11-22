"use client";

import { useEffect, useRef } from "react";
import { Spring } from "@/lib/spring";

/* ── The picture ────────────────────────────────────────────────────────
   Blueprint's background is one subject, rendered as ASCII art: the Moon,
   large and cropped by the top corner of the screen, in a field of stars.

   Nothing is loaded. The surface is built once: a sphere, a hundred or so
   craters pressed into it, darker seas, and a little grit. After that the
   only thing that changes is the light. The pointer steers it, so moving
   across the page takes the Moon through its phases: full when you are on
   it, a thin crescent when you are far away. */

// Sparse to dense. Only small marks, no letters and no tall strokes, and at
// this size they stop reading as characters and blend into tone, the way the
// dots of a halftone do.
const RAMP = " .`,:;-=+*#%@";
const CELL_W = 3; // css px
const CELL_H = 6;
const FRAME_MS = 70; // about 14 frames a second

function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Classic value noise on a shuffled lattice. Seeded, so the Moon is the same
// Moon on every visit.
const perm = (() => {
  const table = new Uint8Array(512);
  const random = seeded(20261122);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = (random() * (i + 1)) | 0;
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) table[i] = base[i & 255];
  return table;
})();

function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = perm[perm[xi & 255] + (yi & 255)];
  const b = perm[perm[(xi + 1) & 255] + (yi & 255)];
  const c = perm[perm[xi & 255] + ((yi + 1) & 255)];
  const d = perm[perm[(xi + 1) & 255] + ((yi + 1) & 255)];
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) / 255;
}

/** Fractal noise: a few octaves, each finer and fainter. Returns 0..1. */
function fbm(x: number, y: number, octaves: number) {
  let sum = 0;
  let gain = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y) * gain;
    total += gain;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.2;
    gain *= 0.5;
  }
  return sum / total;
}

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Craters, as points on the near side of a unit sphere with an angular size.
// A few big basins, many small pocks.
const CRATERS = (() => {
  const random = seeded(7);
  return Array.from({ length: 64 }, () => {
    const z = 0.12 + 0.88 * random();
    const around = random() * Math.PI * 2;
    const flat = Math.sqrt(1 - z * z);
    return {
      x: flat * Math.cos(around),
      y: flat * Math.sin(around),
      z,
      size: 0.045 + Math.pow(random(), 2.2) * 0.2,
    };
  });
})();

// Colour by tone: deep blue in shadow, through sky, to a cool white.
const STOPS: [at: number, r: number, g: number, b: number, alpha: number][] = [
  [0, 58, 92, 168, 0.5],
  [0.4, 104, 152, 236, 0.78],
  [0.75, 170, 212, 255, 0.94],
  [1, 236, 247, 255, 1],
];

function tone(f: number) {
  let i = 1;
  while (i < STOPS.length - 1 && f > STOPS[i][0]) i++;
  const [a0, ...from] = STOPS[i - 1];
  const [a1, ...to] = STOPS[i];
  const k = Math.min(1, Math.max(0, (f - a0) / (a1 - a0)));
  const [r, g, b, alpha] = from.map((value, n) => value + (to[n] - value) * k);
  return `rgb(${r | 0} ${g | 0} ${b | 0} / ${alpha.toFixed(3)})`;
}

/**
 * The layer behind the page. Only Blueprint has one: it is drawn here, and
 * only runs while Blueprint is the theme and the tab is visible.
 *
 * It is cheap to keep alive. The surface is worked out once per window size;
 * each frame is one dot product per Moon cell. Characters are stamped from a
 * small pre-rendered strip, and a cell is only touched when its character
 * actually changes.
 */
export function Backdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!el || !canvas || !ctx) return;

    // Where the light comes from: the pointer, softened by a spring.
    const soft = { stiffness: 70, damping: 18, precision: 0.2 };
    const x = new Spring(0, () => {}, soft);
    const y = new Spring(0, () => {}, soft);

    const strip = document.createElement("canvas");
    const levels = RAMP.length;
    let ratio = 1;
    let cellW = CELL_W;
    let cellH = CELL_H;
    let columns = 0;
    let shown = new Uint8Array(0);
    let frame = 0;
    let last = 0;
    let running = false;

    // The Moon, in css px.
    let centreX = 0;
    let centreY = 0;
    let radius = 1;
    let narrow = false;

    // Per-cell data, filled by `build`.
    let moon = new Uint32Array(0); // cell index
    let normals = new Float32Array(0); // nx, ny, nz
    let albedo = new Float32Array(0);
    let dither = new Float32Array(0); // a fixed offset per cell, -0.5..0.5
    let halo = new Uint32Array(0);
    let haloGlow = new Float32Array(0); // strength, dither
    let stars = new Uint32Array(0);
    let starLight = new Float32Array(0); // brightness, twinkle phase

    const stamp = (cell: number, level: number) => {
      if (shown[cell] === level) return;
      shown[cell] = level;
      const cx = (cell % columns) * cellW;
      const cy = ((cell / columns) | 0) * cellH;
      ctx.clearRect(cx, cy, cellW, cellH);
      if (level) ctx.drawImage(strip, level * cellW, 0, cellW, cellH, cx, cy, cellW, cellH);
    };

    const build = () => {
      const width = innerWidth;
      const height = innerHeight;
      ratio = Math.min(2, devicePixelRatio || 1);
      // Whole device pixels per cell, so stamped characters stay crisp.
      cellW = Math.round(CELL_W * ratio);
      cellH = Math.round(CELL_H * ratio);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      columns = Math.ceil(canvas.width / cellW);
      const rows = Math.ceil(canvas.height / cellH);
      shown = new Uint8Array(columns * rows);

      // One sprite per tone, each already in its colour.
      strip.width = cellW * levels;
      strip.height = cellH;
      const pen = strip.getContext("2d");
      if (pen) {
        pen.clearRect(0, 0, strip.width, strip.height);
        pen.font = `bold ${Math.round(cellH * 0.95)}px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace`;
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        for (let i = 1; i < levels; i++) {
          pen.fillStyle = tone(i / (levels - 1));
          pen.fillText(RAMP[i], i * cellW + cellW / 2, cellH / 2);
        }
      }

      // Sized from the longer side of the screen, so it never shrinks to a
      // dot. On a wide screen it is cropped by the top right corner, beside
      // the page. On a phone there is no "beside", so it rises from the
      // bottom edge instead, clear of the text at the top.
      narrow = width < 760;
      if (narrow) {
        radius = Math.min(Math.max(height * 0.44, 260), 440);
        centreX = width * 0.5 + radius * 0.1;
        centreY = height + radius * 0.46;
      } else {
        radius = Math.min(Math.max(Math.max(width, height) * 0.4, 240), 520);
        centreX = width - radius * 0.38;
        centreY = radius * 0.56;
      }

      const moonCells: number[] = [];
      const moonNormals: number[] = [];
      const moonAlbedo: number[] = [];
      const moonDither: number[] = [];
      const haloCells: number[] = [];
      const haloLevels: number[] = [];
      const starCells: number[] = [];
      const starLevels: number[] = [];
      const random = seeded(99);
      const stepX = cellW / ratio;
      const stepY = cellH / ratio;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          const cell = r * columns + c;
          const px = ((c + 0.5) * stepX - centreX) / radius;
          const py = ((r + 0.5) * stepY - centreY) / radius;
          const d2 = px * px + py * py;
          const twinkle = random(); // drawn for every cell so stars don't move on resize

          if (d2 >= 1) {
            const away = Math.sqrt(d2) - 1;
            if (away < 0.3) {
              // A soft glow in the sky just off the limb.
              haloCells.push(cell);
              haloLevels.push(Math.pow(1 - away / 0.3, 2.4), twinkle - 0.5);
            } else if (twinkle > 0.9968) {
              starCells.push(cell);
              starLevels.push(0.12 + Math.pow(random(), 4) * 0.7, random() * Math.PI * 2);
            }
            continue;
          }

          // The point on the sphere this cell looks at.
          const pz = Math.sqrt(1 - d2);
          let nx = px;
          let ny = py;
          let nz = pz;

          // Press each crater in: a bowl that rises to a rim, then falls away.
          for (const crater of CRATERS) {
            const along = px * crater.x + py * crater.y + pz * crater.z;
            if (along < 0.9) continue; // far side of it
            const tx = px - crater.x * along;
            const ty = py - crater.y * along;
            const tz = pz - crater.z * along;
            const off = Math.sqrt(tx * tx + ty * ty + tz * tz);
            const t = off / crater.size;
            if (t > 1.35 || off === 0) continue;
            const slope = t < 1 ? 1.5 * t : -1.3 * (1 - (t - 1) / 0.35);
            const k = (slope * 0.7) / off;
            nx -= tx * k;
            ny -= ty * k;
            nz -= tz * k;
          }

          // Grit, so no area is perfectly smooth.
          nx += (fbm(px * 14 + 3, py * 14 + 9, 3) - 0.5) * 0.16;
          ny += (fbm(px * 14 + 31, py * 14 + 17, 3) - 0.5) * 0.16;
          const length = Math.hypot(nx, ny, nz);

          // The seas: broad, darker plains.
          const seas = fbm(px * 1.7 + 4.2, py * 1.7 + 8.1, 4);
          const fine = fbm(px * 9 + 1.3, py * 9 + 2.7, 3);
          const limb = smooth(1, 0.94, Math.sqrt(d2));

          moonCells.push(cell);
          moonDither.push(twinkle - 0.5);
          moonNormals.push(nx / length, ny / length, nz / length);
          moonAlbedo.push((0.52 + 0.48 * smooth(0.4, 0.6, seas)) * (0.86 + 0.28 * fine) * limb);
        }
      }

      moon = Uint32Array.from(moonCells);
      normals = Float32Array.from(moonNormals);
      albedo = Float32Array.from(moonAlbedo);
      dither = Float32Array.from(moonDither);
      halo = Uint32Array.from(haloCells);
      haloGlow = Float32Array.from(haloLevels);
      stars = Uint32Array.from(starCells);
      starLight = Float32Array.from(starLevels);
    };

    const draw = (now: number) => {
      // Light direction, set by the pointer. On the Moon it shines straight
      // on; the further away, the more it rakes across. On a wide screen the
      // pointer is usually over the page, to the Moon's left, and the part of
      // the Moon you can see is its right; so there the light comes from the
      // side opposite the pointer, which keeps the visible part lit.
      let lx = ((x.value - centreX) / (radius * 2.3)) * (narrow ? 1 : -1);
      let ly = (y.value - centreY) / (radius * 2.3);
      const reach = Math.hypot(lx, ly);
      if (reach > 0.985) {
        lx *= 0.985 / reach;
        ly *= 0.985 / reach;
      }
      const lz = Math.sqrt(1 - lx * lx - ly * ly);

      for (let i = 0; i < moon.length; i++) {
        const lit = normals[i * 3] * lx + normals[i * 3 + 1] * ly + normals[i * 3 + 2] * lz;
        // A little earthshine keeps the dark side from vanishing entirely.
        const shade = albedo[i] * (lit > 0 ? Math.pow(lit, 0.82) * 0.96 + 0.04 : 0.04);
        // Dithering: nudging each cell by its own fixed amount breaks the
        // bands between tones into a blend, as a print would.
        const level = shade * (levels - 1) + dither[i] * 0.9;
        stamp(moon[i], level < 0 ? 0 : level > levels - 1 ? levels - 1 : Math.round(level));
      }

      // The glow is brighter the fuller the Moon.
      const fullness = 0.25 + 0.75 * lz;
      for (let i = 0; i < halo.length; i++) {
        // Dithered like the surface, so the glow fades out instead of banding.
        const glow = haloGlow[i * 2] * fullness * 3.4 + haloGlow[i * 2 + 1] * 1.1;
        stamp(halo[i], glow < 0.5 ? 0 : Math.round(glow));
      }

      const t = now / 1000;
      for (let i = 0; i < stars.length; i++) {
        const flicker = 0.8 + 0.2 * Math.sin(t * 0.9 + starLight[i * 2 + 1]);
        stamp(stars[i], Math.max(1, (starLight[i * 2] * flicker * levels) | 0));
      }
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };

    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const isOn = () =>
      document.documentElement.getAttribute("data-theme") === "blueprint" &&
      !document.hidden;

    // Start or stop to match the theme and tab visibility.
    const sync = () => {
      cancelAnimationFrame(frame);
      running = isOn();
      if (!running) return;
      build();
      // Until the pointer moves, light it from the upper left: a gibbous Moon
      // on a wide screen, a sunlit horizon on a phone.
      x.jump(centreX - radius * (narrow ? 0.7 : 1.5));
      y.jump(centreY - radius * (narrow ? 1.7 : 0.5));
      // Paint once straight away, so the picture is there the moment the
      // theme is; then keep it alive, unless motion is unwelcome.
      draw(performance.now());
      if (!still.matches) frame = requestAnimationFrame(tick);
    };

    const move = (event: PointerEvent) => {
      if (!running) return;
      x.to(event.clientX);
      y.to(event.clientY);
    };

    const themes = new MutationObserver(sync);
    themes.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("pointermove", move, { passive: true });
    sync();

    return () => {
      themes.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
      x.stop();
      y.stop();
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="backdrop">
      <canvas ref={canvasRef} />
    </div>
  );
}
