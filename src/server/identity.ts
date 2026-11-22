import { DatabaseError, query, transaction, type Run } from "./db";

/**
 * Who someone is, as far as the site knows.
 *
 * Every person who has done something here (liked a scene, signed up) has one
 * row in `visitors`. Their browser is tied to it through the random id in its
 * `vid` cookie (`browsers`). What they do is stored against the visitor, never
 * against the cookie or an address, so nothing has to be rewritten when they
 * sign up: the visitor simply gains an email, and from then on that is who
 * they are.
 *
 * The cookie stays what the browser sends. The address itself never goes in a
 * cookie, where it could be read or forged.
 *
 * One limit, on purpose: an address is not proven to belong to whoever typed
 * it, because the site sends no mail yet. So an address belongs to the first
 * visitor that signs up with it, and another browser typing the same address
 * joins nothing and learns nothing. When mail is wired in, a link in it is
 * how a second device will join the same visitor.
 */

/**
 * SQL for "the visitor behind the browser in $1", or null if that browser has
 * never done anything. `$1` must be the `vid` cookie. Reading only: it never
 * creates a visitor.
 */
export const ME = `(select visitor from browsers where cookie = $1)`;

/**
 * The visitor behind this browser, made now if this is the first thing the
 * browser has done. Also notes that they were just here.
 */
export async function ensure(cookie: string, run: Run = query): Promise<string> {
  const { rows } = await run<{ visitor: string | null; made: string | null }>(
    `with known as (
       select visitor from browsers where cookie = $1
     ), seen as (
       update visitors set last_seen = now() where id = (select visitor from known)
     ), made as (
       insert into visitors (id)
       select gen_random_uuid() where not exists (select 1 from known)
       returning id
     ), tied as (
       insert into browsers (cookie, visitor)
       select $1, id from made
       on conflict (cookie) do nothing
       returning visitor
     )
     select coalesce((select visitor from known), (select visitor from tied)) as visitor,
            (select id from made) as made`,
    [cookie],
  );
  const found = rows[0]?.visitor;
  if (found) return found;

  // Two requests from the same new browser arrived together and the other one
  // got there first. Drop the spare visitor and use theirs.
  if (rows[0]?.made) await run(`delete from visitors where id = $1`, [rows[0].made]);
  const again = await run<{ visitor: string }>(`select visitor from browsers where cookie = $1`, [cookie]);
  if (!again.rows[0]) throw new DatabaseError("Could not tell who this browser is.");
  return again.rows[0].visitor;
}

/**
 * Makes `email` this visitor's address. Returns whether it did: false when
 * another visitor already has the address. The address must already be in
 * `newsletter`.
 */
export async function claim(cookie: string, email: string) {
  try {
    return await transaction(async (run) => {
      const visitor = await ensure(cookie, run);
      const mine = await run<{ email: string | null }>(
        `select email from visitors where id = $1 for update`,
        [visitor],
      );
      if (mine.rows[0]?.email === email) return true;

      const taken = await run(`select 1 from visitors where email = $1`, [email]);
      if (taken.rowCount) return false;

      // Signing up again with a different address moves the visitor to it.
      await run(`update visitors set email = $2 where id = $1`, [visitor, email]);
      return true;
    });
  } catch (error) {
    // Two visitors reached for the same address at the same moment, and the
    // other one got it.
    if (error instanceof DatabaseError && error.code === "23505") return false;
    throw error;
  }
}
