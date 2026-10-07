-- =========================================================
-- Sistema de Solicitação de Compras - Bwild
-- =========================================================

-- Papéis
create type public.app_role as enum ('solicitante', 'compras', 'admin');

create type public.status_solicitacao as enum (
  'nova', 'em_cotacao', 'comprada', 'entregue_parcial', 'entregue', 'cancelada'
);

create type public.prioridade_solicitacao as enum ('baixa', 'normal', 'urgente');

-- Perfis
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text not null,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_compras(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles
                 where user_id = _user_id and role in ('compras', 'admin'))
$$;

-- Cria perfil + papel ao cadastrar
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email);

  insert into public.user_roles (user_id, role) values (new.id, 'solicitante');

  if lower(new.email) = 'pedro@bewild.com.br' then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Solicitações
create table public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  codigo text generated always as ('SC-' || lpad(numero::text, 4, '0')) stored,
  cliente text not null,
  empreendimento text,
  unidade text,
  endereco_obra text,
  titulo text not null,
  descricao text,
  prioridade public.prioridade_solicitacao not null default 'normal',
  data_necessaria date,
  status public.status_solicitacao not null default 'nova',
  solicitante_id uuid not null default auth.uid() references auth.users(id),
  responsavel_compras_id uuid references auth.users(id),
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index solicitacoes_numero_idx on public.solicitacoes(numero);
create index solicitacoes_status_idx on public.solicitacoes(status);

-- Itens da solicitação
create table public.solicitacao_itens (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  descricao text not null,
  quantidade numeric(12,2) not null default 1,
  unidade text not null default 'un',
  ambiente text,
  referencia_projeto text,   -- ex.: "Folha 09 - Marcenaria cozinha"
  observacao text,
  created_at timestamptz not null default now()
);
create index solicitacao_itens_sol_idx on public.solicitacao_itens(solicitacao_id);

