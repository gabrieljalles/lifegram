-- Exercicios medidos em tempo (prancha, isometria) e exercicios compostos
-- (intervalados, como a bicicleta com tiros).
--
-- `measure` diz o que a tela do treino pergunta: repeticoes ou cronometro.
-- `segments` guarda os blocos do composto, na ordem, como
--   [{"label": "Tiro forte", "seconds": 20}, {"label": "Solto", "seconds": 120}]
-- Lista vazia = exercicio de tempo simples, uma contagem so.
alter table public.exercises
  add column if not exists measure  text  not null default 'reps'
    check (measure in ('reps', 'tempo')),
  add column if not exists segments jsonb not null default '[]'::jsonb;

-- Segundos efetivamente cronometrados na serie. Fica nulo nos exercicios por
-- repeticao: e o que separa "12 reps" de "40 segundos" sem sobrecarregar reps.
alter table public.set_logs
  add column if not exists duration_seconds integer
    check (duration_seconds is null or duration_seconds >= 0);

comment on column public.exercises.measure is
  'reps = conta repeticoes; tempo = serie cronometrada.';
comment on column public.exercises.segments is
  'Blocos do exercicio composto: [{label, seconds}, ...]. Vazio = contagem unica.';
comment on column public.set_logs.duration_seconds is
  'Duracao real da serie cronometrada, em segundos. Nulo quando a serie e por repeticao.';
