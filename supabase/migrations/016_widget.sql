-- Widget de frases no Android: o app do widget nao faz login. Ele guarda um
-- codigo gerado na tela "Minhas frases" e so consegue LER as suas frases com
-- ele, por meio da funcao widget_phrases. No banco fica apenas o hash (sha256)
-- do codigo; gerar um novo invalida o anterior.

create table if not exists public.widget_tokens (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.widget_tokens enable row level security;

drop policy if exists widget_tokens_owner on public.widget_tokens;
create policy widget_tokens_owner on public.widget_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.widget_phrases(p_token text)
returns table (id uuid, text text, author text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.text, p.author
  from public.motivation_phrases p
  join public.widget_tokens w on w.user_id = p.user_id
  where w.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and not p.deleted
  order by p.created_at desc;
$$;

revoke all on function public.widget_phrases(text) from public;
grant execute on function public.widget_phrases(text) to anon, authenticated;
