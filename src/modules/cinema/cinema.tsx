"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { AsciiFrame } from "@/kit/ascii-frame";
import { easing } from "@/kit/bars";
import { PlayerController } from "@/kit/player/controller";
import { Scrubber } from "@/kit/player/scrubber";
import { PlayPause, Speaker, iconButton } from "@/kit/player/transport";
import { Like, Share } from "@/kit/reactions";
import { Wheel } from "@/kit/wheel";
import { Words } from "@/kit/words";
import { coverOf, pathOf, scenes } from "./scenes";

const years = scenes.map((scene) => String(scene.year));

/** A screen with a play triangle: the familiar shape of a link to YouTube. */
function YouTubeMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M5.2 5.6h13.6A3.2 3.2 0 0 1 22 8.8v6.4a3.2 3.2 0 0 1-3.2 3.2H5.2A3.2 3.2 0 0 1 2 15.2V8.8a3.2 3.2 0 0 1 3.2-3.2Zm4.9 3.5v5.8l5-2.9-5-2.9Z"
      />
    </svg>
  );
}

// Px kept free under the picture in the dark: the controls, the title and its
// line. A very short window (a phone on its side) drops the line.
const SHORT = 480;
const captionHeight = () => (innerHeight < SHORT ? 124 : 190);
const MORPH_MS = 680;

type Box = { left: number; top: number; width: number; height: number };

/** Where the picture sits when it has the whole screen: as large as fits. */
function theatre(): Box {
  const caption = captionHeight();
  const width = Math.min(innerWidth, ((innerHeight - caption - 16) * 16) / 9);
  const height = (width * 9) / 16;
  return {
    left: (innerWidth - width) / 2,
    top: Math.max(0, (innerHeight - caption - height) / 2),
    width,
    height,
  };
}

/** Play, the timeline and mute. On the cover, and under the picture in the dark. */
function Controls({
  controller,
  playing,
  waiting,
  quiet,
  onPlay,
}: {
  controller: PlayerController;
  playing: boolean;
  waiting: boolean;
  /** 0 silent, 1 low, 2 full. */
  quiet: 0 | 1 | 2;
  onPlay: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={onPlay}
        className="pointer-events-auto relative grid size-11 shrink-0 place-items-center rounded-full bg-white/14 text-white backdrop-blur-md transition-[scale,background-color] duration-300 ease-spring-soft hover:bg-white/24 active:scale-90 active:duration-100"
      >
        <PlayPause playing={playing} />
        {/* A thin ring while the scene is loading or buffering. */}
        <svg
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden
          className={`pointer-events-none absolute -inset-1 animate-spin transition-opacity duration-300 ${waiting ? "" : "opacity-0"}`}
        >
          <path d="M24 2a22 22 0 0 1 22 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {/* The times sit under the line, so the line is pushed down level with
          the buttons. */}
      <div className="pointer-events-auto min-w-0 flex-1 pt-5">
        <Scrubber controller={controller} />
      </div>
      <button
        type="button"
        aria-label={quiet === 0 ? "Unmute" : "Mute"}
        onClick={() => controller.toggleMute()}
        className={`pointer-events-auto ${iconButton} hover:bg-white/14`}
      >
        <Speaker level={quiet} />
      </button>
    </>
  );
}

const px = (box: Box) => ({
  left: `${box.left}px`,
  top: `${box.top}px`,
  width: `${box.width}px`,
  height: `${box.height}px`,
});

/**
 * One scene at a time. The cover is a frame of it, drawn in characters; press
 * it and the drawing gives way to the scene itself. The wheel underneath is
 * the only navigation: it turns through the years.
 *
 * Playing takes over the screen. The picture grows out of its place on the
 * page to fill the window, everything else goes black, and only the title and
 * its line stay. Pausing sends it back to where it came from.
 */
