-- ============================================================================
-- Migracao 002 — dupla progressao por faixa de reps
--
-- Rode este arquivo se voce JA tinha executado o schema.sql antes desta
-- funcionalidade existir. Em instalacoes novas o schema.sql ja traz a coluna
-- e esta migracao nao e necessaria (mas rodar de novo nao quebra).
-- ============================================================================

alter table public.exercises
  add column if not exists rep_floor integer not null default 8;

-- Backfill para exercicios ja cadastrados: abre uma faixa de 6 reps abaixo do
-- teto que ja existia, nunca menor que 1.
update public.exercises
  set rep_floor = greatest(rep_ceiling - 6, 1)
  where rep_floor = 8;

comment on column public.exercises.rep_floor is
  'Piso da faixa de reps: cair abaixo dele em qualquer serie sugere baixar a carga.';
