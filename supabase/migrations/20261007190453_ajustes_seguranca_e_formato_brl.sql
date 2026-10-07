create or replace function public.brl(v numeric) returns text language sql immutable set search_path = public as $$
  select 'R$ ' || replace(replace(replace(to_char(v, 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.') $$;

create or replace function public.sync_status_compras()
returns trigger language plpgsql security definer set search_path = public as $fn$
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
      when v_total = 0 then (case when status in ('comprada','entregue','entregue_parcial') then 'em_cotacao'::public.status_solicitacao else status end)
      when v_entregues = 0 then 'comprada'
      when v_entregues < v_total then 'entregue_parcial'
      else 'entregue'
    end
  where id = v_sol;
  return null;
end; $fn$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_solicitacao() from public, anon, authenticated;
revoke execute on function public.sync_status_compras() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_compras(uuid) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_compras(uuid) to authenticated;
