-- O teto padrao de repeticoes antes de subir a carga caiu de 15 para 12.
--
-- Duas coisas separadas aqui: o default da coluna (vale para linhas novas) e
-- as linhas que ficaram no valor antigo. Exercicios com teto escolhido a mao
-- (qualquer valor diferente de 15) nao sao tocados.
alter table public.exercises
  alter column rep_ceiling set default 12;

update public.exercises
  set rep_ceiling = 12,
      updated_at = now()
  where rep_ceiling = 15;

comment on column public.exercises.rep_ceiling is
  'Teto da faixa de repeticoes: bater nele em todas as series sugere subir a carga (padrao 12).';
