-- Frases que te marcaram (aba Coragem), mostradas no topo da tela Hoje.

create table if not exists public.motivation_phrases (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  author     text,
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists motivation_phrases_user_updated_idx
  on public.motivation_phrases (user_id, updated_at);

alter table public.motivation_phrases enable row level security;

drop policy if exists motivation_phrases_owner on public.motivation_phrases;
create policy motivation_phrases_owner on public.motivation_phrases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
