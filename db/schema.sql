-- Everything the site stores. Safe to run more than once.
--
--   npm run db:setup
--
-- or paste it into the SQL editor in the Supabase dashboard.

-- Who liked what. One row per person per thing. `visitor` is the anonymous id
-- from the `vid` cookie, or the person's address once they have signed up.
create table if not exists likes (
  key text not null,
  visitor text not null,
  created_at timestamptz not null default now(),
  primary key (key, visitor)
);

-- Addresses collected for the newsletter.
create table if not exists newsletter (
  email text primary key,
  created_at timestamptz not null default now()
);

-- Which browser speaks for which address. Signing up for the newsletter adds
-- a row, and what the browser had stored under its cookie id moves to the
-- address. One browser per address for now: nothing proves an address belongs
-- to whoever typed it until the site sends mail.
create table if not exists identities (
  visitor text primary key,
  email text not null unique references newsletter (email) on update cascade on delete cascade,
  created_at timestamptz not null default now()
);

-- Supabase also serves the public schema over its own HTTP API, to anyone
-- holding the project's public key. Row level security with no policies shuts
-- that door: the site's own connection (DATABASE_URL) owns the tables and is
-- not affected.
alter table likes enable row level security;
alter table newsletter enable row level security;
alter table identities enable row level security;
