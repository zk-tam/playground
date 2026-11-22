/**
 * A tiny damped spring. No React, no dependencies: it owns one number and
 * calls `onUpdate` every frame until it settles. Write the value straight to
 * `element.style` inside `onUpdate` so gestures never re-render.
 */
export type SpringConfig = {
  stiffness?: number;
  damping?: number;
  mass?: number;
  /** Settle threshold for both distance and velocity. */
  precision?: number;
};

const reduced = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Spring {
  value: number;
  target: number;
  velocity = 0;

  private frame = 0;
  private last = 0;

  constructor(
    initial: number,
    private onUpdate: (value: number) => void,
    private config: SpringConfig = {},
  ) {
    this.value = initial;
    this.target = initial;
  }

  /** Animate towards `target`, optionally seeding velocity (units/second). */
  to(target: number, options: { velocity?: number } & SpringConfig = {}) {
    const { velocity, ...config } = options;
    this.config = { ...this.config, ...config };
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
    if (reduced()) return this.jump(target);
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  /** Set the value immediately, e.g. while a finger is down. */
  jump(value: number) {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.onUpdate(value);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private tick = (now: number) => {
    const { stiffness = 220, damping = 26, mass = 1, precision = 0.01 } =
      this.config;
    // Clamp long frames, then integrate in ~4ms substeps for stability.
    // Never negative: a frame's timestamp can predate the moment it was asked for.
    const dt = Math.min(Math.max(0, (now - this.last) / 1000), 1 / 15);
    this.last = now;
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const force =
        -stiffness * (this.value - this.target) - damping * this.velocity;
      this.velocity += (force / mass) * h;
      this.value += this.velocity * h;
    }

    const settled =
      Math.abs(this.velocity) < precision &&
      Math.abs(this.value - this.target) < precision;
    if (settled) {
      this.value = this.target;
      this.velocity = 0;
      this.frame = 0;
      this.onUpdate(this.value);
      return;
    }
    this.onUpdate(this.value);
    this.frame = requestAnimationFrame(this.tick);
  };
}

/** iOS-style rubber band: resistance grows the further you pull. */
export function rubber(distance: number, dimension: number, constant = 0.55) {
  return (
    (distance * dimension * constant) / (dimension + constant * Math.abs(distance))
  );
}

/** Tracks pointer velocity (px/second) over the last few moves. */
export function velocityTracker() {
  let samples: { x: number; y: number; t: number }[] = [];
  return {
    reset() {
      samples = [];
    },
    add(x: number, y: number) {
      const t = performance.now();
      samples.push({ x, y, t });
      while (samples.length > 2 && t - samples[0].t > 100) samples.shift();
    },
    get() {
      if (samples.length < 2) return { x: 0, y: 0 };
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0 || performance.now() - b.t > 80) return { x: 0, y: 0 };
      return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    },
  };
}
