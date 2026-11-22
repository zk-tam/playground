// Makes the site's icons: a black Z with the grain of the character drawings.
//
//   node scripts/make-icons.mjs
//
//   src/app/icon.svg        the tab icon; black, or white when the system is dark
//   src/app/favicon.ico     for browsers that do not take an SVG icon
//   src/app/apple-icon.png  for a phone's home screen
//
// A tab icon is 16 to 32 pixels across, far too small for real characters.
// So there the Z is built from a fine grid of small marks, half a pixel each
// on a sharp display, each a little lighter or darker than the next: what the
// character drawings look like from a distance. The home-screen icon is big
// enough for the real thing, and is set in actual characters. Either way the
// letter keeps a clean outline: the grain is inside it, never around it.
//
// Needs IBM Plex Mono installed, for the home-screen icon.

import { writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { mono } from "./ascii-og.mjs";

const app = new URL("../src/app/", import.meta.url);
const GRID = 32; // the icon's own units, corner to corner
const FINE = 2; // grain marks per unit, each way

// The letter: the Z of IBM Plex Sans Italic, regular weight. These are the
// corners of its outline exactly as the font has them (1000 units to the em,
// y upwards, cap height 698; the font is open source, SIL OFL 1.1).
const PLEX_ITALIC_Z = [
  [487, 72], [472, 0], [-15, 0], [1, 78], [493, 626],
  [119, 626], [134, 698], [603, 698], [587, 620], [95, 72],
];
// Placed on the icon's grid: 24 units tall, centred, the right way up.
const TALL = 24;
const Z = (() => {
  const scale = TALL / 698;
  const xs = PLEX_ITALIC_Z.map(([x]) => x);
  const left = (GRID - (Math.max(...xs) - Math.min(...xs)) * scale) / 2 - Math.min(...xs) * scale;
  const foot = (GRID + TALL) / 2;
  return PLEX_ITALIC_Z.map(([x, y]) => [left + x * scale, foot - y * scale]);
})();

/** A stable pseudo-random number per cell, 0..1. Same as the site's. */
function hash(n) {
  n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function inside(x, y) {
  let within = false;
  for (let i = 0, j = Z.length - 1; i < Z.length; j = i++) {
    const [xi, yi] = Z[i];
    const [xj, yj] = Z[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) within = !within;
  }
  return within;
}

/** How far a point is from the letter's outline. */
function fromEdge(x, y) {
  let nearest = Infinity;
  for (let i = 0, j = Z.length - 1; i < Z.length; j = i++) {
    const [ax, ay] = Z[j];
    const [bx, by] = Z[i];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    nearest = Math.min(nearest, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
  }
  return nearest;
}

/**
 * How much ink a point takes, 0..1. Nothing outside the letter. Inside, an
 * uneven grain, a shade lighter right at the edge so the outline is soft
 * without being ragged.
 */
function ink(x, y, n, edge) {
  if (!inside(x, y)) return 0;
  const grain = hash(n);
  const tone = grain < 0.1 ? 0.5 : grain < 0.3 ? 0.68 : grain < 0.62 ? 0.86 : 1;
  return fromEdge(x, y) < edge ? Math.min(tone, 0.68) : tone;
}

// ── The tab icon: fine marks on a grid ─────────────────────────────────────

/**
 * The letter's marks, grouped by how dark they are, as SVG path data: short
 * horizontal strokes, one row of the grid thick. Neighbours of the same tone
 * are drawn as one stroke.
 */
function marks() {
  const step = 1 / FINE;
  const count = GRID * FINE;
  const byTone = new Map();
  for (let row = 0; row < count; row++) {
    let run = null; // { tone, from, length }
    const flush = () => {
      if (!run) return;
      const d = `M${run.from * step} ${(row + 0.5) * step}h${run.length * step}`;
      byTone.set(run.tone, (byTone.get(run.tone) ?? "") + d);
      run = null;
    };
    for (let column = 0; column < count; column++) {
      const tone = ink((column + 0.5) * step, (row + 0.5) * step, row * count + column, 0.3);
      if (run && run.tone === tone) run.length++;
      else {
        flush();
        if (tone) run = { tone, from: column, length: 1 };
      }
    }
    flush();
  }
  return [...byTone].sort((a, b) => b[0] - a[0]);
}

const grain = marks();
const STROKE = 1 / FINE;

await writeFile(
  new URL("icon.svg", app),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" fill="none" stroke-width="${STROKE}">
  <!-- Made by scripts/make-icons.mjs. Do not edit by hand. -->
  <style>
    path { stroke: #000; }
    @media (prefers-color-scheme: dark) {
      path { stroke: #fff; }
    }
  </style>
${grain.map(([tone, d]) => `  <path opacity="${tone}" d="${d}" />`).join("\n")}
</svg>
`,
);
console.log("  src/app/icon.svg");

async function png(size, element, options) {
  const response = new ImageResponse(element, { width: size, height: size, ...options });
  return Buffer.from(await response.arrayBuffer());
}

/** The same marks as a picture, in one colour. */
const tab = (size, colour) =>
  png(
    size,
    h(
      "div",
      { style: { width: "100%", height: "100%", display: "flex" } },
      h(
        "svg",
        { width: size, height: size, viewBox: `0 0 ${GRID} ${GRID}` },
        grain.map(([tone, d]) =>
          h("path", { key: tone, d, fill: "none", stroke: colour, strokeWidth: STROKE, opacity: tone }),
        ),
      ),
    ),
  );

/** An .ico that simply wraps PNGs, one per size. */
function ico(pictures) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // an icon
  header.writeUInt16LE(pictures.length, 4);
  let offset = 6 + 16 * pictures.length;
  const entries = pictures.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pictures.map(({ data }) => data)]);
}

// An .ico cannot tell a light tab bar from a dark one, and black would vanish
// on a dark one. It gets one grey that reads on both.
const pictures = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, data: await tab(size, "#7a7a7a") })),
);
await writeFile(new URL("favicon.ico", app), ico(pictures));
console.log("  src/app/favicon.ico");

// ── The home-screen icon: real characters ───────────────────────────────────

// Sparse to dense, as on the site, in cells finer than the site's: the icon
// is small, and the characters should read as grain.
const RAMP = " .`,:;-=+*#%@";
const SIZE = 180;
const CELL_W = 2;
const CELL_H = 4;

function characters() {
  const columns = SIZE / CELL_W;
  const rows = SIZE / CELL_H;
  const top = RAMP.length - 1;
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < columns; c++) {
      const n = r * columns + c;
      const x = ((c + 0.5) / columns) * GRID;
      const y = ((r + 0.5) / rows) * GRID;
      const level = Math.round(ink(x, y, n, 0.3) * top + (hash(n + 7) - 0.5) * 0.9);
      line += RAMP[Math.max(0, Math.min(top, level))];
    }
    lines.push(h("div", { key: r, style: { height: CELL_H, whiteSpace: "pre" } }, line));
  }
  return lines;
}

// A home-screen icon is never see-through: black characters on the site's paper.
await writeFile(
  new URL("apple-icon.png", app),
  await png(
    SIZE,
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#fcfcfc",
          color: "#000",
          fontFamily: "Plex",
          fontWeight: 700,
          // Plex Mono is 0.6em wide: 2.28px at this size, pulled in to the 2px cell.
          fontSize: 3.8,
          lineHeight: `${CELL_H}px`,
          letterSpacing: "-0.28px",
        },
      },
      characters(),
    ),
    { fonts: await mono() },
  ),
);
console.log("  src/app/apple-icon.png");
