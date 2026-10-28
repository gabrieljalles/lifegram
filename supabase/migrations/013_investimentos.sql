-- Investimentos: compras de ativos e cotacoes informadas a mao.
create table if not exists public.investment_buys (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Nome normalizado do ativo (maiusculo): PETR4, TESOURO SELIC 2029.
  asset      text not null,
  quantity   numeric not null check (quantity > 0),
  -- Preco medio pago por unidade nesta compra.
  price      numeric not null check (price > 0),
  bought_on  date not null,
  -- Remocao marcada (e nao apagada) para chegar aos outros aparelhos.
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investment_buys_user_updated_idx
  on public.investment_buys (user_id, updated_at);

alter table public.investment_buys enable row level security;

drop policy if exists investment_buys_owner on public.investment_buys;
create policy investment_buys_owner on public.investment_buys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Uma cotacao por ativo por dia, informada a mao.
create table if not exists public.investment_quotes (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  asset      text not null,
  price      numeric not null check (price > 0),
  quoted_on  date not null,
  updated_at timestamptz not null default now()
);

create index if not exists investment_quotes_user_updated_idx
  on public.investment_quotes (user_id, updated_at);

alter table public.investment_quotes enable row level security;

drop policy if exists investment_quotes_owner on public.investment_quotes;
create policy investment_quotes_owner on public.investment_quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
