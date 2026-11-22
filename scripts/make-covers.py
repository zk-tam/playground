#!/usr/bin/env python3
"""
Turn raw frames into Absolute Cinema's covers.

Put one frame per scene in `covers/` at the project root, named either by the
scene's slug (finals.png) or by its position in the list (1.png, 2.png, ...).
Then run:

    python3 scripts/make-covers.py

For every frame it finds, this:

  1. trims any black letterbox bars baked into the frame,
  2. crops what is left to 16:9, the shape of the player and of four of the
     five original frames, so the set loses as little picture as possible,
  3. writes `public/cinema/<id>.jpg` (1600x900), which the site draws in ASCII,
  4. writes `public/cinema/og/<id>.jpg` (1200x630), the plain photograph at
     link-preview size. (The preview actually served is the cover drawn in
     characters: run `node scripts/make-og.mjs` afterwards to make it.)
  5. records the scene in `src/modules/cinema/covers.json`, which is how the
     site knows to use it instead of the YouTube thumbnail.

Frames are cropped around their middle by default. To keep a different part,
add the scene's slug to FOCUS below: (0, 0) keeps the top left, (1, 1) the
bottom right.

Needs only Python 3 and `sips`, which ships with macOS.
"""

import json
import math
import re
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "covers"
SCENES = ROOT / "src/modules/cinema/scenes.ts"
MANIFEST = ROOT / "src/modules/cinema/covers.json"
OUT = ROOT / "public/cinema"

RATIO = 16 / 9
COVER = (1600, 900)
PREVIEW = (1200, 630)  # what link previews expect, close to 1.91:1

# Where the subject sits, as (across, down) from 0 to 1. Only matters on the
# axis that gets cropped.
FOCUS = {
    "finals": (0.5, 0.34),  # a 4:3 frame: keep the faces, lose the floor
    "the-best": (0.47, 0.5),  # a very wide frame: he stands just left of centre
    "when-are-you-gonna-take-it": (0.63, 0.5),  # the leopard sits right of centre
}

# Frames whose subject gets lost once it is drawn in characters, because what
# surrounds it is just as bright. Their cover (never the link preview) is
# treated so the subject is what the characters draw:
#
#   close  zoom in by this much, around this point of the 16:9 crop
#   light  a spotlight on the treated cover: its middle, how far the full light
#          reaches (fractions of the cover, across and down), and how much
#          light is left at the far edges
#   cool   how much light cool tones keep; warm ones keep all of theirs
#   gain   brighten what is left by this much
TREAT = {
    # A cream leopard on blue-grey rock and snow: keep the warm, dim the cool.
    "when-are-you-gonna-take-it": {
        "close": (1.3, (0.506, 0.38)),
        "light": ((0.5, 0.53), (0.36, 0.26), 0.2),
        "cool": 0.3,
        "gain": 1.5,
    },
}
LIGHT_FADE = 0.9  # how gradually the spotlight falls away, in its own widths

EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".heic")


def sips(*args):
    subprocess.run(["sips", *map(str, args)], check=True, capture_output=True)


