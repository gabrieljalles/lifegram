-- Vendas de ativos e tipo do ativo em cada compra (decide o imposto).
alter table public.investment_buys
  add column if not exists kind text
  check (kind in ('acao', 'fii', 'etf', 'bdr', 'renda_fixa'));

create table if not exists public.investment_sales (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  asset      text not null,
  quantity   numeric not null check (quantity > 0),
  -- Preco por unidade na venda.
  price      numeric not null check (price > 0),
  sold_on    date not null,
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investment_sales_user_updated_idx
  on public.investment_sales (user_id, updated_at);

alter table public.investment_sales enable row level security;

drop policy if exists investment_sales_owner on public.investment_sales;
create policy investment_sales_owner on public.investment_sales
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
