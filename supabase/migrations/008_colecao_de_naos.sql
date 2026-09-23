-- ============================================================================
-- Migracao 008 — colecao de naos
--
-- Rode este arquivo se voce JA tinha executado o schema.sql antes desta
-- funcionalidade existir. Em instalacoes novas o schema.sql ja traz a tabela
-- e esta migracao nao e necessaria (mas rodar de novo nao quebra).
-- ============================================================================

create table if not exists public.courage_rejections (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  note        text,
  happened_at timestamptz not null,
  updated_at  timestamptz not null default now()
);

create index if not exists courage_rejections_user_updated_idx
  on public.courage_rejections (user_id, updated_at);

alter table public.courage_rejections enable row level security;

drop policy if exists courage_rejections_owner on public.courage_rejections;
create policy courage_rejections_owner on public.courage_rejections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.courage_rejections is
  'Cada "nao" tomado. Contar o nao em vez do sim mede a acao, que e a parte que depende de voce.';
