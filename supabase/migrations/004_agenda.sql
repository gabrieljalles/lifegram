-- Agenda semanal: cada treino pode ser cobrado em dias fixos da semana.
-- 0 = domingo ... 6 = sabado (mesmo padrao de Date.getDay no cliente).
-- Lista vazia = treino sem dia marcado: disponivel sempre, nunca cobra.
alter table public.routines
  add column if not exists scheduled_days smallint[] not null default '{}';

-- Os dias de descanso ficam apenas no aparelho (IndexedDB) e viajam no backup
-- JSON: sao preferencia de uso, nao dado de treino.
