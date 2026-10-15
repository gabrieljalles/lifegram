-- Funil da coragem: a colecao de naos passa a registrar tambem as etapas de
-- baixo (sim, encontro, sexo). Registros antigos eram todos "nao".
alter table public.courage_rejections
  add column if not exists kind text not null default 'nao';

-- Recriada a parte para a migration poder rodar de novo sem erro.
alter table public.courage_rejections
  drop constraint if exists courage_rejections_kind_check;
alter table public.courage_rejections
  add constraint courage_rejections_kind_check
    check (kind in ('nao', 'sim', 'encontro', 'sexo'));

comment on column public.courage_rejections.kind is
  'Etapa do funil: nao (boca), sim, encontro, sexo (fundo).';

-- Onde foi: para descobrir em que lugar voce converte mais.
alter table public.courage_rejections
  add column if not exists context text;

alter table public.courage_rejections
  drop constraint if exists courage_rejections_context_check;
alter table public.courage_rejections
  add constraint courage_rejections_context_check
    check (context is null or context in
      ('rua', 'festa', 'app', 'academia', 'trabalho', 'faculdade', 'outro'));
