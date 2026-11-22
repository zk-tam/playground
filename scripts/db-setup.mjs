// Creates the site's tables in the database named by DATABASE_URL.
//
//   npm run db:setup
//
// It reads the same .env files Next does (.env.local first), runs
// db/schema.sql, and can be run again at any time without harm.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";

const root = fileURLToPath(new URL("..", import.meta.url));
nextEnv.loadEnvConfig(root, true, { info() {}, error: console.error });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
const client = new pg.Client({
  connectionString: url,
  ssl: local ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});

try {
  await client.connect();
  await client.query(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = current_schema() and table_name in ('likes', 'newsletter', 'identities')
     order by table_name`,
  );
  console.log(`Ready: ${rows.map((row) => row.table_name).join(", ")}.`);
} catch (error) {
  console.error("Could not set up the database:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
