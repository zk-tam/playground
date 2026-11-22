"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { easing } from "./bars";
import { Keypad, type KeypadLayout } from "./keypad";

const MORPH_MS = 520;
const BAR_HEIGHT = 56;
const BAR_MAX = 480;

type Box = { left: number; top: number; width: number; height: number };
const px = (box: Box) => ({
  left: `${box.left}px`,
  top: `${box.top}px`,
  width: `${box.width}px`,
  height: `${box.height}px`,
});

/** True on a phone or tablet: a narrow window, or a finger for a pointer. */
export const onTouchScreen = () =>
  typeof window !== "undefined" && matchMedia("(max-width: 639px), (pointer: coarse)").matches;

/**
 * A field for a touch screen that never calls up the device's keyboard.
 *
 * It opens out of whatever was pressed (`origin`): that control grows into a
 * bar of glass across the middle of the screen, in the manner of Spotlight,
 * the page behind it falls back, and the site's own keyboard comes up from
 * the bottom. Closing sends the bar back into the control it came from.
 *
 * The bar is not an input. It shows the text and a caret, and the keypad is
 * the only thing that writes to it, so there is nothing for the device's
 * keyboard to attach to. A real keyboard (a laptop's, a tablet's cover)
 * still types into it, and pasting works.
 */
