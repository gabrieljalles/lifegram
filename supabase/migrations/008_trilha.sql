-- Mapa da Coragem: progresso nas trilhas prontas (ex.: "Carisma e flerte").
--
-- O conteudo da trilha vive no codigo do app; aqui fica so o progresso de cada
-- degrau tocado — tentativas, quantas deram certo e quando fechou.
create table if not exists public.courage_track_steps (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  track_id     text not null,
  step_id      text not null,
  -- Tentativas totais, inclusive as que nao deram certo.
  attempts     integer not null default 0 check (attempts >= 0),
  -- Tentativas com resultado ok: sao estas que fecham o degrau.
  done         integer not null default 0 check (done >= 0),
  completed_at timestamptz,
  -- "Isso ja e normal para mim": fechado sem ter sido treinado na trilha.
  skipped_at   timestamptz,
  updated_at   timestamptz not null default now()
);

create index if not exists courage_track_steps_user_updated_idx
  on public.courage_track_steps (user_id, updated_at);
create index if not exists courage_track_steps_step_idx
  on public.courage_track_steps (user_id, track_id, step_id);

alter table public.courage_track_steps enable row level security;

drop policy if exists courage_track_steps_owner on public.courage_track_steps;
create policy courage_track_steps_owner on public.courage_track_steps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
