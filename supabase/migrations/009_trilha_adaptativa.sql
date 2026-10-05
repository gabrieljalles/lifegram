-- Trilha adaptativa: depois de cada execucao voce diz se foi facil, normal ou
-- dificil. Facil vale por duas execucoes; a primeira marcada como dificil pede
-- uma execucao a mais (nunca passando de 3). Execucao normal so soma em `done`.
alter table public.courage_track_steps
  add column if not exists easy integer not null default 0 check (easy >= 0),
  add column if not exists hard integer not null default 0 check (hard >= 0);

comment on column public.courage_track_steps.easy is
  'Execucoes marcadas como faceis: cada uma conta dobrado.';
comment on column public.courage_track_steps.hard is
  'Execucoes marcadas como dificeis: a primeira acrescenta uma execucao ao nivel.';
