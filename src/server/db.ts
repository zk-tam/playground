import { Pool, type QueryResult, type QueryResultRow } from "pg";

/**
 * The database: Postgres (Supabase), reached with `pg` through the one
 * connection string in `DATABASE_URL`. Server only; nothing here is ever
 * sent to the browser.
 *
 * The tables are in `db/schema.sql`. Create them once with `npm run db:setup`.
 */

// One pool for the whole server, kept across hot reloads. It remembers which
// address it was made for, so changing DATABASE_URL takes effect at once.
const globals = globalThis as { __db?: { url: string; pool: Pool } };

/** The database could not be reached, has not been set up, or refused. */
export class DatabaseError extends Error {
  /** Postgres's own code for what went wrong, when it gave one. */
  code?: string;
}

/** Runs one statement. Values always travel as parameters, never in the text. */
export type Run = <Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
) => Promise<QueryResult<Row>>;

function pool() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new DatabaseError(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  if (globals.__db?.url === url) return globals.__db.pool;
  globals.__db?.pool.end().catch(() => {});

  let local = false;
  try {
    local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    throw new DatabaseError("DATABASE_URL is not a valid connection string.");
  }

  const made = new Pool({
    connectionString: url,
    // Supabase is reached over TLS. Its certificate is signed by Supabase's
    // own authority, which Node does not know, so the connection is
    // encrypted but the certificate is not checked.
    ssl: local ? false : { rejectUnauthorized: false },
    // Small on purpose: Supabase's pooler sits in front and does the sharing.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // An idle connection dropped by the server must not take the process down.
  made.on("error", (error) => console.error("[db]", error.message));
  globals.__db = { url, pool: made };
  return made;
}

/** Say what went wrong on the server, and nothing of it to the visitor. */
function failure(error: unknown) {
  if (error instanceof DatabaseError) return error;
  console.error("[db]", error instanceof Error ? error.message : error);
  const wrapped = new DatabaseError("The database could not be reached.");
  wrapped.code = (error as { code?: string } | null)?.code;
  return wrapped;
}

export const query: Run = async (text, values = []) => {
  try {
    return await pool().query(text, values);
  } catch (error) {
    throw failure(error);
  }
};

/**
 * Several statements that happen together or not at all. `work` gets its own
 * `run`; if it throws, everything it did is undone.
 */
export async function transaction<T>(work: (run: Run) => Promise<T>): Promise<T> {
  let client;
  try {
    client = await pool().connect();
  } catch (error) {
    throw failure(error);
  }
  try {
    await client.query("begin");
    const result = await work((text, values = []) => client.query(text, values));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw failure(error);
  } finally {
    client.release();
  }
}
