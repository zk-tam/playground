import { DatabaseError, transaction } from "./db";

/**
 * Who someone is, as far as the site knows.
 *
 * Before they sign up, a visitor is the random id in their browser's `vid`
 * cookie. Once they sign up for the newsletter, that browser speaks for their
 * email address instead: the `identities` table says which browser stands for
 * which address, and everything stored against the cookie id is moved over to
 * the address.
 *
 * The cookie stays what the browser sends. The address itself never goes in a
 * cookie, where it could be read or forged.
 *
 * One limit, on purpose: an address is not proven to belong to whoever typed
 * it, because the site sends no mail yet. So an address belongs to the first
 * browser that signs up with it, and a second browser typing the same address
 * is added to nothing and learns nothing. When mail is wired in, a link in it
 * is how a second device will join the same identity.
 */

/**
 * SQL for "the identity of the visitor in $1": their address if this browser
 * has signed up, their cookie id if not. `$1` must be the `vid` cookie.
 */
export const ME = `coalesce((select email from identities where visitor = $1), $1)`;

/**
 * Makes this browser speak for `email`, and moves what it has done so far
 * over to that address. Returns whether it did: false when another browser
 * already speaks for the address.
 */
export async function claim(visitor: string, email: string) {
  try {
    return await transaction(async (run) => {
      const mine = await run<{ email: string }>(
        `select email from identities where visitor = $1 for update`,
        [visitor],
      );
      const before = mine.rows[0]?.email;
      if (before === email) return true;

      const taken = await run(`select 1 from identities where email = $1`, [email]);
      if (taken.rowCount) return false;

      // A browser that signs up again with a different address moves to it.
      if (before) await run(`update identities set email = $2 where visitor = $1`, [visitor, email]);
      else await run(`insert into identities (visitor, email) values ($1, $2)`, [visitor, email]);

      // Carry over what was stored against the old identity. Where both have
      // liked the same thing, one like is enough.
      const from = before ?? visitor;
      await run(
        `delete from likes old using likes kept
         where old.visitor = $1 and kept.visitor = $2 and old.key = kept.key`,
        [from, email],
      );
      await run(`update likes set visitor = $2 where visitor = $1`, [from, email]);
      return true;
    });
  } catch (error) {
    // Two browsers reached for the same address at the same moment, and the
    // other one got it.
    if (error instanceof DatabaseError && error.code === "23505") return false;
    throw error;
  }
}