export function KeypadField({
  open,
  onClose,
  origin,
  value,
  onChange,
  onSubmit,
  layout = "text",
  label,
  placeholder,
  enterLabel,
  icon,
  busy = false,
  ready = true,
  note,
}: {
  open: boolean;
  onClose: () => void;
  /** The control it grows out of and returns to. */
  origin: RefObject<HTMLElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  layout?: KeypadLayout;
  label: string;
  placeholder: string;
  enterLabel?: string;
  icon?: ReactNode;
  /** Waiting on an answer: the send button spins and enter does nothing. */
  busy?: boolean;
  /** Whether what has been typed is worth sending. */
  ready?: boolean;
  /** A line under the bar. A new `n` with `wrong` shakes the bar. */
  note?: { text: string; n: number; wrong?: boolean };
}) {
  // Stays in the page a little longer than `open`, while it closes.
  const [shown, setShown] = useState(false);
  if (open && !shown) setShown(true);

  const dialog = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const keys = useRef<HTMLDivElement>(null);
  const was = useRef(false);

  // The morph, both ways. The bar is a fixed box animated by its real size
  // between the control's place and its own, so nothing inside is squashed.
  useLayoutEffect(() => {
    const from = origin.current;
    const el = bar.current;
    const pad = keys.current;
    if (!shown || !from || !el || !pad || open === was.current) return;
    was.current = open;

    const html = document.documentElement;
    const home = from.getBoundingClientRect();
    const place = (): Box => {
      const width = Math.min(innerWidth - 24, BAR_MAX);
      const above = innerHeight - pad.offsetHeight;
      return {
        left: (innerWidth - width) / 2,
        top: Math.max(64, above * 0.36 - BAR_HEIGHT / 2),
        width,
        height: BAR_HEIGHT,
      };
    };
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const options = { duration: still ? 0 : MORPH_MS, easing: easing("out-quint") };
    const round = (r: number) => ({ borderRadius: `${r}px` });

    if (open) {
      html.setAttribute("data-typing", "");
      from.setAttribute("data-away", "");
      const to = place();
      Object.assign(el.style, px(to));
      el.animate([{ ...px(home), ...round(home.height / 2) }, { ...px(to), ...round(20) }], options);
      inner.current?.animate({ opacity: [0, 0, 1] }, options);
      veil.current?.animate({ opacity: [0, 1] }, { ...options, easing: "ease-out" });
      pad.animate({ transform: ["translateY(105%)", "none"] }, options);
      dialog.current?.focus({ preventScroll: true });

      const refit = () => Object.assign(el.style, px(place()));
      window.addEventListener("resize", refit);
      return () => window.removeEventListener("resize", refit);
    }

    const now = el.getBoundingClientRect();
    const closing = { ...options, fill: "forwards" as const };
    inner.current?.animate({ opacity: [1, 0, 0] }, closing);
    veil.current?.animate({ opacity: [1, 0] }, closing);
    pad.animate({ transform: ["none", "translateY(105%)"] }, closing);
    const back = el.animate(
      [{ ...px(now), ...round(20) }, { ...px(home), ...round(home.height / 2), opacity: 0.4 }],
      closing,
    );
    const done = () => {
      html.removeAttribute("data-typing");
      from.removeAttribute("data-away");
      from.focus({ preventScroll: true });
      setShown(false);
    };
    back.finished.then(done, done);
  }, [open, shown, origin]);

  // Never leave the page locked or the control hidden if this goes away mid-way.
  useEffect(() => {
    const from = origin.current;
    return () => {
      document.documentElement.removeAttribute("data-typing");
      from?.removeAttribute("data-away");
    };
  }, [origin]);

  // Keep the end of a long entry in view, where the caret is.
  useLayoutEffect(() => {
    if (text.current) text.current.scrollLeft = text.current.scrollWidth;
  }, [value, shown]);

  // Something went wrong: the bar shakes its head.
  const wrong = note?.wrong ? note.n : 0;
  useEffect(() => {
    if (!wrong) return;
    bar.current?.animate(
      { translate: ["0", "-7px", "6px", "-3px", "0"] },
      { duration: 340, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" },
    );
  }, [wrong]);

  if (!shown) return null;

  const send = () => !busy && ready && onSubmit();

  // A real keyboard, where there is one.
  function typed(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Escape") onClose();
    else if (event.key === "Enter") send();
    else if (event.key === "Backspace") onChange(value.slice(0, -1));
    else if (event.key.length === 1) onChange(value + event.key);
    else return;
    event.preventDefault();
  }

  function pasted(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    onChange(value + event.clipboardData.getData("text").replace(/[\r\n]+/g, " "));
  }

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal
      aria-label={label}
      tabIndex={-1}
      onKeyDown={typed}
      onPaste={pasted}
      className="fixed inset-0 z-[60] outline-none"
    >
      {/* The page, fallen back. Pressing it closes. */}
      <div ref={veil} onClick={onClose} className="keypad-veil absolute inset-0" />

      <div ref={bar} className="glass keypad-bar fixed">
        <div ref={inner} className="flex size-full items-center gap-3 pr-3 pl-4">
          {icon && <span className="shrink-0 text-ink-2">{icon}</span>}
          <div
            ref={text}
            role="textbox"
            aria-label={label}
            aria-readonly
            className="flex min-w-0 flex-1 items-center overflow-hidden text-[19px] leading-7 whitespace-pre"
          >
            <span>{value}</span>
            <span aria-hidden className="keypad-caret" />
            {!value && <span className="text-muted">{placeholder}</span>}
          </div>
          <button
            type="button"
            aria-label={enterLabel ?? "Send"}
            disabled={busy || !ready}
            onClick={send}
            className={`grid size-8 shrink-0 place-items-center rounded-full bg-ink text-bg transition-[scale,opacity] duration-300 ease-spring-soft active:scale-90 ${!value ? "scale-50 opacity-0" : ready ? "" : "opacity-35"}`}
          >
            {busy ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden className="animate-spin">
                <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </div>

        {/* What happened, just under the bar. */}
        <p aria-live="polite" className="pointer-events-none absolute inset-x-0 top-full mt-3 text-center text-[13px] leading-5 text-ink-2">
          {note?.text && (
            <span key={note.n} className="animate-roll-in inline-block">
              {note.text}
            </span>
          )}
        </p>
      </div>

      <div ref={keys} className="glass keypad-sheet fixed inset-x-0 bottom-0">
        <Keypad
          layout={layout}
          onType={(typed) => onChange(value + typed)}
          onBackspace={() => onChange(value.slice(0, -1))}
          onEnter={send}
          enterLabel={enterLabel}
          canEnter={ready && !busy}
        />
      </div>
    </div>,
    document.body,
  );
}
