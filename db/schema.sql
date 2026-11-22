-- Everything the site stores. Safe to run more than once.
--
--   npm run db:setup
--
-- or paste it into the SQL editor in the Supabase dashboard. It runs as one
-- unit: if any part fails, nothing changes.

-- Addresses collected for the newsletter. This is the list a mail tool reads.
create table if not exists newsletter (
  email text primary key,
  created_at timestamptz not null default now()
);

-- One row per person, as far as the site can tell. A row is made the first
-- time someone does something (likes a scene, signs up), not when they merely
-- visit. `email` is empty until they sign up for the newsletter; from then on
-- it is who they are.
create table if not exists visitors (
  id uuid primary key default gen_random_uuid(),
  email text unique references newsletter (email) on update cascade on delete set null,
  first_seen timestamptz not null default now(),
  -- The last time they did something.
  last_seen timestamptz not null default now()
);

-- Which browser belongs to which visitor. `cookie` is the random id in the
-- browser's `vid` cookie. One browser per visitor for now; when the site
-- sends mail, a link in it is how a second device will join the same visitor.
create table if not exists browsers (
  cookie text primary key,
  visitor uuid not null references visitors (id) on delete cascade,
  first_seen timestamptz not null default now()
);

-- Who liked what. One row per visitor per thing.
create table if not exists likes (
  key text not null,
  visitor uuid not null references visitors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (key, visitor)
);

-- Moving on from the first layout, where `likes.visitor` was text (a cookie
-- id, or an address once signed up) and an `identities` table said which
-- browser spoke for which address. Every like and every sign-up is carried
-- over. Does nothing on a database that is already in the layout above.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'likes'
      and column_name = 'visitor' and data_type = 'text'
  ) then
    -- People who had signed up: a visitor with their address, and the browser
    -- that spoke for it.
    if to_regclass('identities') is not null then
      insert into visitors (email)
        select email from identities
        on conflict (email) do nothing;
      insert into browsers (cookie, visitor)
        select i.visitor, v.id from identities i join visitors v on v.email = i.email
        on conflict (cookie) do nothing;
    end if;

    -- Likes filed under an address that no browser speaks for any more.
    insert into visitors (email)
      select distinct l.visitor from likes l join newsletter n on n.email = l.visitor
      on conflict (email) do nothing;

    -- Everyone else who liked something: one visitor per cookie.
    with fresh as (
      select cookie, gen_random_uuid() as id
      from (
        select distinct l.visitor as cookie from likes l
        where l.visitor not like '%@%'
          and not exists (select 1 from browsers b where b.cookie = l.visitor)
      ) unseen
    ), made as (
      insert into visitors (id) select id from fresh
    )
    insert into browsers (cookie, visitor) select cookie, id from fresh;

    -- Point each like at its visitor, then swap the columns over.
    alter table likes add column person uuid;
    update likes l set person = b.visitor from browsers b where b.cookie = l.visitor;
    update likes l set person = v.id from visitors v where l.person is null and v.email = l.visitor;
    delete from likes where person is null;
    delete from likes a using likes b
      where a.ctid < b.ctid and a.key = b.key and a.person = b.person;
    alter table likes drop constraint if exists likes_pkey;
    alter table likes drop column visitor;
    alter table likes rename column person to visitor;
    alter table likes alter column visitor set not null;
    alter table likes add primary key (key, visitor);
    alter table likes
      add constraint likes_visitor_fkey foreign key (visitor) references visitors (id) on delete cascade;

    -- A visitor is as old as their first like.
    update visitors v set first_seen = seen.first, last_seen = seen.last
      from (select visitor, min(created_at) as first, max(created_at) as last from likes group by visitor) seen
      where seen.visitor = v.id;

    drop table if exists identities;
  end if;
end $$;

-- Supabase also serves the public schema over its own HTTP API, to anyone
-- holding the project's public key. Row level security with no policies shuts
-- that door: the site's own connection (DATABASE_URL) owns the tables and is
-- not affected.
alter table newsletter enable row level security;
alter table visitors enable row level security;
alter table browsers enable row level security;
alter table likes enable row level security;
