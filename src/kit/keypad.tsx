"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";

/** `email` is the full keyboard with @ and . beside the space bar. */
export type KeypadLayout = "text" | "email" | "number";

type Page = "letters" | "numbers" | "symbols";
type Shift = 0 | 1 | 2; // off, for the next letter, locked

type Key = {
  id: string;
  /** What it types. Letters are stored in lower case. */
  char?: string;
  does?: "shift" | "back" | "enter";
  /** The page it turns to. */
  to?: Page;
  label?: ReactNode;
  /** Said aloud in place of the label. */
  name?: string;
  /** The small letters under a number-pad digit. */
  under?: string;
  kind?: "quiet" | "go" | "bare";
  /** CSS width; a letter key's width when left out. */
  width?: string;
  grow?: boolean;
};

// Widths, in letter keys (--k) and the gaps between them (--gap), chosen so
// that every row adds up to exactly ten keys and nine gaps.
const W = {
  side: "calc(var(--k) * 1.5 + var(--gap) * 0.5)", // shift, delete
  mark: "calc(var(--k) * 1.4 + var(--gap) * 0.4)", // the five punctuation keys
  two: "calc(var(--k) * 2 + var(--gap))",
  wide: "calc(var(--k) * 2.5 + var(--gap) * 1.5)",
};

const BACK = (
  <svg width="23" height="18" viewBox="0 0 24 19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8.2 1.5h12.3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8.2a2 2 0 0 1-1.5-.7L1.4 9.5l5.3-7.3a2 2 0 0 1 1.5-.7Z" />
    <path d="m11.5 6.5 6 6m0-6-6 6" />
  </svg>
);

