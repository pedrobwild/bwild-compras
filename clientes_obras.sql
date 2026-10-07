-- Bwild Compras — cadastro de clientes e obras
-- Rode este script UMA VEZ no SQL Editor do Supabase (projeto wrpqayrqaiekdycknhsp).

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  contato text,
  telefone text,
  email text,
  observacao text,
  created_at timestamptz not null default now()
);

create table if not exists public.obras (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  empreendimento text not null,
  unidade text,
  endereco text,
  created_at timestamptz not null default now()
);

create index if not exists obras_cliente_id_idx on public.obras (cliente_id);

alter table public.clientes enable row level security;
alter table public.obras enable row level security;

-- Leitura: qualquer usuário logado
create policy "clientes_select_logado" on public.clientes
  for select to authenticated using (true);

create policy "obras_select_logado" on public.obras
  for select to authenticated using (true);

-- Escrita: somente compras/admin
create policy "clientes_write_compras" on public.clientes
  for all to authenticated
  using (public.is_compras(auth.uid()))
  with check (public.is_compras(auth.uid()));

create policy "obras_write_compras" on public.obras
  for all to authenticated
  using (public.is_compras(auth.uid()))
  with check (public.is_compras(auth.uid()));
