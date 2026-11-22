import { loadYouTubeApi, type Source, type YTPlayer } from "./youtube";

const STORAGE_KEY = "playground:player";
export const RATES = [1, 1.25, 1.5, 2, 0.75];
const STALL_MS = 3500; // how long a start may take before it counts as refused

export type Status =
  | "empty"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "buffering"
  | "ended"
  | "error";

export type Snapshot = {
  status: Status;
  source: Source | null;
  videoId: string | null;
  title: string;
  author: string;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  /** Video ids when the source is a playlist. */
  queue: string[];
  index: number;
  error: string | null;
};

const EMPTY: Snapshot = {
  status: "empty",
  source: null,
  videoId: null,
  title: "",
  author: "",
  duration: 0,
  volume: 80,
  muted: false,
  rate: 1,
  queue: [],
  index: 0,
  error: null,
};

type Saved = {
  source: Source;
  index: number;
  time: number;
  volume: number;
  muted: boolean;
  rate: number;
};

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Owns the YouTube player and turns it into something React can read: an
 * immutable snapshot for `useSyncExternalStore`, a smooth clock via `time()`,
 * and plain methods for the transport. No React in here.
 */
export class PlayerController {
  private player: YTPlayer | null = null;
  private ready = false;
  private host: HTMLElement | null = null;
  private session = 0;
  private listeners = new Set<() => void>();
  private state: Snapshot = EMPTY;
  private pending: { source: Source; autoplay: boolean } | null = null;
  // What `prepare` was asked to have waiting, and the video that is.
  private standby: Source | null = null;
  private cued: string | null = null;
  // When the player was last told to start, to notice if it never does.
  private askedAt = 0;
  private wanted: string | undefined;
  private wantedStart = 0;
  private seekOnPlay = 0;
  private skipped = 0;
  private poll = 0;
  private savedAt = 0;

  // The API only reports time a few times a second, so keep a base reading
  // and extrapolate from it for a scrubber that moves every frame.
  private base = 0;
  private baseAt = 0;
  private holdUntil = 0;

  /** `remember: false` plays without saving or restoring a position. */
  constructor(private options: { remember?: boolean } = {}) {}

  private get remembers() {
    return this.options.remember !== false;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<Snapshot>) {
    const keys = Object.keys(patch) as (keyof Snapshot)[];
    if (keys.every((key) => patch[key] === this.state[key])) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  /* ── Lifecycle ──────────────────────────────────────────────────────── */

  mount(host: HTMLElement) {
    this.host = host;
    this.poll = window.setInterval(this.tick, 250);
    if (this.remembers) this.restore();
  }

  destroy() {
    this.persist();
    this.session++;
    clearInterval(this.poll);
    try {
      this.player?.destroy();
    } catch {}
    this.player = null;
    this.ready = false;
    this.host?.replaceChildren();
    this.host = null;
  }

  private restore() {
    let saved: Saved | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    } catch {}
    if (!saved?.source) return;
    this.state = {
      ...this.state,
      volume: saved.volume ?? 80,
      muted: !!saved.muted,
      rate: RATES.includes(saved.rate) ? saved.rate : 1,
    };
    this.load(
      { ...saved.source, index: saved.index, start: saved.time },
      { autoplay: false },
    );
  }

