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
  -- Dupla progressao: teto de reps que dispara a sugestao de subir a carga,
  -- e o menor salto de peso executavel naquele equipamento.
  rep_ceiling          integer not null default 15,
  weight_increment     numeric not null default 1,
  notes                text,
  archived             boolean not null default false,
  updated_at           timestamptz not null default now()
);

create table if not exists public.routines (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  archived   boolean not null default false,
  updated_at timestamptz not null default now()
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
  weight              numeric not null,
  completed_at        timestamptz not null,
  rest_taken_seconds  integer not null default 0,
  is_pr_weight        boolean not null default false,
  is_pr_volume        boolean not null default false,
  updated_at          timestamptz not null default now()
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

-- -------------------------------------------------------------------- RLS

alter table public.exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.sessions enable row level security;
alter table public.set_logs enable row level security;

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
