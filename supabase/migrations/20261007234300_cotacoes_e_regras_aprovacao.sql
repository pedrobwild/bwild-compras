-- 2) Cotações por solicitação (aba Cotações)
create table if not exists public.cotacoes (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  fornecedor text not null check (char_length(trim(fornecedor)) between 1 and 150),
  fornecedor_contato text,
  valor_total numeric(14,2) check (valor_total is null or valor_total >= 0),
  prazo_entrega_dias integer check (prazo_entrega_dias is null or prazo_entrega_dias >= 0),
  condicao_pagamento text,
  validade date,
  comentario text,
  escolhida boolean not null default false,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cotacoes_solicitacao_idx on public.cotacoes (solicitacao_id);
create unique index if not exists cotacoes_uma_escolhida on public.cotacoes (solicitacao_id) where escolhida;
alter table public.cotacoes enable row level security;
drop policy if exists "logados veem cotacoes" on public.cotacoes;
create policy "logados veem cotacoes" on public.cotacoes for select to authenticated using (true);
drop policy if exists "compras grava cotacoes" on public.cotacoes;
create policy "compras grava cotacoes" on public.cotacoes for all to authenticated
  using (public.is_compras(auth.uid())) with check (public.is_compras(auth.uid()));
drop trigger if exists cotacoes_touch on public.cotacoes;
create trigger cotacoes_touch before update on public.cotacoes
  for each row execute function public.touch_updated_at();

-- Histórico: fornecedor escolhido
create or replace function public.log_cotacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.escolhida and (tg_op = 'INSERT' or not old.escolhida) then
    insert into public.solicitacao_eventos (solicitacao_id, tipo, descricao, usuario_id)
    values (new.solicitacao_id, 'comentario',
            'Fornecedor escolhido na cotação: ' || new.fornecedor
            || coalesce(' — ' || public.brl(new.valor_total), ''), auth.uid());
  end if;
  return null;
end; $$;
drop trigger if exists cotacoes_log on public.cotacoes;
create trigger cotacoes_log after insert or update of escolhida on public.cotacoes
  for each row execute function public.log_cotacao();

do $$ begin
  alter publication supabase_realtime add table public.cotacoes;
exception when duplicate_object then null; end $$;

-- 3) Etapas de aprovação: rótulos, regra no banco e volta correta quando compra é excluída
create or replace function public.label_status(s public.status_solicitacao)
returns text language sql immutable set search_path = public as $$
  select case s
    when 'nova' then 'Nova'
    when 'em_cotacao' then 'Em cotação'
    when 'aguardando_aprovacao' then 'Aprovação'
    when 'aprovada' then 'Aprovado'
    when 'comprada' then 'Comprada'
    when 'entregue_parcial' then 'Entregue parcialmente'
    when 'entregue' then 'Entregue'
    when 'cancelada' then 'Cancelada'
  end $$;

-- Só admin aprova ou tira uma solicitação da etapa Aprovação
create or replace function public.guard_aprovacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
     and (new.status = 'aprovada' or old.status = 'aguardando_aprovacao')
     and auth.uid() is not null
     and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Somente o admin pode aprovar ou tirar uma solicitação da etapa Aprovação.';
  end if;
  return new;
end; $$;
drop trigger if exists solicitacoes_guard_aprovacao on public.solicitacoes;
create trigger solicitacoes_guard_aprovacao before update of status on public.solicitacoes
  for each row execute function public.guard_aprovacao();

create or replace function public.sync_status_compras()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_sol uuid := coalesce(new.solicitacao_id, old.solicitacao_id);
  v_total int; v_entregues int; v_status public.status_solicitacao;
begin
  select status into v_status from public.solicitacoes where id = v_sol;
  if v_status is null or v_status = 'cancelada' then return null; end if;
  select count(*), count(data_entrega_real) into v_total, v_entregues from public.compras where solicitacao_id = v_sol;
  if tg_op = 'INSERT' then
    insert into public.solicitacao_eventos (solicitacao_id, tipo, descricao, usuario_id)
    values (v_sol, 'compra', 'Compra registrada: ' || new.fornecedor || ' — ' || public.brl(new.valor_total)
            || coalesce(' — previsão ' || to_char(new.previsao_entrega, 'DD/MM/YYYY'), '')
            || ' — entrega: ' || new.local_entrega, new.registrado_por);
  elsif tg_op = 'UPDATE' and new.data_entrega_real is not null and old.data_entrega_real is null then
    insert into public.solicitacao_eventos (solicitacao_id, tipo, descricao)
    values (v_sol, 'entrega', 'Entrega recebida de ' || new.fornecedor || ' em '
            || to_char(new.data_entrega_real, 'DD/MM/YYYY') || coalesce(' por ' || new.recebido_por, ''));
  end if;
  update public.solicitacoes set status =
    case
      when v_total = 0 then (case when status in ('comprada','entregue','entregue_parcial') then 'aprovada'::public.status_solicitacao else status end)
      when v_entregues = 0 then 'comprada'
      when v_entregues < v_total then 'entregue_parcial'
      else 'entregue'
    end
  where id = v_sol and status is distinct from (
    case
      when v_total = 0 then (case when status in ('comprada','entregue','entregue_parcial') then 'aprovada'::public.status_solicitacao else status end)
      when v_entregues = 0 then 'comprada'
      when v_entregues < v_total then 'entregue_parcial'
      else 'entregue'
    end);
  return null;
end; $function$;

-- Ajuste final: estorno de compra volta para Aprovado; mensagem clara para compra antes da aprovação
create or replace function public.guard_aprovacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
     and ((new.status = 'aprovada' and old.status not in ('comprada','entregue_parcial','entregue'))
          or old.status = 'aguardando_aprovacao')
     and auth.uid() is not null
     and not public.has_role(auth.uid(), 'admin') then
    if new.status in ('comprada','entregue_parcial','entregue') then
      raise exception 'A compra só pode ser registrada depois que o admin aprovar a solicitação.';
    end if;
    raise exception 'Somente o admin pode aprovar ou tirar uma solicitação da etapa Aprovação.';
  end if;
  return new;
end; $$;

revoke execute on function public.guard_aprovacao() from public, anon, authenticated;
revoke execute on function public.log_cotacao() from public, anon, authenticated;