def size_of(path):
    out = subprocess.run(
        ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    width = int(re.search(r"pixelWidth: (\d+)", out).group(1))
    height = int(re.search(r"pixelHeight: (\d+)", out).group(1))
    return width, height


def content_box(path, work):
    """The frame without its black bars, as fractions: left, top, right, bottom."""
    small = work / "small.bmp"
    sips("-Z", 320, "-s", "format", "bmp", path, "--out", small)
    data = small.read_bytes()
    offset, = struct.unpack_from("<I", data, 10)
    width, height = struct.unpack_from("<ii", data, 18)
    depth, = struct.unpack_from("<H", data, 28)
    step = depth // 8
    stride = (width * step + 3) & ~3
    top_down = height < 0
    height = abs(height)

    def bright(x, y):
        row = y if top_down else height - 1 - y
        at = offset + row * stride + x * step
        return max(data[at], data[at + 1], data[at + 2])

    def lit(points):
        return sum(1 for x, y in points if bright(x, y) > 22) / len(points)

    def row(y):
        return [(x, y) for x in range(width)]

    def column(x):
        return [(x, y) for y in range(height)]

    def bars(line, count):
        """How many lines of bar there are, working inwards from one edge."""
        n = 0
        while n < count // 2 and lit(line(n)) < 0.02:
            n += 1
        # A real bar ends abruptly, with picture right behind it. A dark scene
        # that fades to black at its edge does not, and must be left alone.
        return n if n and lit(line(n)) > 0.2 else 0

    top = bars(row, height)
    bottom = height - bars(lambda i: row(height - 1 - i), height)
    left = bars(column, width)
    right = width - bars(lambda i: column(width - 1 - i), width)

    # One sampled pixel of margin, so no sliver of bar survives.
    grow = lambda edge, limit: min(limit, edge + 1) if edge else 0
    shrink = lambda edge, limit: max(0, edge - 1) if edge < limit else limit
    return (
        grow(left, width) / width,
        grow(top, height) / height,
        shrink(right, width) / width,
        shrink(bottom, height) / height,
    )


def scenes():
    """(slug, id) pairs, in order, read from the scene list itself."""
    text = SCENES.read_text()
    found = re.findall(r'id:\s*"([^"]+)",\s*slug:\s*"([^"]+)"', text)
    if not found:
        sys.exit(f"Could not read any scenes from {SCENES}")
    return [(slug, video) for video, slug in found]


def find_frame(position, slug):
    for name in (slug, str(position)):
        for extension in EXTENSIONS:
            for candidate in (SOURCE / f"{name}{extension}", SOURCE / f"{name}{extension.upper()}"):
                if candidate.exists():
                    return candidate
    return None


def crop(source, target, box, size, work):
    """Cut `box` (x, y, width, height in pixels) out of source, sized to `size`."""
    x, y, width, height = (round(v) for v in box)
    middle = work / "crop.png"
    # Say the format outright: left alone, sips tries to keep the source's
    # format, and it cannot write some of the ones it can read (WebP).
    sips("-s", "format", "png", "-c", height, width, "--cropOffset", y, x, source, "--out", middle)
    target.parent.mkdir(parents=True, exist_ok=True)
    sips(
        "-z", size[1], size[0],
        "-s", "format", "jpeg", "-s", "formatOptions", 84,
        middle, "--out", target,
    )


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def treat(path, how, work):
    """Light a finished cover so its subject stands out. See TREAT."""
    bitmap = work / "treat.bmp"
    sips("-s", "format", "bmp", path, "--out", bitmap)
    data = bytearray(bitmap.read_bytes())
    offset, = struct.unpack_from("<I", data, 10)
    width, height = struct.unpack_from("<ii", data, 18)
    depth, = struct.unpack_from("<H", data, 28)
    step = depth // 8
    stride = (width * step + 3) & ~3
    top_down = height < 0
    height = abs(height)

    centre, reach, floor = how.get("light", ((0.5, 0.5), (1, 1), 1))
    cool = how.get("cool", 1)
    gain = how.get("gain", 1)
    cx, cy = centre[0] * width, centre[1] * height
    rx, ry = reach[0] * width, reach[1] * height
    for y in range(height):
        row = y if top_down else height - 1 - y
        start = offset + row * stride
        down = ((y - cy) / ry) ** 2
        for x in range(width):
            at = start + x * step
            blue, green, red = data[at], data[at + 1], data[at + 2]
            # 1 at the rim of the full light, growing with distance past it.
            distance = math.sqrt(((x - cx) / rx) ** 2 + down)
            lit = 1 - (1 - floor) * smooth((distance - 1) / LIGHT_FADE)
            # Warm means more red than blue.
            kept = cool + (1 - cool) * smooth((red - blue - 2) / 16)
            by = lit * kept * gain
            data[at] = min(255, int(blue * by))
            data[at + 1] = min(255, int(green * by))
            data[at + 2] = min(255, int(red * by))

    bitmap.write_bytes(data)
    sips("-s", "format", "jpeg", "-s", "formatOptions", 84, bitmap, "--out", path)


def main():
    if not SOURCE.is_dir():
        sys.exit(f"Make a folder at {SOURCE} and put the frames in it.")

    made = set(json.loads(MANIFEST.read_text())) if MANIFEST.exists() else set()
    done = 0
    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        for position, (slug, video) in enumerate(scenes(), start=1):
            frame = find_frame(position, slug)
            if not frame:
                print(f"  {position}. {slug}: no frame found, skipped")
                continue

            full_w, full_h = size_of(frame)
            left, top, right, bottom = content_box(frame, work)
            x0, y0 = left * full_w, top * full_h
            w, h = (right - left) * full_w, (bottom - top) * full_h
            across, down = FOCUS.get(slug, (0.5, 0.5))

            # The largest 16:9 rectangle inside the picture, placed by focus.
            if w / h > RATIO:
                cw, ch = h * RATIO, h
                cx, cy = x0 + (w - cw) * across, y0
            else:
                cw, ch = w, w / RATIO
                cx, cy = x0, y0 + (h - ch) * down
            how = TREAT.get(slug, {})
            zoom, (at_x, at_y) = how.get("close", (1, (0.5, 0.5)))
            zw, zh = cw / zoom, ch / zoom
            zx = cx + min(cw - zw, max(0, at_x * cw - zw / 2))
            zy = cy + min(ch - zh, max(0, at_y * ch - zh / 2))
            crop(frame, OUT / f"{video}.jpg", (zx, zy, zw, zh), COVER, work)
            if how:
                treat(OUT / f"{video}.jpg", how, work)

            # The preview is a little wider than 16:9: shave top and bottom.
            ph = cw / (PREVIEW[0] / PREVIEW[1])
            crop(frame, OUT / "og" / f"{video}.jpg", (cx, cy + (ch - ph) * down, cw, ph), PREVIEW, work)

            kept = (cw * ch) / (full_w * full_h)
            bars = "" if (w, h) == (full_w, full_h) else f", bars trimmed to {round(w)}x{round(h)}"
            print(f"  {position}. {slug}: {full_w}x{full_h}{bars}, kept {kept:.0%} of the frame")
            made.add(video)
            done += 1

    MANIFEST.write_text(json.dumps(sorted(made), indent=2) + "\n")
    print(f"{done} cover(s) made. {len(made)} scene(s) now use their own frame.")


if __name__ == "__main__":
    main()
