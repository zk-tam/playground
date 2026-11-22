"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import { easing } from "./bars";
import { KeypadField, onTouchScreen } from "./keypad-field";

const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

const round =
  "grid size-11 shrink-0 place-items-center rounded-full bg-sunken text-ink-2 transition-[scale,color] duration-200 ease-out-quint hover:text-ink active:scale-90 aria-pressed:text-ink";

function Icon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

/* ── Likes ──────────────────────────────────────────────────────────────
   Real, and shared: every visitor sees the same count. One small store for
   the whole page, so any number of like buttons make a single request. */

type Likes = { counts: Record<string, number>; mine: string[] };

let likes: Likes | null = null;
let asked = false;
const watchers = new Set<() => void>();
const publish = (next: Likes) => {
  likes = next;
  watchers.forEach((watcher) => watcher());
};
const subscribe = (watcher: () => void) => {
  watchers.add(watcher);
  if (!asked) {
    asked = true;
    api<Likes>("/api/likes").then(publish).catch(() => {});
  }
  return () => void watchers.delete(watcher);
};
const current = () => likes;

function useLike(key: string) {
  const all = useSyncExternalStore(subscribe, current, () => null);
  const on = all?.mine.includes(key) ?? false;

  // Show the change at once, then settle on what the server says.
  function toggle() {
    if (!all) return;
    const next = !on;
    publish({
      counts: { ...all.counts, [key]: (all.counts[key] ?? 0) + (next ? 1 : -1) },
      mine: next ? [...all.mine, key] : all.mine.filter((k) => k !== key),
    });
    api<Likes>("/api/likes", "POST", { key, on: next }).then(publish).catch(() => {});
  }

  return { on, count: all ? (all.counts[key] ?? 0) : null, toggle };
}

/**
 * A pop, a ring and a few sparks; the count rolls with it. `what` names the
 * thing being liked, such as "cinema:<video id>".
 */
