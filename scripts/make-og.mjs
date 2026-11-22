// Makes the link-preview pictures for the pages that have no frame of their
// own: the home page and the Absolute Cinema page. (Scenes get theirs from
// scripts/make-covers.py.)
//
//   node scripts/make-og.mjs
//
// It writes 1200x630 pictures into public/og/, which are committed like any
// other picture. Run it again only when the words or the artwork change.
//
// The type is IBM Plex Mono if it is installed on this machine, and the font
// that ships with Next if not. Needs `sips`, which ships with macOS, for the
// one picture that is saved as a JPEG.

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "public/og");
const WIDTH = 1200;
const HEIGHT = 630;
const NIGHT = "#05070c"; // the dark the scene covers are drawn on

async function fonts() {
  const found = [];
  for (const [file, weight] of [["IBMPlexMono-Regular.ttf", 400], ["IBMPlexMono-Medium.ttf", 500]]) {
    for (const folder of [join(homedir(), "Library/Fonts"), "/Library/Fonts"]) {
      const data = await readFile(join(folder, file)).catch(() => null);
      if (!data) continue;
      found.push({ name: "Plex", data, weight, style: "normal" });
      break;
    }
  }
  if (!found.length) console.log("  IBM Plex Mono not found; using Next's own font.");
  return found.length ? found : undefined;
}

async function png(element, options) {
  const response = new ImageResponse(element, { width: WIDTH, height: HEIGHT, ...options });
  return Buffer.from(await response.arrayBuffer());
}

/** The site's name, small, and what it stands for, large. Nothing else. */
function home() {
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        backgroundColor: NIGHT,
        color: "#ededed",
        fontFamily: "Plex",
      },
    },
    h("div", { style: { fontSize: 34, fontWeight: 400, color: "#8c8c8c" } }, "Playground"),
    h(
      "div",
      { style: { fontSize: 112, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1 } },
      "Be Opinionated.",
    ),
  );
}

/**
 * The module's own picture, whole, at full height in the middle. It is
 * nearer square than a link preview, so the dark carries on to either side
 * and the picture's edges are faded into it.
 */
async function cinema() {
  const file = await readFile(join(root, "public/modules/absolute-cinema.png"));
  const width = Math.round((HEIGHT * 860) / 705);
  const side = (WIDTH - width) / 2;
  const fade = (to) => ({
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 150,
    backgroundImage: `linear-gradient(to ${to}, ${NIGHT}, rgba(5, 7, 12, 0))`,
  });
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        backgroundColor: NIGHT,
      },
    },
    h("img", {
      src: `data:image/png;base64,${file.toString("base64")}`,
      width,
      height: HEIGHT,
    }),
    h("div", { style: { ...fade("right"), left: side } }),
    h("div", { style: { ...fade("left"), right: side } }),
  );
}

await mkdir(out, { recursive: true });
const type = await fonts();

await writeFile(join(out, "home.png"), await png(home(), { fonts: type }));
console.log("  public/og/home.png");

// A photograph is far smaller as a JPEG.
const whole = join(out, "absolute-cinema.png");
await writeFile(whole, await png(await cinema()));
await promisify(execFile)("sips", [
  "-s", "format", "jpeg", "-s", "formatOptions", "86",
  whole, "--out", join(out, "absolute-cinema.jpg"),
]);
await rm(whole);
console.log("  public/og/absolute-cinema.jpg");
