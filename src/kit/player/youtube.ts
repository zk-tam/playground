/** What a pasted link resolves to. */
export type Source = {
  videoId?: string;
  listId?: string;
  /** Position in the playlist, zero-based. */
  index?: number;
  /** Start offset in seconds. */
  start?: number;
};

const VIDEO_ID = /^[\w-]{11}$/;
const LIST_ID = /^[\w-]{12,}$/;

/** "90", "90s", "1m30s", "1h2m3s" → seconds. */
function parseTime(value: string | null) {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return undefined;
  const [, h = 0, m = 0, s = 0] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/**
 * Accepts the many shapes a YouTube link takes: watch, youtu.be, shorts, live,
 * embed, music.youtube.com, a bare playlist, a video inside a playlist, with or
 * without a timestamp. Returns null for anything else.
 */
export function parseYouTubeUrl(input: string): Source | null {
  const text = input.trim();
  if (!text) return null;
  if (VIDEO_ID.test(text)) return { videoId: text };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const query = url.searchParams;
  const [first, second] = url.pathname.split("/").filter(Boolean);

  let videoId: string | undefined;
  if (host === "youtu.be") videoId = first;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (first === "watch") videoId = query.get("v") ?? undefined;
    else if (["embed", "shorts", "live", "v"].includes(first)) videoId = second;
  } else return null;

  if (!videoId || !VIDEO_ID.test(videoId)) videoId = undefined;
  const list = query.get("list");
  const listId = list && LIST_ID.test(list) ? list : undefined;
  if (!videoId && !listId) return null;

  const index = Number(query.get("index"));
  return {
    videoId,
    listId,
    index: listId && index >= 1 ? index - 1 : undefined,
    start: parseTime(query.get("t") ?? query.get("start")),
  };
}

/** The short, readable form shown in the field once a link is loaded. */
export function prettyUrl(source: Source) {
  if (source.listId && !source.videoId)
    return `youtube.com/playlist?list=${source.listId}`;
  return `youtu.be/${source.videoId}${source.listId ? `?list=${source.listId}` : ""}`;
}

export function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export const thumbnail = (videoId: string) =>
  `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

/* ── Titles ─────────────────────────────────────────────────────────────
   oEmbed needs no key and allows cross-origin reads. Cached per video. */
export type Meta = { title: string; author: string };
const metaCache = new Map<string, Promise<Meta | null>>();

export function fetchMeta(videoId: string) {
  let request = metaCache.get(videoId);
  if (!request) {
    const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
    request = fetch(`https://www.youtube.com/oembed?format=json&url=${target}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) =>
        data ? { title: data.title as string, author: data.author_name as string } : null,
      )
      .catch(() => null);
    metaCache.set(videoId, request);
  }
  return request;
}

/* ── IFrame Player API ──────────────────────────────────────────────────
   The only sanctioned way to play YouTube. Loaded once, on first use. */
export type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  /** -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued. */
  getPlayerState(): number;
  getDuration(): number;
  getVideoLoadedFraction(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getVideoData(): { video_id?: string; title?: string; author?: string };
  getPlaylist(): string[] | null;
  getPlaylistIndex(): number;
  nextVideo(): void;
  previousVideo(): void;
  playVideoAt(index: number): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  loadPlaylist(options: PlaylistOptions): void;
  cuePlaylist(options: PlaylistOptions): void;
  destroy(): void;
};

type PlaylistOptions = {
  list: string;
  listType: "playlist";
  index?: number;
  startSeconds?: number;
};

export type YTApi = {
  Player: new (
    element: HTMLElement,
    options: {
      host?: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<YTApi> | null = null;

export function loadYouTubeApi() {
  api ??= new Promise<YTApi>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      api = null;
      reject(new Error("YouTube API failed to load"));
    };
    document.head.append(script);
  });
  return api;
}
