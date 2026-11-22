import { cookies, headers } from "next/headers";

const YEAR = 60 * 60 * 24 * 365;

/**
 * An anonymous id for this browser, in an http-only cookie. It exists so one
 * visitor gets one vote; it is random, carries nothing about the person, and
 * is never sent back in a response.
 */
export async function visitor() {
  const jar = await cookies();
  const existing = jar.get("vid")?.value;
  if (existing && /^[\w-]{20,40}$/.test(existing)) return existing;
  const id = crypto.randomUUID();
  jar.set("vid", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: YEAR,
    path: "/",
  });
  return id;
}

async function address() {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

/** Writes must come from our own pages, not from another site's form or script. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

const globals = globalThis as { __rateHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (globals.__rateHits ??= new Map());

/**
 * True when this visitor (by cookie, and separately by address) has gone over
 * `max` calls to `action` within `windowMs`. In memory, so it resets when the
 * server restarts; enough to blunt a script, not a determined attacker.
 */
export async function limited(action: string, who: string, max: number, windowMs: number) {
  const now = Date.now();
  let over = false;
  for (const key of [`${action}:v:${who}`, `${action}:a:${await address()}`]) {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) over = true;
    else recent.push(now);
    hits.set(key, recent);
  }
  if (hits.size > 20_000) hits.clear();
  return over;
}

export const fail = (status: number, error: string) =>
  Response.json({ error }, { status });

/** Parses a small JSON body, or returns null if it is missing, huge or malformed. */
export async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > 2_000) return null;
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
