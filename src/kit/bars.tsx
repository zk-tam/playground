import type { CSSProperties } from "react";

/**
 * Icons built from a few rounded bars. A pose is a width, an offset from the
 * centre and a rotation, so morphing between two icons is just a CSS
 * transition from one pose to the other.
 */
export type Pose = [
  width: number,
  x: number,
  y: number,
  rotate: number,
  opacity?: number,
];

export function Bar({ pose }: { pose: Pose }) {
  const [width, x, y, rotate, opacity = 1] = pose;
  const style: CSSProperties = {
    width,
    opacity,
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rotate}deg)`,
  };
  return (
    <span
      style={style}
      className="absolute top-1/2 left-1/2 h-[2px] rounded-full bg-current transition-[width,transform,opacity] duration-500 ease-spring-soft"
    />
  );
}

export function Bars({
  on,
  poses,
}: {
  on: boolean;
  poses: [off: Pose, on: Pose][];
}) {
  return poses.map(([a, b], i) => <Bar key={i} pose={on ? b : a} />);
}

/** Reads one of the easing tokens from globals.css, for the Web Animations API. */
export function easing(name: "spring" | "spring-soft" | "out-quint") {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(`--ease-${name}`)
      .trim() || "ease-out"
  );
}
