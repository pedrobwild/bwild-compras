-- 1) Cadastro unificado de clientes/obras (tela Clientes / obras)
create table if not exists public.clientes_obras (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) between 2 and 120),
  empreendimento text,
  unidade text,
  endereco text,
  contato text,
  telefone text,
  email text,
  observacao text,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clientes_obras_nome_idx on public.clientes_obras (lower(nome));
alter table public.clientes_obras enable row level security;
drop policy if exists "logados veem clientes_obras" on public.clientes_obras;
create policy "logados veem clientes_obras" on public.clientes_obras for select to authenticated using (true);
drop policy if exists "compras grava clientes_obras" on public.clientes_obras;
create policy "compras grava clientes_obras" on public.clientes_obras for all to authenticated
  using (public.is_compras(auth.uid())) with check (public.is_compras(auth.uid()));
drop trigger if exists clientes_obras_touch on public.clientes_obras;
create trigger clientes_obras_touch before update on public.clientes_obras
  for each row execute function public.touch_updated_at();
