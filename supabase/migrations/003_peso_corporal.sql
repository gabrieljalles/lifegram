-- ============================================================================
-- Migracao 003 — peso corporal semanal
--
-- Rode este arquivo se voce JA tinha executado o schema.sql antes desta
-- funcionalidade existir. Em instalacoes novas o schema.sql ja traz a tabela
-- e esta migracao nao e necessaria (mas rodar de novo nao quebra).
-- ============================================================================

create table if not exists public.body_weight_logs (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  weight_kg  numeric not null,
  logged_at  date not null,
  updated_at timestamptz not null default now()
);

create index if not exists body_weight_logs_user_updated_idx
  on public.body_weight_logs (user_id, updated_at);

alter table public.body_weight_logs enable row level security;

drop policy if exists body_weight_logs_owner on public.body_weight_logs;
create policy body_weight_logs_owner on public.body_weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