export function Like({ what, label = "Like" }: { what: string; label?: string }) {
  const { on, count, toggle } = useLike(what);
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={toggle}
      className="group flex h-11 shrink-0 items-center gap-2 rounded-full bg-sunken pr-4 pl-3.5 font-medium text-ink-2 transition-[scale,color] duration-200 ease-out-quint hover:text-ink active:scale-95"
    >
      <span className="relative grid size-5 place-items-center">
        <Icon key={String(on)} className={on ? "animate-pop fill-like stroke-like" : ""}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </Icon>
        {on && (
          <span aria-hidden className="pointer-events-none absolute inset-0">
            <span className="absolute -inset-2 animate-ring rounded-full border-2 border-like" />
            {SPARKS.map((angle, i) => (
              <span
                key={angle}
                style={{ "--a": `${angle}deg` } as CSSProperties}
                className={`absolute top-1/2 left-1/2 -mt-[2px] -ml-[2px] size-1 animate-spark rounded-full ${i % 2 ? "bg-accent" : "bg-like"}`}
              />
            ))}
          </span>
        )}
      </span>
      <span className="min-w-[1ch] overflow-hidden tabular-nums">
        {count !== null && (
          <span
            key={count}
            style={{ "--dir": on ? 1 : -1 } as CSSProperties}
            className={`block animate-roll-in ${on ? "text-like" : ""}`}
          >
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Hands a link to the system share sheet where there is one, and copies it
 * where there isn't. The arrow lifts off either way. `path` is the page to
 * share, such as "/absolute-cinema#abc"; it defaults to the home page.
 */
export function Share({
  path = "/",
  title,
  onNote,
}: {
  path?: string;
  title?: string;
  onNote?: (text: string) => void;
}) {
  const arrow = useRef<SVGGElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);

  async function share() {
    arrow.current?.animate(
      [
        { transform: "none", easing: "ease-in" },
        { transform: "translateY(-7px)", opacity: 0, offset: 0.4 },
        { transform: "translateY(5px)", opacity: 0, offset: 0.41, easing: easing("spring") },
        { transform: "none", opacity: 1 },
      ],
      { duration: 640 },
    );
    const url = `${location.origin}${path}`;
    if (navigator.share) {
      // Closing the sheet without sharing rejects; that is not an error.
      await navigator.share({ title: title ?? document.title, url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onNote?.("Link copied.");
    } catch {
      onNote?.(url);
    }
  }

  return (
    <button type="button" aria-label="Share" onClick={share} className={round}>
      <span className="relative grid place-items-center">
        <Icon className={`transition-[opacity,scale] duration-300 ease-out-quint ${copied ? "scale-50 opacity-0" : ""}`}>
          <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
          <g ref={arrow}>
            <path d="M12 15V3M8 7l4-4 4 4" />
          </g>
        </Icon>
        <Icon className="absolute text-accent">
          <path
            d="M20 6 9 17l-5-5"
            pathLength={1}
            strokeWidth={2.25}
            className={`transition-[stroke-dashoffset] [stroke-dasharray:1] ${copied ? "delay-100 duration-400 ease-out-quint [stroke-dashoffset:0]" : "duration-150 [stroke-dashoffset:-1]"}`}
          />
        </Icon>
      </span>
    </button>
  );
}

// Good enough to light the "join" key; the server has the final say.
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The bell opens into a place to leave an address. Once it has one, it rings:
 * the bell swings from its crown, the clapper lagging a beat behind.
 *
 * It is made for the top right of a page: the bell stays where it is and the
 * field slides out to its left, and a short line appears underneath to say
 * what happened.
 *
 * On a touch screen there is no room for that, and a real field would bring
 * up the device's keyboard. There the bell grows into a bar of glass across
 * the middle of the screen, with the site's own keyboard under it (see
 * `KeypadField`).
 */
export function Newsletter() {
  const form = useRef<HTMLFormElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Whether it is open as the glass bar, not as the field beside the bell.
  const [sheet, setSheet] = useState(false);
  const [trouble, setTrouble] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const bell = useRef<HTMLSpanElement>(null);
  const clapper = useRef<SVGPathElement>(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "open" | "sending" | "done">("idle");
  const [note, setNote] = useState({ text: "", n: 0 });
  const onNote = (text: string) => setNote(({ n }) => ({ text, n: n + 1 }));
  const open = state === "open" || state === "sending";
  const done = state === "done";

  // Remember across visits. Read after mount, so the server and the first
  // client render agree.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem("newsletter") === "1") setState("done");
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function ring() {
    const swing = [0, 17, -14, 10, -6, 3, 0];
    bell.current?.animate(
      swing.map((deg) => ({ transform: `rotate(${deg}deg)` })),
      { duration: 820, easing: "ease-out" },
    );
    clapper.current?.animate(
      swing.map((deg) => ({ transform: `translateX(${deg * -0.14}px)` })),
      { duration: 820, delay: 60, easing: "ease-out" },
    );
  }

  function press() {
    if (done) return onNote("You're on the list.");
    if (open) return setState("idle");
    setTrouble(false);
    setNote(({ n }) => ({ text: "", n }));
    setState("open");
    if (onTouchScreen()) setSheet(true);
  }

  // Beside the bell, the field takes the caret as it opens. This waits for
  // the field to be let out first: it cannot be focused while it is hidden.
  useEffect(() => {
    if (state === "open" && !sheet) input.current?.focus({ preventScroll: true });
  }, [state, sheet]);

  function close() {
    setSheet(false);
    setState((now) => (now === "done" ? "done" : "idle"));
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (state !== "open") return;
    setState("sending");
    setTrouble(false);
    try {
      await api("/api/newsletter", "POST", { email });
      try {
        localStorage.setItem("newsletter", "1");
      } catch {}
      setState("done");
      onNote("You're on the list.");
      if (sheet) {
        // Let the bar say so, send it back into the bell, then ring.
        await new Promise((resolve) => setTimeout(resolve, 900));
        setSheet(false);
        await new Promise((resolve) => setTimeout(resolve, 560));
      }
      setEmail("");
      ring();
    } catch (error) {
      setState("open");
      setTrouble(true);
      onNote((error as Error).message);
      form.current?.animate(
        { transform: ["none", "translateX(-5px)", "translateX(4px)", "translateX(-2px)", "none"] },
        { duration: 320, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" },
      );
    }
  }

  return (
    <div className="relative">
      {/* Reversed, so the bell keeps its place and the field grows leftwards. */}
      <form
        ref={form}
        onSubmit={submit}
        onKeyDown={(event) => event.key === "Escape" && setState(done ? "done" : "idle")}
        className={`flex h-8 flex-row-reverse items-center rounded-full transition-[background-color] duration-300 ${open && !sheet ? "bg-sunken" : ""}`}
      >
        <button
          ref={button}
          type="button"
          aria-label={done ? "Subscribed to the newsletter" : "Get the newsletter"}
          aria-pressed={done}
          aria-expanded={open}
          aria-haspopup={sheet ? "dialog" : undefined}
          onClick={press}
          className="grid size-8 shrink-0 place-items-center rounded-full text-ink-2 transition-[scale,color,background-color] duration-200 ease-out-quint hover:bg-sunken hover:text-ink active:scale-90 aria-pressed:text-ink"
        >
          <span ref={bell} className="block origin-[50%_10%]">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path
                d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
                className={`transition-[fill] duration-300 ${done ? "fill-current" : "fill-transparent"}`}
              />
              <path ref={clapper} d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </span>
        </button>

        {/* 0fr → 1fr lets the field slide out to its natural width. */}
        <div
          style={{ gridTemplateColumns: open && !sheet ? "1fr" : "0fr" }}
          className="grid transition-[grid-template-columns] duration-500 ease-out-quint"
        >
          <div
            inert={!open || sheet}
            className={`flex min-w-0 items-center overflow-hidden transition-opacity duration-300 ${open && !sheet ? "delay-100" : "opacity-0"}`}
          >
            <input
              ref={input}
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              autoComplete="email"
              className="h-8 w-32 bg-transparent pl-3.5 outline-none select-text placeholder:text-muted sm:w-44"
            />
            <button
              type="submit"
              aria-label="Subscribe"
              disabled={state === "sending"}
              className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-bg transition-[scale,opacity] duration-200 ease-out-quint active:scale-90 disabled:opacity-50"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </form>

      {/* One line that answers back, then fades. */}
      <p
        aria-live="polite"
        className="pointer-events-none absolute top-full right-0 mt-1.5 text-[12px] leading-4 whitespace-nowrap text-muted"
      >
        <span key={note.n} className={note.n ? "block animate-note" : "opacity-0"}>
          {note.text}
        </span>
      </p>

      <KeypadField
        open={sheet}
        onClose={close}
        origin={button}
        value={email}
        // An address has no spaces in it, whatever the space bar says.
        onChange={(next) => setEmail(next.replace(/\s/g, ""))}
        onSubmit={submit}
        layout="email"
        label="Email address"
        placeholder="you@example.com"
        enterLabel="join"
        busy={state === "sending"}
        ready={ADDRESS.test(email) || done}
        note={{ text: note.text, n: note.n, wrong: trouble }}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        }
      />
    </div>
  );
}
