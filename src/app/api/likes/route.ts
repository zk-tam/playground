import { scenes } from "@/modules/cinema/scenes";
import { DatabaseError, query } from "@/server/db";
import { ME } from "@/server/identity";
import { body, fail, limited, sameOrigin, visitor } from "@/server/request";

// The only things that can be liked: each curated scene.
const KEYS = scenes.map((scene) => `cinema:${scene.id}`);
const known = new Set(KEYS);

/** Counts for everything, and which of them this visitor liked. Never who. */
async function view(me: string) {
  const { rows } = await query<{ key: string; count: number; mine: boolean }>(
    `select key, count(*)::int as count, bool_or(visitor = ${ME}) as mine
     from likes
     where key = any($2::text[])
     group by key`,
    [me, KEYS],
  );
  const counts: Record<string, number> = Object.fromEntries(KEYS.map((key) => [key, 0]));
  const mine: string[] = [];
  for (const row of rows) {
    counts[row.key] = row.count;
    if (row.mine) mine.push(row.key);
  }
  return { counts, mine };
}

const unavailable = (error: unknown) => {
  if (error instanceof DatabaseError) return fail(503, "Likes are unavailable right now.");
  throw error;
};

export async function GET() {
  const me = await visitor();
  try {
    return Response.json(await view(me));
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "Forbidden.");
  const me = await visitor();
  const input = await body(request);
  const key = input?.key;
  if (typeof key !== "string" || !known.has(key) || typeof input?.on !== "boolean")
    return fail(400, "Bad request.");
  if (await limited("like", me, 60, 60_000)) return fail(429, "Slow down a little.");

  try {
    // One row per person per thing, so liking twice changes nothing. The
    // person is their address once they have signed up, their cookie until.
    if (input.on)
      await query(
        `insert into likes (visitor, key) values (${ME}, $2) on conflict do nothing`,
        [me, key],
      );
    else await query(`delete from likes where visitor = ${ME} and key = $2`, [me, key]);
    return Response.json(await view(me));
  } catch (error) {
    return unavailable(error);
  }
}
