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
  -- Etapa do funil: nao (boca), sim, encontro, sexo (fundo).
  kind        text not null default 'nao'
                check (kind in ('nao', 'sim', 'encontro', 'sexo')),
  -- Onde foi: rua, festa, app... Opcional.
  context     text check (context is null or context in
                ('rua', 'festa', 'app', 'academia', 'trabalho', 'faculdade', 'outro')),
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

/* ------------------------------------------------------- trilha da coragem */
create table if not exists public.courage_track_steps (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  track_id     text not null,
  step_id      text not null,
  -- Tentativas totais, inclusive as que nao deram certo.
  attempts     integer not null default 0 check (attempts >= 0),
  -- Tentativas com resultado ok: sao estas que fecham o degrau.
  done         integer not null default 0 check (done >= 0),
  easy         integer not null default 0 check (easy >= 0),
  hard         integer not null default 0 check (hard >= 0),
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
  -- Deslocamento ate o lugar: o aviso cai antes da hora de sair.
  travel_minutes   integer not null default 0 check (travel_minutes >= 0),
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

-- Investimentos: compras de ativos e cotacoes informadas a mao.
create table if not exists public.investment_buys (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Nome normalizado do ativo (maiusculo): PETR4, TESOURO SELIC 2029.
  asset      text not null,
  quantity   numeric not null check (quantity > 0),
  -- Preco medio pago por unidade nesta compra.
  price      numeric not null check (price > 0),
  bought_on  date not null,
  -- Tipo do ativo: decide o imposto.
  kind       text check (kind in ('acao', 'fii', 'etf', 'bdr', 'renda_fixa')),
  -- Remocao marcada (e nao apagada) para chegar aos outros aparelhos.
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investment_buys_user_updated_idx
  on public.investment_buys (user_id, updated_at);

alter table public.investment_buys enable row level security;

drop policy if exists investment_buys_owner on public.investment_buys;
create policy investment_buys_owner on public.investment_buys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Uma cotacao por ativo por dia, informada a mao.
create table if not exists public.investment_quotes (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  asset      text not null,
  price      numeric not null check (price > 0),
  quoted_on  date not null,
  updated_at timestamptz not null default now()
);

create index if not exists investment_quotes_user_updated_idx
  on public.investment_quotes (user_id, updated_at);

alter table public.investment_quotes enable row level security;

drop policy if exists investment_quotes_owner on public.investment_quotes;
create policy investment_quotes_owner on public.investment_quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Vendas de ativos.

create table if not exists public.investment_sales (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  asset      text not null,
  quantity   numeric not null check (quantity > 0),
  -- Preco por unidade na venda.
  price      numeric not null check (price > 0),
  sold_on    date not null,
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investment_sales_user_updated_idx
  on public.investment_sales (user_id, updated_at);

alter table public.investment_sales enable row level security;

drop policy if exists investment_sales_owner on public.investment_sales;
create policy investment_sales_owner on public.investment_sales
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Frases que te marcaram (aba Coragem), mostradas no topo da tela Hoje.

create table if not exists public.motivation_phrases (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  author     text,
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists motivation_phrases_user_updated_idx
  on public.motivation_phrases (user_id, updated_at);

alter table public.motivation_phrases enable row level security;

drop policy if exists motivation_phrases_owner on public.motivation_phrases;
create policy motivation_phrases_owner on public.motivation_phrases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Widget de frases no Android: o app do widget nao faz login. Ele guarda um
-- codigo gerado na tela "Minhas frases" e so consegue LER as suas frases com
-- ele, por meio da funcao widget_phrases. No banco fica apenas o hash (sha256)
-- do codigo; gerar um novo invalida o anterior.

create table if not exists public.widget_tokens (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.widget_tokens enable row level security;

drop policy if exists widget_tokens_owner on public.widget_tokens;
create policy widget_tokens_owner on public.widget_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.widget_phrases(p_token text)
returns table (id uuid, text text, author text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.text, p.author
  from public.motivation_phrases p
  join public.widget_tokens w on w.user_id = p.user_id
  where w.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and not p.deleted
  order by p.created_at desc;
$$;

revoke all on function public.widget_phrases(text) from public;
grant execute on function public.widget_phrases(text) to anon, authenticated;

-- 017: tipo e dose dos itens, check-in da noite
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

-- 018_grupos_de_treino

create table if not exists public.routine_groups (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  scheduled_days smallint[] not null default '{}',
  position       integer not null default 0,
  archived       boolean not null default false,
  updated_at     timestamptz not null default now()
);

create index if not exists routine_groups_user_updated_idx
  on public.routine_groups (user_id, updated_at);

alter table public.routine_groups enable row level security;

drop policy if exists routine_groups_owner on public.routine_groups;
create policy routine_groups_owner on public.routine_groups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Sem chave estrangeira de proposito: o treino pode subir antes do grupo.
alter table public.routines add column if not exists group_id uuid;
