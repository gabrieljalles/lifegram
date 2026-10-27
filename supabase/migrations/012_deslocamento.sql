-- Deslocamento ate o lugar da atividade: o aviso cai antes da hora de sair.
alter table public.activities
  add column if not exists travel_minutes integer not null default 0
  check (travel_minutes >= 0);
