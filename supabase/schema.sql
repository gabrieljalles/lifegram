-- ============================================================================
-- Workout — schema do Supabase
-- Rode este arquivo inteiro no SQL Editor do painel do Supabase.
-- O app e local-first: este banco e a camada de backup e sincronizacao.
-- ============================================================================

-- ---------------------------------------------------------------- tabelas

create table if not exists public.exercises (
  id                   uuid primary key,
  user_id              uuid not null references auth.users (id) on delete cascade,
  name                 text not null,
  muscle_group         text not null default 'outro',
  photo_url            text,
  default_rest_seconds integer not null default 90,
  -- Dupla progressao por faixa: piso e teto de reps que disparam a sugestao
  -- de baixar/subir a carga, e o menor salto de peso executavel no equipamento.
  rep_floor            integer not null default 8,
  rep_ceiling          integer not null default 12,
  -- reps = conta repeticoes; tempo = serie cronometrada (prancha, bicicleta).
  measure              text not null default 'reps' check (measure in ('reps', 'tempo')),
  -- Blocos do exercicio composto: [{label, seconds}, ...]. Vazio = contagem unica.
  segments             jsonb not null default '[]'::jsonb,
  weight_increment     numeric not null default 1,
  notes                text,
  archived             boolean not null default false,
  updated_at           timestamptz not null default now()
);

create table if not exists public.routines (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  position       integer not null default 0,
  -- Dias da semana em que o treino e cobrado (0 = domingo ... 6 = sabado).
  scheduled_days smallint[] not null default '{}',
  archived       boolean not null default false,
  updated_at     timestamptz not null default now()
);

create table if not exists public.routine_exercises (
  id            uuid primary key,
  routine_id    uuid not null references public.routines (id) on delete cascade,
  exercise_id   uuid not null references public.exercises (id) on delete cascade,
  position      integer not null default 0,
  target_sets   integer not null default 3,
  target_reps   integer not null default 10,
  target_weight numeric not null default 0,
  rest_seconds  integer,
  updated_at    timestamptz not null default now()
);

create table if not exists public.sessions (
  id               uuid primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  routine_id       uuid references public.routines (id) on delete set null,
  routine_name     text not null default '',
  started_at       timestamptz not null,
  finished_at      timestamptz,
  total_volume     numeric not null default 0,
  duration_seconds integer not null default 0,
  updated_at       timestamptz not null default now()
);

create table if not exists public.set_logs (
  id                  uuid primary key,
  session_id          uuid not null references public.sessions (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  exercise_id         uuid not null references public.exercises (id) on delete cascade,
  set_number          integer not null,
  reps                integer not null,
  -- Duracao real da serie cronometrada; nulo quando a serie e por repeticao.
  duration_seconds    integer check (duration_seconds is null or duration_seconds >= 0),
  weight              numeric not null,
  completed_at        timestamptz not null,
  rest_taken_seconds  integer not null default 0,
  is_pr_weight        boolean not null default false,
  is_pr_volume        boolean not null default false,
  updated_at          timestamptz not null default now()
);

-- Peso corporal: no maximo um registro por semana no app, mas a tabela
-- aceita qualquer numero de linhas (correcoes tambem sao linhas novas).
create table if not exists public.body_weight_logs (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  weight_kg  numeric not null,
  logged_at  date not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- indices
-- O pull do cliente e sempre "o que mudou depois de X", entao updated_at e o
-- indice que realmente importa.

create index if not exists exercises_user_updated_idx on public.exercises (user_id, updated_at);
create index if not exists routines_user_updated_idx on public.routines (user_id, updated_at);
create index if not exists routine_exercises_routine_idx on public.routine_exercises (routine_id);
create index if not exists routine_exercises_updated_idx on public.routine_exercises (updated_at);
create index if not exists sessions_user_updated_idx on public.sessions (user_id, updated_at);
create index if not exists set_logs_user_updated_idx on public.set_logs (user_id, updated_at);
create index if not exists set_logs_exercise_idx on public.set_logs (exercise_id, completed_at);
create index if not exists set_logs_session_idx on public.set_logs (session_id);
create index if not exists body_weight_logs_user_updated_idx on public.body_weight_logs (user_id, updated_at);

-- -------------------------------------------------------------------- RLS

alter table public.exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.sessions enable row level security;
alter table public.set_logs enable row level security;
alter table public.body_weight_logs enable row level security;

drop policy if exists exercises_owner on public.exercises;
create policy exercises_owner on public.exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists routines_owner on public.routines;
create policy routines_owner on public.routines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sessions_owner on public.sessions;
create policy sessions_owner on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists set_logs_owner on public.set_logs;
create policy set_logs_owner on public.set_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists body_weight_logs_owner on public.body_weight_logs;
create policy body_weight_logs_owner on public.body_weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- routine_exercises nao tem user_id: a dona e a rotina pai.
drop policy if exists routine_exercises_owner on public.routine_exercises;
create policy routine_exercises_owner on public.routine_exercises
  for all using (
    exists (
      select 1 from public.routines r
      where r.id = routine_exercises.routine_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.routines r
      where r.id = routine_exercises.routine_id and r.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------- storage
-- Bucket privado: as fotos so sao acessadas por URL assinada do proprio dono.
-- Convencao de caminho: {user_id}/{exercise_id}.webp

insert into storage.buckets (id, name, public)
values ('exercise-photos', 'exercise-photos', false)
on conflict (id) do nothing;

drop policy if exists exercise_photos_owner on storage.objects;
create policy exercise_photos_owner on storage.objects
  for all
  using (
    bucket_id = 'exercise-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'exercise-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
/* ------------------------------------------------------------- coragem */
-- Escada do medo (hierarquia de exposicao da TCC).

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

-- Cada "nao" tomado. Deliberadamente minimo: registrar tem que caber em um
-- toque, ainda na rua, logo depois do fora.
create table if not exists public.courage_rejections (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  note        text,
  happened_at timestamptz not null,
  updated_at  timestamptz not null default now()
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
create index if not exists courage_rejections_user_updated_idx
  on public.courage_rejections (user_id, updated_at);
create index if not exists courage_attempts_goal_idx
  on public.courage_attempts (goal_id, planned_at);
create index if not exists courage_attempts_user_updated_idx
  on public.courage_attempts (user_id, updated_at);
create index if not exists courage_score_changes_goal_idx
  on public.courage_score_changes (goal_id, changed_at);

alter table public.courage_goals         enable row level security;
alter table public.courage_attempts      enable row level security;
alter table public.courage_rejections enable row level security;
alter table public.courage_score_changes enable row level security;

-- Cada linha pertence a uma pessoa e so ela enxerga.
drop policy if exists courage_goals_owner on public.courage_goals;
create policy courage_goals_owner on public.courage_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists courage_attempts_owner on public.courage_attempts;
create policy courage_attempts_owner on public.courage_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists courage_rejections_owner on public.courage_rejections;
create policy courage_rejections_owner on public.courage_rejections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists courage_score_changes_owner on public.courage_score_changes;
create policy courage_score_changes_owner on public.courage_score_changes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
