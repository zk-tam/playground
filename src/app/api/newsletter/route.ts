import { DatabaseError, query } from "@/server/db";
import { claim } from "@/server/identity";
import { body, fail, limited, sameOrigin, visitor } from "@/server/request";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROOM = 20_000; // the most addresses the list will take

/**
 * Collects an address for the newsletter, and makes it this visitor's own
 * (see `src/server/identity.ts`). Nothing here sends mail, and
 * there is no way to read the list back over HTTP. The addresses sit in the
 * `newsletter` table until a mail provider is wired in.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "Forbidden.");
  const me = await visitor();
  const input = await body(request);
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email))
    return fail(400, "That doesn't look like an email address.");
  if (await limited("subscribe", me, 3, 60 * 60_000))
    return fail(429, "Too many tries. Come back in a while.");

  try {
    // Added only while there is room; an address already there is left alone.
    const { rows } = await query<{ full: boolean }>(
      `with room as (select count(*) < $2 as open from newsletter),
            added as (
              insert into newsletter (email)
              select $1 from room where open
              on conflict (email) do nothing
            )
       select not open
              and not exists (select 1 from newsletter where email = $1) as full
       from room`,
      [email, ROOM],
    );
    if (rows[0]?.full) return fail(409, "The list is full for now.");
    await claim(me, email);
  } catch (error) {
    if (error instanceof DatabaseError)
      return fail(503, "Sign-ups are unavailable right now. Try again later.");
    throw error;
  }
  // The same answer whether or not the address was already there.
  return Response.json({ ok: true });
}
