-- Paniiic Hall of Fame (leaderboard spec, Requirement 8.1).
-- Paste into the Supabase SQL editor once. Safe to re-run: grants and policies are reset, but
-- `create table if not exists` leaves an existing table's columns as they are.
-- The game uses the publishable key, which maps to the `anon` role. That role may read every row
-- and insert only the seven client columns. Nobody can update or delete through the API.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  -- The UTC Day of created_at. Generated, so no writer can set it apart from created_at.
  day         date        generated always as ((created_at at time zone 'utc')::date) stored,
  name        text        not null check (name ~ '^[A-Za-z0-9 _-]{3,12}$' and name = btrim(name)),
  score       integer     not null check (score between 0 and 20000),
  outcome     text        not null check (outcome in ('won', 'lost')),
  seconds     integer     not null check (seconds between 0 and 3600),
  download    integer     not null check (download between 0 and 100),
  kills       integer     not null check (kills between 0 and 2000),
  version     integer     not null check (version between 1 and 100)
);

create index if not exists scores_score_idx     on public.scores (score desc, created_at);
create index if not exists scores_day_score_idx on public.scores (day, score desc, created_at);

alter table public.scores enable row level security;

-- Start from nothing, then grant exactly what the game needs. Insert is column-level, so a
-- request that names id, created_at or day is refused; the database sets all three.
revoke all on public.scores from anon, authenticated;
grant select on public.scores to anon, authenticated;
grant insert (name, score, outcome, seconds, download, kills, version) on public.scores to anon, authenticated;

drop policy if exists "scores are public" on public.scores;
create policy "scores are public" on public.scores
  for select to anon, authenticated using (true);

drop policy if exists "anyone can sign" on public.scores;
create policy "anyone can sign" on public.scores
  for insert to anon, authenticated with check (true);

-- No update or delete policy exists, so both are denied for anon and authenticated.
