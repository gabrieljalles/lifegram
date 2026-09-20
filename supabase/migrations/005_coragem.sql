-- Area Coragem: escada do medo (hierarquia de exposicao da TCC).
-- Rode este arquivo inteiro no SQL Editor do Supabase.

create table if not exists public.courage_goals (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  description   text,
  -- Nota de dificuldade de 0 a 10. 0 = ja e normal, a meta final do degrau.
  score         smallint not null default 5 check (score between 0 and 10),
  -- Sub-objetivo: degrau menor dentro de um objetivo maior.
  parent_id     uuid references public.courage_goals (id) on delete set null,
  position      integer not null default 0,
  normalized_at timestamptz,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.courage_attempts (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  goal_id      uuid not null references public.courage_goals (id) on delete cascade,
  -- Nota prevista ANTES de encarar; nota real logo DEPOIS. A diferenca entre
  -- as duas e o dado central desta area: o tamanho do exagero do medo.
  predicted    smallint not null check (predicted between 0 and 10),
  actual       smallint check (actual between 0 and 10),
  feared       text not null default '',
  happened     text not null default '',
  outcome_ok   boolean,
  place        text,
  people       text,
  energy       smallint check (energy between 1 and 5),
  note         text,
  planned_at   timestamptz not null,
  completed_at timestamptz,
  updated_at   timestamptz not null default now()
);

create table if not exists public.courage_score_changes (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  goal_id    uuid not null references public.courage_goals (id) on delete cascade,
  from_score smallint not null check (from_score between 0 and 10),
  to_score   smallint not null check (to_score between 0 and 10),
  reason     text not null default '',
  changed_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists courage_goals_user_updated_idx
  on public.courage_goals (user_id, updated_at);
create index if not exists courage_attempts_goal_idx
  on public.courage_attempts (goal_id, planned_at);
create index if not exists courage_attempts_user_updated_idx
  on public.courage_attempts (user_id, updated_at);
create index if not exists courage_score_changes_goal_idx
  on public.courage_score_changes (goal_id, changed_at);

alter table public.courage_goals         enable row level security;
alter table public.courage_attempts      enable row level security;
alter table public.courage_score_changes enable row level security;

-- Cada linha pertence a uma pessoa e so ela enxerga.
drop policy if exists courage_goals_owner on public.courage_goals;
create policy courage_goals_owner on public.courage_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists courage_attempts_owner on public.courage_attempts;
create policy courage_attempts_owner on public.courage_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists courage_score_changes_owner on public.courage_score_changes;
create policy courage_score_changes_owner on public.courage_score_changes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
