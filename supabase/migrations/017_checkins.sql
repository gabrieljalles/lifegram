-- Lifegram v2, fase 1: tipo e dose nos itens da agenda, e o check-in da noite.
-- So acrescenta: nenhuma tabela ou coluna existente e apagada ou alterada.

alter table public.activities add column if not exists item_type text;
alter table public.activities add column if not exists dose text;

create table if not exists public.checkins (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  day           date not null,
  happiness     smallint check (happiness between 1 and 5),
  energy        smallint check (energy between 1 and 5),
  sleep_minutes integer check (sleep_minutes between 0 and 1440),
  sleep_quality smallint check (sleep_quality between 1 and 3),
  words         text[] not null default '{}',
  note          text,
  -- Respostas da parte 2 (alcool, sexo...): jsonb para a lista mudar sem migracao.
  factors       jsonb not null default '{}'::jsonb,
  deleted       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists checkins_user_updated_idx on public.checkins (user_id, updated_at);
create index if not exists checkins_user_day_idx on public.checkins (user_id, day);

alter table public.checkins enable row level security;

drop policy if exists checkins_owner on public.checkins;
create policy checkins_owner on public.checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
