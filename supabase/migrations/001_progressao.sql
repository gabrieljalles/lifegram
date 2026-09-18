-- ============================================================================
-- Migracao 001 — dupla progressao
--
-- Rode este arquivo se voce JA tinha executado o schema.sql antes desta
-- funcionalidade existir. Em instalacoes novas o schema.sql ja traz as
-- colunas e esta migracao nao e necessaria (mas rodar de novo nao quebra).
-- ============================================================================

alter table public.exercises
  add column if not exists rep_ceiling integer not null default 15;

alter table public.exercises
  add column if not exists weight_increment numeric not null default 1;

comment on column public.exercises.rep_ceiling is
  'Teto de repeticoes: ao bater em todas as series, o app sugere subir a carga.';
comment on column public.exercises.weight_increment is
  'Menor salto de carga executavel no equipamento daquele exercicio.';