const shiftMark = (shift: Shift) => (
  <svg width="20" height="19" viewBox="0 0 20 19" fill={shift ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
    <path d="M10 1.6 1.8 10h4.4v4.2h7.6V10h4.4L10 1.6Z" />
    {shift === 2 && <path d="M6.2 17h7.6" strokeLinecap="round" />}
  </svg>
);

const chars = (row: string, prefix: string): Key[] =>
  [...row].map((char) => ({ id: `${prefix}${char}`, char }));

function rows(layout: KeypadLayout, page: Page, shift: Shift, enter: string): Key[][] {
  if (layout === "number") {
    const pad: [string, string][] = [
      ["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"],
      ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
    ];
    const digit = ([char, under]: [string, string]): Key => ({ id: `n${char}`, char, under });
    return [
      pad.slice(0, 3).map(digit),
      pad.slice(3, 6).map(digit),
      pad.slice(6, 9).map(digit),
      [
        { id: "gap", kind: "bare" },
        digit(["0", ""]),
        { id: "back", does: "back", label: BACK, name: "Delete", kind: "bare" },
      ],
    ];
  }

  const back: Key = { id: "back", does: "back", label: BACK, name: "Delete", kind: "quiet", width: W.side };
  const bottom = (turn: Key): Key[] => [
    turn,
    { id: "space", char: " ", label: "space", name: "Space", kind: undefined, grow: true },
    ...(layout === "email" ? chars("@.", "e") : []),
    { id: "enter", does: "enter", label: enter, kind: "go", width: W.wide },
  ];
  const turnWidth = layout === "email" ? W.two : W.wide;

  if (page === "letters")
    return [
      chars("qwertyuiop", "l"),
      chars("asdfghjkl", "l"),
      [
        { id: "shift", does: "shift", label: shiftMark(shift), name: "Shift", kind: "quiet", width: W.side },
        ...chars("zxcvbnm", "l"),
        back,
      ],
      bottom({ id: "to123", to: "numbers", label: "123", name: "Numbers", kind: "quiet", width: turnWidth }),
    ];

  const marks = [...".,?!'"].map((char): Key => ({ id: `m${char}`, char, width: W.mark }));
  const letters: Key = { id: "toABC", to: "letters", label: "ABC", name: "Letters", kind: "quiet", width: turnWidth };
  return page === "numbers"
    ? [
        chars("1234567890", "d"),
        chars('-/:;()$&@"', "d"),
        [{ id: "toSym", to: "symbols", label: "#+=", name: "Symbols", kind: "quiet", width: W.side }, ...marks, back],
        bottom(letters),
      ]
    : [
        chars("[]{}#%^*+=", "s"),
        chars("_\\|~<>€£¥•", "s"),
        [{ id: "to123b", to: "numbers", label: "123", name: "Numbers", kind: "quiet", width: W.side }, ...marks, back],
        bottom(letters),
      ];
}

const HOLD_MS = 380; // how long delete is held before it starts repeating
const REPEAT_MS = 62;
const DOUBLE_MS = 320; // two taps on shift this close together lock it

/**
 * An on-screen keyboard, in the manner of the iPhone's. It exists so a field
 * can be typed into without the device's own keyboard ever coming up: the
 * field is not a real input, and this is the only way to fill it.
 *
 * Two shapes: the full keyboard (letters, with numbers and symbols a key
 * away) and a number pad. Details carried over from the real thing:
 *
 * - A letter is typed when the finger lifts, not when it lands, and while it
 *   is down the letter stands up above the finger in a bubble. Slide to a
 *   neighbour before lifting and that one is typed instead.
 * - A second finger landing types the first one's letter at once, so fast
 *   two-thumb typing never drops a key.
 * - Shift is for the next letter only; tap it twice to lock it.
 * - Holding delete repeats.
 *
 * It only reports what was pressed. The field and its text belong to
 * whoever uses it.
 */
export function Keypad({
  layout = "text",
  onType,
  onBackspace,
  onEnter,
  enterLabel = "return",
  canEnter = true,
  className = "",
}: {
  layout?: KeypadLayout;
  onType: (text: string) => void;
  onBackspace: () => void;
  onEnter?: () => void;
  enterLabel?: string;
  /** Lights the enter key up when there is something worth sending. */
  canEnter?: boolean;
  className?: string;
}) {
  const [page, setPage] = useState<Page>("letters");
  const [shift, setShift] = useState<Shift>(0);
  const [down, setDown] = useState<Record<number, string>>({}); // pointer → key id
  const [bubble, setBubble] = useState<{ id: string; style: CSSProperties } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const shiftedAt = useRef(0);
  const repeat = useRef({ wait: 0, every: 0 });
  const erase = useRef(onBackspace);
  useEffect(() => {
    erase.current = onBackspace;
  }, [onBackspace]);
  useEffect(() => {
    const timers = repeat.current;
    return () => {
      clearTimeout(timers.wait);
      clearInterval(timers.every);
    };
  }, []);

  const grid = rows(layout, page, shift, enterLabel);
  const keys = new Map(grid.flat().map((key) => [key.id, key]));
  const face = (key: Key) =>
    key.label ?? (page === "letters" && shift && key.char ? key.char.toUpperCase() : key.char);

  const stopRepeat = () => {
    clearTimeout(repeat.current.wait);
    clearInterval(repeat.current.every);
  };

  /** Stands the letter up above its key. */
  function raise(key: Key | undefined, el: Element | null | undefined) {
    const box = panel.current?.getBoundingClientRect();
    if (!key?.char || key.id === "space" || layout === "number" || !el || !box) return setBubble(null);
    const at = el.getBoundingClientRect();
    const width = at.width + 22;
    const left = Math.min(Math.max(at.left - box.left - 11, 2), box.width - width - 2);
    setBubble({ id: key.id, style: { left, top: at.top - box.top - 54, width } });
  }

  function type(key: Key) {
    if (key.char === undefined) return;
    onType(page === "letters" && shift ? key.char.toUpperCase() : key.char);
    if (shift === 1) setShift(0);
  }

  const keyUnder = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-key]") ?? null;

  function press(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault(); // no focus change, no text selection, no zoom
    const el = (event.target as Element).closest<HTMLElement>("[data-key]");
    const key = el && keys.get(el.dataset.key ?? "");
    if (!el || !key || key.id === "gap") return;
    // Keep hearing about this finger wherever it slides. A browser may
    // refuse; the key still works, only sliding to a neighbour is lost.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    navigator.vibrate?.(5);

    // A finger already down gives up its letter now, before this one counts.
    for (const id of Object.values(down)) {
      const held = keys.get(id);
      if (held?.char !== undefined) type(held);
    }
    stopRepeat();

    if (key.does === "back") {
      onBackspace();
      repeat.current.wait = window.setTimeout(() => {
        repeat.current.every = window.setInterval(() => erase.current(), REPEAT_MS);
      }, HOLD_MS);
    } else if (key.does === "shift") {
      const again = event.timeStamp - shiftedAt.current < DOUBLE_MS;
      shiftedAt.current = event.timeStamp;
      setShift(again ? 2 : shift ? 0 : 1);
    } else if (key.to) {
      // Turning the page moves the keys out from under the finger.
      setPage(key.to);
      setShift(0);
      setDown({});
      return setBubble(null);
    }
    setDown({ [event.pointerId]: key.id });
    raise(key, el);
  }

  function slide(event: PointerEvent<HTMLDivElement>) {
    const from = keys.get(down[event.pointerId]);
    // Only typing keys can be slid between; the rest act where they are.
    if (!from || from.does === "shift") return;
    const el = keyUnder(event.clientX, event.clientY);
    const to = el ? keys.get(el.dataset.key ?? "") : undefined;
    if (to?.id === from.id) return;
    if (from.does === "back") stopRepeat();
    const next = { ...down };
    if (from.char !== undefined && to?.char !== undefined) next[event.pointerId] = to.id;
    else delete next[event.pointerId];
    setDown(next);
    raise(next[event.pointerId] ? to : undefined, el);
  }

  function lift(event: PointerEvent<HTMLDivElement>, typed: boolean) {
    const key = keys.get(down[event.pointerId]);
    stopRepeat();
    setBubble(null);
    if (!key) return;
    const next = { ...down };
    delete next[event.pointerId];
    setDown(next);
    if (!typed) return;
    if (key.char !== undefined) type(key);
    else if (key.does === "enter" && canEnter) onEnter?.();
  }

  /** Keys still work for anyone not using a finger on them. */
  function activate(key: Key) {
    if (key.char !== undefined) type(key);
    else if (key.does === "back") onBackspace();
    else if (key.does === "enter" && canEnter) onEnter?.();
    else if (key.does === "shift") setShift(shift ? 0 : 1);
    else if (key.to) setPage(key.to);
  }

  const held = new Set(Object.values(down));
  const raised = bubble && keys.get(bubble.id);

  return (
    <div className={`keypad-box ${className}`}>
      <div
        ref={panel}
        role="group"
        aria-label={layout === "number" ? "Number pad" : "Keyboard"}
        data-layout={layout}
        onPointerDown={press}
        onPointerMove={slide}
        onPointerUp={(event) => lift(event, true)}
        onPointerCancel={(event) => lift(event, false)}
        onContextMenu={(event) => event.preventDefault()}
        className="keypad"
      >
        {grid.map((row, r) => (
          <div key={r} className="keypad-row">
            {row.map((key) =>
              key.id === "gap" ? (
                <span key={key.id} className="key" data-kind="bare" aria-hidden />
              ) : (
                <button
                  key={key.id}
                  type="button"
                  tabIndex={-1}
                  data-key={key.id}
                  data-kind={key.kind === "go" && !canEnter ? "quiet" : key.kind}
                  data-down={held.has(key.id) || undefined}
                  data-on={(key.does === "shift" && shift > 0) || undefined}
                  aria-label={key.name ?? (typeof face(key) === "string" ? undefined : key.id)}
                  aria-disabled={key.does === "enter" && !canEnter ? true : undefined}
                  // A press by finger or mouse is handled above; this is for the rest.
                  onClick={(event) => event.detail === 0 && activate(key)}
                  style={{ width: key.width, flexGrow: key.grow ? 1 : undefined }}
                  className="key"
                >
                  {face(key)}
                  {key.under !== undefined && <small>{key.under}</small>}
                </button>
              ),
            )}
          </div>
        ))}
        {bubble && raised && (
          <div aria-hidden className="key-bubble" style={bubble.style}>
            {face(raised)}
          </div>
        )}
      </div>
    </div>
  );
}
