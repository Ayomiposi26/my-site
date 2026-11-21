-- The reasoning service's memory (Challenge 2). You run this ONCE, right
-- before you build the service: Supabase dashboard -> SQL Editor -> New
-- query -> paste this whole file -> Run. Expect "Success. No rows returned."
-- The build guide (course book, end of Lane 2) explains every line.

-- One row per problem type ("syllogism", "plausibility", "bernoulli").
-- Each time your /api/reasoning/decide answers a problem, it overwrites the
-- row for that type with the newest problem and your newest answer. Your
-- /reasoning page reads these three rows back. jsonb means "a JSON object,
-- stored so the database can read inside it": the whole problem and the
-- whole answer fit in one column each, no matter their shape.

-- Safe to re-run. The check keeps `type` to the three problem kinds.
create table if not exists public.reasoning_latest (
  type text primary key,
  problem jsonb not null,
  answer jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.reasoning_latest
  drop constraint if exists reasoning_latest_type_check;

alter table public.reasoning_latest
  add constraint reasoning_latest_type_check
  check (type in ('syllogism', 'plausibility', 'bernoulli'));

-- Row-level security, same idea as the guestbook: with it on and no
-- policies, nobody can touch the table. Your site connects with the
-- publishable key (the visitor badge), so the policies below grant exactly
-- what the service needs: anyone may read (your /reasoning page is public),
-- and anyone may write (your API route saves each answer as it happens).
alter table public.reasoning_latest enable row level security;

drop policy if exists "anyone can read" on public.reasoning_latest;
drop policy if exists "anyone can insert" on public.reasoning_latest;
drop policy if exists "anyone can update" on public.reasoning_latest;

create policy "anyone can read" on public.reasoning_latest
  for select using (true);
create policy "anyone can insert" on public.reasoning_latest
  for insert with check (true);
create policy "anyone can update" on public.reasoning_latest
  for update using (true) with check (true);

-- The grant, same idea as the guestbook: the policies say which rows, the
-- grant lets the "anon" role (the publishable key, no sign-in) use the
-- table at all. Both are required. Without it, every request fails with
-- "permission denied for table reasoning_latest".
grant select, insert, update on public.reasoning_latest to anon;
