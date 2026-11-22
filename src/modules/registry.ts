/**
 * The modules that make up the site. Each is a small product of its own with
 * its own page, built from the shared parts in `src/kit`.
 *
 * To add one: build it under `src/modules/<name>/`, give it a page under
 * `src/app/<slug>/`, and add an entry here. It then appears on the home page
 * and in the dock.
 */
export type Module = {
  /** The page it lives at, e.g. "absolute-cinema" for /absolute-cinema. */
  slug: string;
  title: string;
  /** A picture in `public/` for its tile on the home page, drawn in characters. */
  cover: string;
  /** Width over height of that picture, so the tile shows all of it. */
  ratio: number;
  /** Which mark it wears in the dock. */
  icon: "clapper";
};

export const modules: Module[] = [
  {
    slug: "absolute-cinema",
    title: "Absolute Cinema",
    cover: "/modules/absolute-cinema.png",
    ratio: 860 / 705,
    icon: "clapper",
  },
];