export function Cinema({ start = 0 }: { start?: number }) {
  const [controller] = useState(() => new PlayerController({ remember: false }));
  const snap = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [index, setIndex] = useState(start);
  const root = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const morph = useRef<Animation | null>(null);
  const was = useRef(false);
  const scene = scenes[index];

  useEffect(() => {
    if (screen.current) controller.mount(screen.current);
    return () => controller.destroy();
  }, [controller]);

  // Have the scene waiting in the player before anyone presses play, so the
  // first press starts it (see `prepare`). A short pause first: the page gets
  // to draw, and turning the wheel past several scenes fetches only the last.
  useEffect(() => {
    const id = setTimeout(
      () => controller.prepare({ videoId: scene.id, start: scene.start }),
      600,
    );
    return () => clearTimeout(id);
  }, [controller, scene.id, scene.start]);

  // Links made before scenes had their own addresses ended in #<video id>.
  // Honour them, and move the visitor on to the proper address.
  useEffect(() => {
    const wanted = scenes.findIndex((s) => s.id === location.hash.slice(1));
    if (wanted < 0) return;
    const id = setTimeout(() => {
      setIndex(wanted);
      history.replaceState(null, "", pathOf(scenes[wanted]));
    });
    return () => clearTimeout(id);
  }, []);

  const { status, muted, volume } = snap;
  const started = status !== "empty";
  const playing = status === "playing" || status === "buffering";

  // The video is only ever on show while it is actually running. Before it
  // starts, when it is paused and when it ends, the drawing is in its place.
  // YouTube puts its own panels (title, channel, more videos) over a player
  // that is stopped, and this is how they are kept out of sight: the player
  // is simply not displayed then. `rolling` waits for the first real frame,
  // so the drawing doesn't give way to a black, still-buffering player.
  const [rolling, setRolling] = useState(false);
  if (status === "playing" && !rolling) setRolling(true);
  if (rolling && !playing) setRolling(false);
  const showing = rolling;
  const waiting = status === "loading" || status === "buffering";
  // On from the moment play is pressed, so the screen opens while it loads.
  const immersed = status === "loading" || playing;

  // The morph. The picture always lives in the same place in the page; here
  // it is lifted out to a fixed box and animated between the two positions,
  // by real size, so the video is never squashed and never reloads.
  useLayoutEffect(() => {
    const el = picture.current;
    const home = slot.current;
    const words = caption.current;
    if (!el || !home || !words) return;
    if (immersed === was.current) return;
    was.current = immersed;

    const html = document.documentElement;
    const from = el.getBoundingClientRect();
    morph.current?.cancel();

    const place = () => {
      const to = theatre();
      Object.assign(el.style, { position: "fixed", zIndex: "50", ...px(to) });
      // The controls and the words sit just under the picture, lined up with
      // its left edge.
      words.style.left = `${Math.max(20, to.left)}px`;
      words.style.top = `${to.top + to.height + 4}px`;
      words.style.width = `${Math.min(to.width, innerWidth) - (to.left < 20 ? 40 : 0)}px`;
      return to;
    };

    let to: Box;
    if (immersed) {
      html.setAttribute("data-immersed", "");
      to = place();
    } else {
      html.removeAttribute("data-immersed");
      to = home.getBoundingClientRect();
      Object.assign(el.style, { position: "fixed", zIndex: "50", ...px(to) });
    }

    const settle = () => {
      // Back on the page, hand the picture back to the normal layout.
      if (!immersed) el.removeAttribute("style");
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return settle();

    const animation = el.animate([px(from), px(to)], {
      duration: MORPH_MS,
      easing: easing("out-quint"),
    });
    morph.current = animation;
    animation.finished.then(settle, () => {});

    if (!immersed) return;
    const refit = () => place();
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, [immersed]);

  // Never leave the page locked if this unmounts mid-scene.
  useEffect(() => () => document.documentElement.removeAttribute("data-immersed"), []);

  function choose(next: number) {
    if (next === index) return;
    controller.clear();
    setIndex(next);
    // Each scene has its own address, so the one on screen is the one that
    // gets bookmarked or shared.
    history.replaceState(null, "", pathOf(scenes[next]));
    document.title = `${scenes[next].title} · Playground`;
  }

  function play() {
    if (started) controller.toggle();
    else controller.load({ videoId: scene.id, start: scene.start });
    root.current?.focus({ preventScroll: true });
  }

  /** Step out of the dark: pause if it is running, give up if it never began. */
  function leave() {
    if (playing) controller.toggle();
    else if (status === "loading") controller.clear();
  }

  // Our own way out to YouTube, in place of the player's. It opens the video
  // there at the moment you have reached, and pauses it here.
  const youtube = {
    href: `https://www.youtube.com/watch?v=${scene.id}`,
    target: "_blank",
    rel: "noopener noreferrer",
    "aria-label": "Watch on YouTube",
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      const at = Math.floor(controller.time());
      if (at > 0) event.currentTarget.href = `https://www.youtube.com/watch?v=${scene.id}&t=${at}s`;
      leave();
    },
  };

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === " " && target.tagName === "BUTTON") return;
    if (key === " " || key === "k") play();
    else if (key === "Escape" && immersed) leave();
    else if (key === "m") controller.toggleMute();
    else if (key === "ArrowLeft" && started) controller.seekBy(-5);
    else if (key === "ArrowRight" && started) controller.seekBy(5);
    else if (key === "ArrowLeft") choose(Math.max(0, index - 1));
    else if (key === "ArrowRight") choose(Math.min(scenes.length - 1, index + 1));
    else return;
    event.preventDefault();
  }

  return (
    <div ref={root} tabIndex={-1} onKeyDown={keys} className="outline-none">
      {/* The dark. Pressing it anywhere brings the page back. */}
      <div
        onClick={leave}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black transition-opacity ease-out ${immersed ? "duration-500" : "pointer-events-none opacity-0 duration-700"}`}
      />

      {/* The picture's place on the page. It keeps the space while the
          picture itself is away filling the screen. */}
      <div ref={slot} className="relative aspect-video">
        <div
          ref={picture}
          className={`absolute inset-0 overflow-hidden bg-[#05070c] transition-[border-radius,box-shadow] duration-700 ease-out-quint ${immersed ? "rounded-none" : "rounded-[20px] shadow-stage"}`}
        >
          {/* The player takes no pointer, so hovering never calls up YouTube's
              panels. Pressing the picture is handled here instead: it pauses. */}
          <div
            ref={screen}
            onClick={leave}
            className={`absolute inset-0 [&_iframe]:pointer-events-none [&_iframe]:size-full ${showing ? "" : "invisible"}`}
          />
          {/* The cover, and on it the controls. Both belong to the drawing, not
              to the video: the moment the scene is running they fade out
              together and the picture is left alone. */}
          <div
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${showing ? "pointer-events-none opacity-0" : ""}`}
          >
            <button
              type="button"
              onClick={play}
              aria-label={`Play ${scene.title}`}
              tabIndex={showing ? -1 : 0}
              className="absolute inset-0"
            >
              <AsciiFrame
                key={scene.id}
                src={coverOf(scene)}
                alt={`${scene.title}, drawn in characters`}
                className="size-full"
              />
            </button>

            {/* The title, across the top of the cover like a title card. */}
            <div
              data-theme="dark"
              className={`pointer-events-none absolute inset-x-0 top-0 bg-linear-to-b from-black/75 via-black/35 to-transparent px-4 pt-3.5 pb-12 text-ink transition-opacity duration-300 sm:px-5 sm:pt-4 ${immersed ? "opacity-0" : ""}`}
            >
              <p key={scene.id} className="animate-roll-in text-[13px] leading-5 text-ink-2 tabular-nums">
                {scene.year} · {scene.source}
              </p>
              <h2 className="text-[20px] leading-[1.2] font-medium tracking-[-0.02em] sm:text-[24px]">
                <Words key={scene.id} text={scene.title} />
              </h2>
            </div>

            {/* Always light on dark, whatever the theme: it sits on a picture.
                In the dark both this and the title are under the picture
                instead, so here they step aside. */}
            <div
              data-theme="dark"
              inert={immersed || showing}
              className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 bg-linear-to-t from-black/75 via-black/40 to-transparent px-4 pt-12 pb-3 text-ink transition-opacity duration-300 ${immersed ? "opacity-0" : ""}`}
            >
              <Controls
                controller={controller}
                playing={playing}
                waiting={waiting}
                quiet={muted || volume === 0 ? 0 : volume < 50 ? 1 : 2}
                onPlay={play}
              />
            </div>
          </div>
        </div>
      </div>

      {/* All that stays in the dark, under the picture: the controls, then the
          title and its line. */}
      <div
        ref={caption}
        inert={!immersed}
        className={`fixed z-50 text-white transition-opacity ${immersed ? "delay-200 duration-500" : "pointer-events-none opacity-0 duration-200"}`}
      >
        <div data-theme="dark" className="flex items-center gap-3 text-ink">
          <Controls
            controller={controller}
            playing={playing}
            waiting={waiting}
            quiet={muted || volume === 0 ? 0 : volume < 50 ? 1 : 2}
            onPlay={play}
          />
        </div>
        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="pointer-events-none min-w-0">
            <p className="text-[22px] leading-[1.2] font-medium tracking-[-0.02em]">
              <Words key={`${scene.id}-${immersed}`} text={scene.title} delay={0.25} />
            </p>
            <p className="mt-1.5 text-[16px] leading-[1.45] text-white/60 [@media(max-height:479px)]:hidden">
              <Words key={`${scene.id}-${immersed}`} text={scene.description} delay={0.45} />
            </p>
          </div>
          <a
            {...youtube}
            className="mt-1 flex h-9 shrink-0 items-center gap-2 rounded-full bg-white/10 pr-3.5 pl-3 text-[13px] font-medium text-white/80 transition-[background-color,color,scale] duration-200 ease-out-quint hover:bg-white/20 hover:text-white active:scale-95"
          >
            <YouTubeMark />
            YouTube
          </a>
        </div>
      </div>

      {/* On a phone the line gets the full width, with the buttons under it,
          both centred. */}
      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <p className="min-w-0 text-center text-[15px] leading-[1.5] text-pretty text-ink-2 sm:pt-2 sm:text-left sm:text-[17px]">
          <Words key={scene.id} text={scene.description} delay={0.25} />
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <a
            {...youtube}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-sunken text-ink-2 transition-[scale,color] duration-200 ease-out-quint hover:text-ink active:scale-90"
          >
            <YouTubeMark />
          </a>
          <Like what={`cinema:${scene.id}`} label={`Like ${scene.title}`} />
          <Share path={pathOf(scene)} title={scene.title} />
        </div>
      </div>

      {snap.error && (
        <p role="alert" className="mt-2 text-muted">
          {snap.error}
        </p>
      )}

      <div className="mt-6">
        <Wheel labels={years} value={index} onChange={choose} label="Year" />
      </div>
    </div>
  );
}
