# Playground

Be Opinionated.

A site made of modules. Each module is a small product of its own, with its own
page, built from a shared kit of parts. Next.js, Tailwind and IBM Plex Sans; no
animation library.

```bash
npm run dev
```

## Modules

- **Absolute Cinema** (`/absolute-cinema`) — a curation of iconic scenes. Each
  has a title, a description, a YouTube link and a cover drawn in ASCII from
  one frame. One scene shows at a time; the wheel turns through the years.
  Playing a scene takes over the screen: the picture grows to fill the window,
  everything else goes black, and only the title and description stay. Pausing
  sends it back.

### Adding a scene

Append an entry to `src/modules/cinema/scenes.ts`: the YouTube id, a slug made
from the title, the title, a description, where it is from and the year. The
scene gets its own address, `/absolute-cinema/<slug>`, with its own title,
description and picture for link previews.

### Covers

Put one frame per scene in `covers/` (named after the slug, or its position in
the list) and run:

```bash
python3 scripts/make-covers.py
```

It trims any black bars, crops every frame to 16:9, and writes the cover the
site draws in ASCII (`public/cinema/<id>.jpg`) and the link-preview picture
(`public/cinema/og/<id>.jpg`). Until a scene has its own frame, both come from
the video's YouTube thumbnail.

The home page and the Absolute Cinema page have no frame of their own; their
link-preview pictures are made by `node scripts/make-og.mjs` and kept in
`public/og/`.

Link previews need the site's full address: set `NEXT_PUBLIC_SITE_URL` when
deploying. It is fixed at build time, so with two domains on one deployment
set it to the main one.

### The database

Likes and newsletter sign-ups live in Postgres (Supabase), reached with `pg`
through one connection string.

1. Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
2. Create the tables once: `npm run db:setup` (it runs `db/schema.sql`, and is
   safe to run again).

Without a database the site still works; likes and sign-ups answer that they
are unavailable.

A visitor is a random id in a cookie until they sign up for the newsletter;
from then on that browser speaks for their address, and their earlier likes
move over to it. `src/server/identity.ts` explains the rules.

### Adding a module

1. Build it under `src/modules/<name>/`.
2. Give it a page under `src/app/<slug>/page.tsx`.
3. Add an entry to `src/modules/registry.ts`, with a cover picture in
   `public/modules/`. It then appears on the home page and in the dock.

## Where things live

- `src/kit/` — the shared parts:
  - `ascii-frame.tsx` — any image, redrawn in characters. Each character is a
    particle: the pointer scatters the ones near it and they spring back.
  - `wheel.tsx` — a notched wheel of labelled stops under a fixed needle.
  - `words.tsx` — a line of text that arrives a word at a time.
  - `reactions.tsx` — like (shared count), share, and the newsletter bell.
  - `player/` — the YouTube player: `controller.ts` wraps the IFrame Player API
    (loaded from youtube.com at runtime, the one external script),
    `scrubber.tsx` is the timeline, `transport.tsx` the buttons.
  - `bars.tsx`, `icon-morph.tsx` — icons drawn from a few bars, so one can
    morph into another.
- `src/lib/spring.ts` — `Spring`, `rubber()` and `velocityTracker()` for
  gesture-driven motion that writes straight to `element.style`.
- `src/app/globals.css` — the three themes (Light, Dark, Blueprint) as
  colour tokens, easing curves and keyframes.
- `src/components/` — site chrome: the dock at the bottom, the theme picker,
  the newsletter bell and the backdrop.
- `src/server/` and `src/app/api/` — shared visitor data (likes, newsletter
  sign-ups), kept in Postgres. `src/server/db.ts` is the only place that
  talks to it.
