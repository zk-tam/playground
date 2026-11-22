// A picture redrawn in characters, as a 1200x630 PNG: the same drawing the
// site does in the browser (src/kit/ascii-frame.tsx), done ahead of time so
// it can be a link preview, which has to be a plain picture file.
//
// Used by scripts/make-og.mjs. Needs `sips` (ships with macOS) to read the
// source picture, and IBM Plex Mono installed for the characters.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";

const run = promisify(execFile);

export const WIDTH = 1200;
export const HEIGHT = 630;
export const NIGHT = "#05070c"; // the dark the site's covers are drawn on

// Sparse to dense, as on the site. The cells are the site's size too: small
// enough that the characters read as tone, not as letters.
const RAMP = " .`,:;-=+*#%@";
const CELL_W = 3;
const CELL_H = 6;
const COLUMNS = WIDTH / CELL_W; // 400
const ROWS = HEIGHT / CELL_H; // 105

/** A stable pseudo-random number per cell, 0..1. Same as the site's. */
function hash(n) {
  n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

let plex;
/** IBM Plex Mono, from this machine's font folders. */
export async function mono() {
  if (plex) return plex;
  const found = [];
  for (const [file, weight] of [
    ["IBMPlexMono-Regular.ttf", 400],
    ["IBMPlexMono-Medium.ttf", 500],
    ["IBMPlexMono-Bold.ttf", 700],
  ]) {
    for (const folder of [join(homedir(), "Library/Fonts"), "/Library/Fonts"]) {
      const data = await readFile(join(folder, file)).catch(() => null);
      if (!data) continue;
      found.push({ name: "Plex", data, weight, style: "normal" });
      break;
    }
  }
  if (found.length < 3) throw new Error("IBM Plex Mono (Regular, Medium, Bold) is not installed.");
  return (plex = found);
}

/**
 * The picture shrunk to one pixel per character cell: rows of [r, g, b]. A
 * picture of another shape is first cropped around its middle to fit.
 */
async function pixels(source) {
  const work = await mkdtemp(join(tmpdir(), "ascii-og-"));
  try {
    const { stdout } = await run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", source]);
    const wide = Number(/pixelWidth: (\d+)/.exec(stdout)[1]);
    const high = Number(/pixelHeight: (\d+)/.exec(stdout)[1]);
    const shape = WIDTH / HEIGHT;
    const cropW = Math.round(Math.min(wide, high * shape));
    const cropH = Math.round(Math.min(high, wide / shape));
    const fitted = join(work, "fitted.png");
    await run("sips", ["-s", "format", "png", "-c", cropH, cropW, source, "--out", fitted]);
    const small = join(work, "small.bmp");
    await run("sips", ["-z", ROWS, COLUMNS, "-s", "format", "bmp", fitted, "--out", small]);
    const data = await readFile(small);
    const offset = data.readUInt32LE(10);
    const width = data.readInt32LE(18);
    const tall = data.readInt32LE(22);
    const step = data.readUInt16LE(28) / 8;
    const stride = (width * step + 3) & ~3;
    const height = Math.abs(tall);
    const rows = [];
    for (let y = 0; y < height; y++) {
      const line = offset + (tall < 0 ? y : height - 1 - y) * stride;
      const row = [];
      for (let x = 0; x < width; x++) {
        const at = line + x * step;
        row.push([data[at + 2], data[at + 1], data[at]]);
      }
      rows.push(row);
    }
    return rows;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Draws the picture at `source` in characters, as a 1200x630 PNG. */
export async function ascii(source) {
  const grid = await pixels(source);
  const top = RAMP.length - 1;

  const lines = grid.map((row, r) => {
    // Neighbouring cells of the same colour share one piece of text.
    const pieces = [];
    let text = "";
    let colour = null;
    const flush = () => {
      if (text) pieces.push(h("span", { key: pieces.length, style: { color: colour ?? "transparent" } }, text));
      text = "";
    };
    row.forEach(([red, green, blue], c) => {
      const n = r * COLUMNS + c;
      // Perceived brightness, with the mid-tones opened up a little.
      const light = Math.pow((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255, 0.85);
      const level = Math.round(light * top + (hash(n) - 0.5) * 0.9);
      if (level < 1) {
        text += " ";
        return;
      }
      // The cell's hue at full strength; brightness is carried by the
      // character and its opacity. Rounded off a little so runs can form.
      const peak = Math.max(red, green, blue, 1);
      const lift = (value) => Math.round((((value / peak) * 0.86 + 0.14) * 255) / 16) * 16;
      const next = `rgba(${Math.min(255, lift(red))}, ${Math.min(255, lift(green))}, ${Math.min(255, lift(blue))}, ${(Math.round((0.3 + 0.7 * light) * 10) / 10).toFixed(1)})`;
      if (next !== colour) {
        flush();
        colour = next;
      }
      text += RAMP[Math.min(top, level)];
    });
    flush();
    return h("div", { key: r, style: { display: "flex", height: CELL_H, whiteSpace: "pre" } }, pieces);
  });

  const page = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        backgroundColor: NIGHT,
        fontFamily: "Plex",
        fontWeight: 700,
        // Plex Mono is 0.6em wide. At 5.7px that is 3.42px, pulled in to the
        // 3px cell, so each character slightly overlaps the next as on the site.
        fontSize: 5.7,
        lineHeight: `${CELL_H}px`,
        letterSpacing: "-0.42px",
      },
    },
    lines,
  );
  const response = new ImageResponse(page, { width: WIDTH, height: HEIGHT, fonts: await mono() });
  return Buffer.from(await response.arrayBuffer());
}