  private persist() {
    const { source, videoId, index, volume, muted, rate, status } = this.state;
    if (!this.remembers || !source || status === "error") return;
    const saved: Saved = {
      source: { videoId: videoId ?? source.videoId, listId: source.listId },
      index,
      time: status === "ended" ? 0 : Math.floor(this.time()),
      volume,
      muted,
      rate,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {}
    this.savedAt = performance.now();
  }

  /* ── Loading ────────────────────────────────────────────────────────── */

  /**
   * Gets the player up and a video waiting in it, before anyone presses play.
   *
   * A browser only lets a video with sound start as the direct result of a
   * press. Fetching YouTube's player takes a second or two, so if that only
   * began at the press, the press is long over by the time the player could
   * start, the browser refuses, and a second press is needed. With the player
   * already there, the first press reaches it at once.
   *
   * Nothing shows and nothing plays: the status stays "empty".
   */
  prepare(source: Source) {
    if (this.state.status !== "empty" || !source.videoId || source.listId) return;
    this.standby = source;
    if (!this.player) this.create();
    else if (this.ready) this.cue();
  }

  private cue() {
    const source = this.standby;
    if (!this.player || !source?.videoId || this.cued === source.videoId) return;
    this.player.cueVideoById({ videoId: source.videoId, startSeconds: source.start ?? 0 });
    this.cued = source.videoId;
  }

  load(source: Source, { autoplay = true } = {}) {
    this.pending = { source, autoplay };
    this.skipped = 0;
    this.base = source.start ?? 0;
    this.baseAt = performance.now();
    this.set({
      status: "loading",
      source,
      videoId: source.videoId ?? null,
      title: "",
      author: "",
      duration: 0,
      queue: [],
      index: source.index ?? 0,
      error: null,
    });
    this.askedAt = autoplay ? performance.now() : 0;
    if (!this.player) this.create();
    else if (!this.ready) return;
    else if (autoplay && !source.listId && source.videoId && this.cued === source.videoId) {
      // It is already waiting in the player: just start it.
      this.pending = null;
      this.player.playVideo();
    } else this.apply();
    this.cued = null;
  }

  clear() {
    this.pending = null;
    this.standby = null;
    this.cued = null;
    this.askedAt = 0;
    if (this.ready) this.player?.stopVideo();
    const { volume, muted, rate } = this.state;
    this.set({ ...EMPTY, volume, muted, rate });
    if (!this.remembers) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  private create() {
    const token = ++this.session;
    loadYouTubeApi()
      .then((YT) => {
        if (token !== this.session || !this.host) return;
        const target = document.createElement("div");
        this.host.replaceChildren(target);
        this.player = new YT.Player(target, {
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
            origin: location.origin,
          },
          events: {
            onReady: () => {
              if (token !== this.session) return;
              this.ready = true;
              this.player?.setVolume(this.state.volume);
              if (this.state.muted) this.player?.mute();
              if (this.pending) {
                // Asked to play before the player existed. Count the wait
                // from now, when it can actually begin.
                if (this.askedAt) this.askedAt = performance.now();
                this.apply();
              } else this.cue();
            },
            onStateChange: (event) => this.onState(event.data),
            onError: (event) => this.onError(event.data),
          },
        });
      })
      .catch(() => {
        if (token !== this.session) return;
        this.set({ status: "error", error: "Couldn't reach YouTube." });
      });
  }

  private apply() {
    const player = this.player;
    const job = this.pending;
    if (!player || !job) return;
    this.pending = null;
    const { source, autoplay } = job;
    const startSeconds = source.start ?? 0;

    if (source.listId) {
      // A link to one video inside a playlist: jump to it once the list loads,
      // and keep its timestamp for that video rather than the first one.
      this.wanted = source.index === undefined ? source.videoId : undefined;
      this.wantedStart = this.wanted ? startSeconds : 0;
      this.seekOnPlay = 0;
      const options = {
        list: source.listId,
        listType: "playlist" as const,
        index: source.index ?? 0,
        startSeconds: this.wanted ? 0 : startSeconds,
      };
      if (autoplay) player.loadPlaylist(options);
      else player.cuePlaylist(options);
    } else if (source.videoId) {
      const options = { videoId: source.videoId, startSeconds };
      if (autoplay) player.loadVideoById(options);
      else player.cueVideoById(options);
    }
  }

  /* ── Player events ──────────────────────────────────────────────────── */

  private onState(code: number) {
    const player = this.player;
    if (!player || !this.ready) return;
    this.rebase();

    const previous = this.state.status;
    const status: Status =
      code === 1
        ? "playing"
        : code === 2
          ? "paused"
          : code === 3
            ? "buffering"
            : code === 0
              ? "ended"
              : code === 5
                ? "ready"
                : previous === "empty"
                  ? "empty"
                  : "loading";
    if (previous === "empty") return;

    this.sync({ status, error: null });
    if (code === 1) {
      this.askedAt = 0;
      this.skipped = 0;
      if (this.seekOnPlay && !this.wanted) {
        const start = this.seekOnPlay;
        this.seekOnPlay = 0;
        this.seek(start);
      }
      if (player.getPlaybackRate() !== this.state.rate)
        player.setPlaybackRate(this.state.rate);
    }
  }

  private onError(code: number) {
    // Inside a playlist, quietly step over the odd unplayable video.
    if (this.state.queue.length > 1 && this.skipped < 3) {
      this.skipped++;
      this.player?.nextVideo();
      return;
    }
    this.set({
      status: "error",
      error:
        code === 101 || code === 150
          ? "The owner doesn't allow this video to play here."
          : code === 100
            ? "That video is private or was removed."
            : "That link couldn't be played.",
    });
  }

  /** Pull whatever the player currently knows into the snapshot. */
  private sync(patch: Partial<Snapshot> = {}) {
    const player = this.player;
    if (!player || !this.ready) return;
    const data = player.getVideoData?.() ?? {};
    const list = player.getPlaylist?.() ?? [];
    const queue = sameList(list, this.state.queue) ? this.state.queue : list;
    const videoId = data.video_id || this.state.videoId;
    const changed = videoId !== this.state.videoId;

    this.set({
      ...patch,
      videoId,
      title: data.title || (changed ? "" : this.state.title),
      author: data.author || (changed ? "" : this.state.author),
      duration: player.getDuration?.() || 0,
      queue,
      index: queue.length ? Math.max(0, player.getPlaylistIndex()) : 0,
    });

    if (this.wanted && queue.length) {
      const at = queue.indexOf(this.wanted);
      this.wanted = undefined;
      if (at === this.state.index) {
        // Already on it: seek now if it is playing, otherwise when it starts.
        if (this.state.status === "playing" && this.wantedStart)
          this.seek(this.wantedStart);
        else this.seekOnPlay = this.wantedStart;
      }
      else if (at > 0) {
        this.seekOnPlay = this.wantedStart;
        player.playVideoAt(at);
      }
    }
  }

  private tick = () => {
    if (!this.ready || this.state.status === "empty") return;
    this.rebase();
    this.sync();
    // Told to start, and still sitting there seconds later: the browser
    // refused to let it start without a fresh press. Say it is ready rather
    // than loading for ever, so the next press starts it.
    if (
      this.state.status === "loading" &&
      this.askedAt &&
      performance.now() - this.askedAt > STALL_MS
    ) {
      const state = this.player?.getPlayerState?.();
      if (state === -1 || state === 5) {
        this.askedAt = 0;
        this.set({ status: "ready" });
      }
    }
    const { status } = this.state;
    const active = status === "playing" || status === "paused";
    if (active && performance.now() - this.savedAt > 2000) this.persist();
  };

  private rebase() {
    const reported = this.player?.getCurrentTime?.() ?? 0;
    const now = performance.now();
    // Just after a seek the player still reports the old position for a beat.
    if (now < this.holdUntil && Math.abs(reported - this.base) > 1.5) return;
    this.base = reported;
    this.baseAt = now;
  }

  /* ── Reading ────────────────────────────────────────────────────────── */

  /** Current position in seconds, smooth between the player's reports. */
  time() {
    const { status, rate, duration } = this.state;
    let t = this.base;
    if (status === "playing")
      t += ((performance.now() - this.baseAt) / 1000) * rate;
    return duration ? Math.min(t, duration) : t;
  }

  /** Fraction of the video that has buffered, 0 to 1. */
  loaded() {
    return (this.ready && this.player?.getVideoLoadedFraction?.()) || 0;
  }

  /* ── Transport ──────────────────────────────────────────────────────── */

  toggle() {
    const player = this.player;
    if (!player || !this.ready) return;
    const { status } = this.state;
    if (status === "playing" || status === "buffering") player.pauseVideo();
    else if (status === "ended") {
      this.seek(0);
      player.playVideo();
    } else player.playVideo();
  }

  seek(seconds: number) {
    if (!this.player || !this.ready) return;
    const limit = this.state.duration || Infinity;
    const t = Math.min(Math.max(0, seconds), limit);
    this.player.seekTo(t, true);
    this.base = t;
    this.baseAt = performance.now();
    this.holdUntil = this.baseAt + 800;
  }

  seekBy(delta: number) {
    this.seek(this.time() + delta);
  }

  get hasQueue() {
    return this.state.queue.length > 1;
  }

  next() {
    if (this.ready && this.hasQueue) this.player?.nextVideo();
  }

  /** Restart the track; a second press near the start goes to the previous one. */
  previous() {
    if (!this.ready) return;
    if (!this.hasQueue || this.time() > 3 || this.state.index === 0)
      return this.seek(0);
    this.player?.previousVideo();
  }

  playAt(index: number) {
    if (this.ready) this.player?.playVideoAt(index);
  }

  setVolume(value: number) {
    const volume = Math.round(Math.min(100, Math.max(0, value)));
    if (this.ready) {
      this.player?.setVolume(volume);
      if (volume > 0) this.player?.unMute();
    }
    this.set({ volume, muted: volume === 0 });
  }

  toggleMute() {
    const { muted, volume } = this.state;
    if (muted && volume === 0) return this.setVolume(40);
    if (this.ready) {
      if (muted) this.player?.unMute();
      else this.player?.mute();
    }
    this.set({ muted: !muted });
  }

  cycleRate() {
    const rate = RATES[(RATES.indexOf(this.state.rate) + 1) % RATES.length];
    this.rebase();
    if (this.ready) this.player?.setPlaybackRate(rate);
    this.set({ rate });
    return rate;
  }
}
