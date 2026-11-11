-- Tarefas com subtarefas e prazo. So acrescenta colunas em activities.

alter table public.activities add column if not exists deadline date;
alter table public.activities add column if not exists subtasks jsonb not null default '[]'::jsonb;
alter table public.activities add column if not exists completed_at timestamptz;