-- Anexos (projeto executivo etc.)
create table public.solicitacao_anexos (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  nome_arquivo text not null,
  storage_path text not null,
  tamanho_bytes bigint,
  tipo_mime text,
  enviado_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index solicitacao_anexos_sol_idx on public.solicitacao_anexos(solicitacao_id);

-- Compras registradas (uma solicitação pode ter várias compras/fornecedores)
create table public.compras (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  fornecedor text not null,
  fornecedor_contato text,
  descricao_itens text,
  valor_total numeric(12,2) not null check (valor_total >= 0),
  forma_pagamento text,
  numero_pedido text,
  data_compra date not null default current_date,
  previsao_entrega date,
  local_entrega text not null default 'Obra',  -- Obra | Depósito Bwild | Retirada no fornecedor | Outro
  endereco_entrega text,
  data_entrega_real date,
  recebido_por text,
  observacao text,
  registrado_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index compras_sol_idx on public.compras(solicitacao_id);

-- Histórico / linha do tempo
create table public.solicitacao_eventos (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  tipo text not null,
  descricao text not null,
  usuario_id uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index solicitacao_eventos_sol_idx on public.solicitacao_eventos(solicitacao_id);

-- =========================================================
-- Triggers de negócio
-- =========================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger solicitacoes_touch before update on public.solicitacoes
  for each row execute function public.touch_updated_at();
create trigger compras_touch before update on public.compras
  for each row execute function public.touch_updated_at();

create or replace function public.label_status(s public.status_solicitacao)
returns text language sql immutable set search_path = public as $$
  select case s
    when 'nova' then 'Nova'
    when 'em_cotacao' then 'Em cotação'
    when 'comprada' then 'Comprada'
    when 'entregue_parcial' then 'Entregue parcialmente'
    when 'entregue' then 'Entregue'
    when 'cancelada' then 'Cancelada'
  end $$;

-- Evento ao criar e ao mudar status
create or replace function public.log_solicitacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.solicitacao_eventos (solicitacao_id, tipo, descricao, usuario_id)
    values (new.id, 'criada', 'Solicitação criada', new.solicitante_id);
  elsif new.status is distinct from old.status then
    insert into public.solicitacao_eventos (solicitacao_id, tipo, descricao)
    values (new.id, 'status',
            'Status alterado de ' || public.label_status(old.status) || ' para ' || public.label_status(new.status)
            || case when new.status = 'cancelada' and new.motivo_cancelamento is not null
                    then ' — motivo: ' || new.motivo_cancelamento else '' end);
  end if;
  return new;
end; $$;

create trigger solicitacoes_log after insert or update on public.solicitacoes
  for each row execute function public.log_solicitacao();

-- Status automático conforme compras/entregas
create or replace function public.sync_status_compras()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sol uuid := coalesce(new.solicitacao_id, old.solicitacao_id);
  v_total int; v_entregues int; v_status public.status_solicitacao;
begin
  select status into v_status from public.solicitacoes where id = v_sol;
  if v_status = 'cancelada' then return null; end if;

  select count(*), count(data_entrega_real) into v_total, v_entregues
  from public.compras where solicitacao_id = v_sol;

  if tg_op = 'INSERT' then
    insert into public.solicitacao_eventos (solicitacao_id, tipo, descricao, usuario_id)
    values (v_sol, 'compra', 'Compra registrada: ' || new.fornecedor || ' — R$ '
            || to_char(new.valor_total, 'FM999G999G990D00')
            || coalesce(' — previsão ' || to_char(new.previsao_entrega, 'DD/MM/YYYY'), ''), new.registrado_por);
  elsif tg_op = 'UPDATE' and new.data_entrega_real is not null and old.data_entrega_real is null then
    insert into public.solicitacao_eventos (solicitacao_id, tipo, descricao)
    values (v_sol, 'entrega', 'Entrega recebida de ' || new.fornecedor || ' em '
            || to_char(new.data_entrega_real, 'DD/MM/YYYY') || coalesce(' por ' || new.recebido_por, ''));
  end if;

  update public.solicitacoes set status =
    case
      when v_total = 0 then (case when status in ('comprada','entregue','entregue_parcial') then 'em_cotacao'::public.status_solicitacao else status end)
      when v_entregues = 0 then 'comprada'
      when v_entregues < v_total then 'entregue_parcial'
      else 'entregue'
    end
  where id = v_sol;
  return null;
end; $$;

create trigger compras_sync after insert or update or delete on public.compras
  for each row execute function public.sync_status_compras();

-- =========================================================
-- View do painel (todos visualizam)
-- =========================================================
create or replace view public.painel_solicitacoes
with (security_invoker = on) as
select
  s.id, s.codigo, s.numero, s.cliente, s.empreendimento, s.unidade, s.titulo,
  s.prioridade, s.data_necessaria, s.status, s.created_at, s.updated_at,
  s.solicitante_id, ps.nome as solicitante_nome,
  s.responsavel_compras_id, pr.nome as responsavel_nome,
  (select count(*) from public.solicitacao_itens i where i.solicitacao_id = s.id) as qtd_itens,
  (select count(*) from public.solicitacao_anexos a where a.solicitacao_id = s.id) as qtd_anexos,
  coalesce((select sum(c.valor_total) from public.compras c where c.solicitacao_id = s.id), 0) as custo_total,
  (select string_agg(distinct c.fornecedor, ', ') from public.compras c where c.solicitacao_id = s.id) as fornecedores,
  (select min(c.previsao_entrega) from public.compras c where c.solicitacao_id = s.id and c.data_entrega_real is null) as proxima_entrega,
  (select string_agg(distinct c.local_entrega, ', ') from public.compras c where c.solicitacao_id = s.id) as locais_entrega,
  (s.data_necessaria is not null and s.data_necessaria < current_date
     and s.status not in ('entregue','cancelada')) as atrasada
from public.solicitacoes s
left join public.profiles ps on ps.id = s.solicitante_id
left join public.profiles pr on pr.id = s.responsavel_compras_id;

-- =========================================================
-- RLS
-- =========================================================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.solicitacoes enable row level security;
alter table public.solicitacao_itens enable row level security;
alter table public.solicitacao_anexos enable row level security;
alter table public.compras enable row level security;
alter table public.solicitacao_eventos enable row level security;

-- profiles
create policy "perfis visiveis a logados" on public.profiles for select to authenticated using (true);
create policy "usuario edita proprio perfil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- user_roles
create policy "papeis visiveis a logados" on public.user_roles for select to authenticated using (true);
create policy "admin gerencia papeis" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- solicitacoes
create policy "todos logados veem solicitacoes" on public.solicitacoes for select to authenticated using (true);
create policy "logado cria solicitacao" on public.solicitacoes for insert to authenticated
  with check (solicitante_id = auth.uid());
create policy "compras atualiza solicitacao" on public.solicitacoes for update to authenticated
  using (public.is_compras(auth.uid())) with check (public.is_compras(auth.uid()));
create policy "solicitante edita enquanto nova" on public.solicitacoes for update to authenticated
  using (solicitante_id = auth.uid() and status = 'nova')
  with check (solicitante_id = auth.uid() and status in ('nova','cancelada'));
create policy "admin exclui solicitacao" on public.solicitacoes for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- itens
create policy "todos logados veem itens" on public.solicitacao_itens for select to authenticated using (true);
create policy "dono ou compras gerencia itens" on public.solicitacao_itens for all to authenticated
  using (public.is_compras(auth.uid()) or exists (
    select 1 from public.solicitacoes s where s.id = solicitacao_id and s.solicitante_id = auth.uid() and s.status = 'nova'))
  with check (public.is_compras(auth.uid()) or exists (
    select 1 from public.solicitacoes s where s.id = solicitacao_id and s.solicitante_id = auth.uid() and s.status = 'nova'));

-- anexos
create policy "todos logados veem anexos" on public.solicitacao_anexos for select to authenticated using (true);
create policy "logado anexa" on public.solicitacao_anexos for insert to authenticated
  with check (enviado_por = auth.uid());
create policy "autor ou compras remove anexo" on public.solicitacao_anexos for delete to authenticated
  using (enviado_por = auth.uid() or public.is_compras(auth.uid()));

-- compras
create policy "todos logados veem compras" on public.compras for select to authenticated using (true);
create policy "compras registra compra" on public.compras for insert to authenticated
  with check (public.is_compras(auth.uid()));
create policy "compras atualiza compra" on public.compras for update to authenticated
  using (public.is_compras(auth.uid())) with check (public.is_compras(auth.uid()));
create policy "compras exclui compra" on public.compras for delete to authenticated
  using (public.is_compras(auth.uid()));

-- eventos
create policy "todos logados veem eventos" on public.solicitacao_eventos for select to authenticated using (true);
create policy "logado comenta" on public.solicitacao_eventos for insert to authenticated
  with check (usuario_id = auth.uid() and tipo = 'comentario');

-- =========================================================
-- Storage: projetos executivos (privado, 50 MB, PDF/imagens/DWG)
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('projetos-executivos', 'projetos-executivos', false, 52428800)
on conflict (id) do nothing;

create policy "logados leem projetos" on storage.objects for select to authenticated
  using (bucket_id = 'projetos-executivos');
create policy "logados enviam projetos" on storage.objects for insert to authenticated
  with check (bucket_id = 'projetos-executivos');
create policy "dono ou compras apaga projeto" on storage.objects for delete to authenticated
  using (bucket_id = 'projetos-executivos' and (owner = auth.uid() or public.is_compras(auth.uid())));

-- Realtime para o painel atualizar sozinho
alter publication supabase_realtime add table public.solicitacoes, public.compras, public.solicitacao_eventos;
