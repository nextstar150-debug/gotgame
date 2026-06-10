create table if not exists public.dotgame_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  inquiry_type text not null,
  message text not null,
  timeline text,
  company text,
  available_time text,
  source text not null default 'dotgame',
  created_at timestamptz not null default now()
);

alter table public.dotgame_inquiries enable row level security;

drop policy if exists "dotgame_inquiries_insert_public" on public.dotgame_inquiries;
create policy "dotgame_inquiries_insert_public"
  on public.dotgame_inquiries
  for insert
  to anon, authenticated
  with check (
    source = 'dotgame'
    and length(name) between 1 and 120
    and length(email) between 3 and 240
    and length(message) between 1 and 4000
  );

grant insert on public.dotgame_inquiries to anon, authenticated;
