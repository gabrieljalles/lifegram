-- Agenda de atividades: recorrentes (dias da semana) e esporadicas (uma data).
create table if not exists public.activities (
  id               uuid primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null,
  icon             text not null default '⭐',
  kind             text not null check (kind in ('recorrente', 'esporadica')),
  -- Dias da semana da recorrente: 0 = domingo ... 6 = sabado.
  days             smallint[] not null default '{}',
  -- Data da esporadica.
  date             date,
  -- Horario HH:mm; null = qualquer hora do dia.
  time             text,
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  -- Primeiro dia valido da recorrente: o passado nao cobra.
  starts_on        date not null,
  -- Evento espelhado no Google Agenda.
  gcal_event_id    text,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists activities_user_updated_idx
  on public.activities (user_id, updated_at);

alter table public.activities enable row level security;

drop policy if exists activities_owner on public.activities;
create policy activities_owner on public.activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Uma linha por atividade cumprida num dia. Desmarcar apaga a linha.
create table if not exists public.activity_logs (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  day         date not null,
  done_at     timestamptz not null,
  updated_at  timestamptz not null default now()
);

create index if not exists activity_logs_user_updated_idx
  on public.activity_logs (user_id, updated_at);

alter table public.activity_logs enable row level security;

drop policy if exists activity_logs_owner on public.activity_logs;
create policy activity_logs_owner on public.activity_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
