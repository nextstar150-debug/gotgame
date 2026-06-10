create table if not exists public.dotgame_counters (
  key text primary key,
  value bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.dotgame_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('start', 'success', 'share')),
  level int not null check (level between 1 and 99),
  session_id text,
  created_at timestamptz not null default now()
);

create index if not exists dotgame_events_event_type_idx
  on public.dotgame_events(event_type);

create index if not exists dotgame_events_created_at_idx
  on public.dotgame_events(created_at desc);

insert into public.dotgame_counters (key, value)
values
  ('plays', 12901),
  ('solves', 0),
  ('shares', 0)
on conflict (key) do nothing;

create or replace function public.track_dotgame_event(
  event_type text,
  level int,
  session_id text default null
)
returns table(total_plays bigint, total_solves bigint, total_shares bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if event_type not in ('start', 'success', 'share') then
    raise exception 'Invalid DotGame event type';
  end if;

  if level is null or level < 1 or level > 99 then
    raise exception 'Invalid DotGame level';
  end if;

  insert into public.dotgame_events (event_type, level, session_id)
  values (event_type, level, session_id);

  insert into public.dotgame_counters (key, value, updated_at)
  values (
    case
      when event_type = 'start' then 'plays'
      when event_type = 'success' then 'solves'
      else 'shares'
    end,
    1,
    now()
  )
  on conflict (key) do update
    set value = public.dotgame_counters.value + 1,
        updated_at = now();

  return query
  select
    coalesce((select value from public.dotgame_counters where key = 'plays'), 0),
    coalesce((select value from public.dotgame_counters where key = 'solves'), 0),
    coalesce((select value from public.dotgame_counters where key = 'shares'), 0);
end;
$$;

alter table public.dotgame_counters enable row level security;
alter table public.dotgame_events enable row level security;

drop policy if exists "dotgame_counters_read_public" on public.dotgame_counters;
create policy "dotgame_counters_read_public"
  on public.dotgame_counters
  for select
  to anon, authenticated
  using (true);

drop policy if exists "dotgame_events_no_direct_access" on public.dotgame_events;
create policy "dotgame_events_no_direct_access"
  on public.dotgame_events
  for select
  to authenticated
  using (false);

grant select on public.dotgame_counters to anon, authenticated;
grant execute on function public.track_dotgame_event(text, int, text) to anon, authenticated;
