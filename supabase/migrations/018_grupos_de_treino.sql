-- Grupos de treino (Academia, Corrida, Abdominal): treinos que se revezam,
-- um recomendado por grupo nos dias do grupo.
-- So acrescenta: nenhuma tabela ou coluna existente e apagada ou alterada.

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
