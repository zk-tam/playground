// Makes every link-preview picture on the site, each one drawn in characters
// like the covers are.
//
//   node scripts/make-og.mjs
//
//   public/og/home.png             the site's words, set large
//   public/og/absolute-cinema.png  the module's own picture, whole, on the dark
//   public/cinema/og/<id>.png      each scene, from its cover
//   public/cinema/strip/<id>.jpg   the same drawing, small, for the film strip
//
// The pictures are committed like any other. Run this again when a scene is
// added (after scripts/make-covers.py), or when the words or artwork change.
//
// Needs IBM Plex Mono installed, and `sips`, which ships with macOS.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { HEIGHT, NIGHT, WIDTH, ascii, mono } from "./ascii-og.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = await mkdtemp(join(tmpdir(), "make-og-"));

/** Lays out a page and saves it as a picture for `ascii` to draw from. */
async function picture(name, element, options) {
  const response = new ImageResponse(element, { width: WIDTH, height: HEIGHT, ...options });
  const file = join(work, name);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

async function save(target, source) {
  const file = join(root, "public", target);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, await ascii(source));
  console.log(`  public/${target}`);
}

/**
 * What the site stands for, and nothing else. Set very large and heavy:
 * anything finer would not survive being drawn in characters.
 */
function home() {
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "0 56px 60px",
        backgroundColor: "#000",
        color: "#fff",
        fontFamily: "Plex",
        fontWeight: 700,
        fontSize: 150,
        lineHeight: 1.02,
        letterSpacing: "-0.03em",
      },
    },
    h("div", {}, "Be"),
    h("div", {}, "Opinionated."),
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
    h("img", { src: `data:image/png;base64,${file.toString("base64")}`, width, height: HEIGHT }),
    h("div", { style: { ...fade("right"), left: side } }),
    h("div", { style: { ...fade("left"), right: side } }),
  );
}

try {
  await save("og/home.png", await picture("home.png", home(), { fonts: await mono() }));
  await save("og/absolute-cinema.png", await picture("cinema.png", await cinema()));

  // Every scene that has a cover of its own. The cover is 16:9; the preview
  // is a little wider, so a sliver comes off the top and bottom.
  const covers = JSON.parse(await readFile(join(root, "src/modules/cinema/covers.json"), "utf8"));
  await mkdir(join(root, "public/cinema/strip"), { recursive: true });
  for (const id of covers) {
    await save(`cinema/og/${id}.png`, join(root, `public/cinema/${id}.jpg`));
    // A frame on the film strip is under 200px wide: a small copy is plenty.
    await promisify(execFile)("sips", [
      "-Z", "352", "-s", "format", "jpeg", "-s", "formatOptions", "82",
      join(root, `public/cinema/og/${id}.png`),
      "--out", join(root, `public/cinema/strip/${id}.jpg`),
    ]);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
