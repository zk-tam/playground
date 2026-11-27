import made from "./covers.json";

/**
 * Absolute Cinema: the curation. One entry per scene, oldest first.
 *
 * To add one, append an entry: the YouTube id, a slug for its address, a
 * title, a description, where it is from and the year.
 *
 * To give a scene its own cover, put a frame from the video in `covers/`
 * (named after the slug, or its position in this list) and run
 * `python3 scripts/make-covers.py`, then `node scripts/make-og.mjs` for its
 * link preview. Until then the cover is drawn from the video's YouTube
 * thumbnail.
 */
export type Scene = {
  /** The YouTube video id: the part after `v=` in its link. */
  id: string;
  /** Its address, made from the title: /absolute-cinema/<slug>. */
  slug: string;
  title: string;
  /** The line that goes with it. */
  description: string;
  /** Where it is from. */
  source: string;
  year: number;
  /** Seconds into the video to start from. */
  start?: number;
};

export const scenes: Scene[] = [
  {
    id: "Zn6kiimEsYc",
    slug: "finals",
    title: "Finals",
    description: "From North Carolina, at guard, 6 foot 6",
    source: "NBA Finals, Game 6",
    year: 1997,
  },
  {
    id: "9zTRxiG2Rno",
    slug: "do-i-make-her-proud",
    title: "Do I make her proud?",
    description: "everyday.",
    source: "The Sixth Sense",
    year: 1999,
    // The clip is the whole scene; this is the moment itself, 2:10 in.
    start: 130,
  },
  {
    id: "fzAKSbtYBMU",
    slug: "the-best",
    title: "The Best",
    description: "A-ha, the Laserfield",
    source: "Ocean's Twelve",
    year: 2004,
  },
  {
    id: "Tm3yrjwaRLo",
    slug: "theres-a-man-named-hershey",
    title: "There's a man named Hershey",
    description: "He made enough chocolate to build the town",
    source: "Mad Men, season 6 finale",
    year: 2013,
  },
  {
    id: "JfjkiTB1fHQ",
    slug: "when-are-you-gonna-take-it",
    title: "when are you gonna take it?",
    description: "sometimes I don't",
    source: "The Secret Life of Walter Mitty",
    year: 2013,
    start: 5,
  },
  {
    id: "ote9AdFKKaA",
    slug: "l-to-the-og",
    title: "L to the OG",
    description: "It's burning my eyes, but I can't look away",
    source: "Succession",
    year: 2019,
  },
  {
    id: "3S16b-x5mRA",
    slug: "barbecue-sauce",
    title: "Barbecue Sauce",
    description: "Be curious, not judgemental",
    source: "Ted Lasso",
    year: 2020,
  },
  {
    id: "_pQ9XOPYvIk",
    slug: "86-years",
    title: "86 Years",
    description: "but... with good behaviour, who knows?",
    source: "Better Call Saul, finale",
    year: 2022,
  },
  {
    id: "XcsdL82oeew",
    slug: "ill-take-ser-duncans-side",
    title: "I'll take Ser Duncan's side",
    description: "Let the god decide if he was right or wrong",
    source: "A Knight of the Seven Kingdoms",
    year: 2026,
  },
];

// Scenes that have a cover cut from a real frame. Written by make-covers.py.
const framed = new Set<string>(made);

/** Whether a scene has a cover cut from its own frame yet. */
export const hasFrame = (scene: Scene) => framed.has(scene.id);

/** The picture a scene's cover is drawn from. */
export const coverOf = (scene: Scene) =>
  framed.has(scene.id)
    ? `/cinema/${scene.id}.jpg`
    : `https://i.ytimg.com/vi/${scene.id}/mqdefault.jpg`;

/**
 * The picture shown when a scene's link is shared: its cover, already drawn
 * in characters by scripts/make-og.mjs.
 */
export const previewOf = (scene: Scene) =>
  framed.has(scene.id)
    ? `/cinema/og/${scene.id}.png`
    : `https://i.ytimg.com/vi/${scene.id}/hqdefault.jpg`;

export const pathOf = (scene: Scene) => `/absolute-cinema/${scene.slug}`;
