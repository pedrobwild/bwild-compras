-- Marcação de atraso e contagem automática de dias (calculado a cada consulta, fuso de São Paulo).
-- Três prazos:
--   compra  = prazo_compra vencido e a compra ainda não foi registrada (Nova .. Aprovado)
--   entrega = compra registrada, sem entrega e previsão do fornecedor vencida
--   chegada = data necessária na obra vencida e o item ainda não foi entregue

create or replace function public.hoje_sp()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Dias de atraso de uma compra (fornecedor): em aberto = hoje - previsão; entregue = entrega real - previsão
create or replace function public.dias_atraso_entrega(c public.compras)
returns integer language sql stable set search_path = public as $$
  select case
    when c.previsao_entrega is null then null
    when c.data_entrega_real is null and c.previsao_entrega < public.hoje_sp() then public.hoje_sp() - c.previsao_entrega
    when c.data_entrega_real is not null and c.data_entrega_real > c.previsao_entrega then c.data_entrega_real - c.previsao_entrega
    else 0 end
$$;

create or replace view public.painel_solicitacoes with (security_invoker = true) as
with base as (
  select s.*,
    public.hoje_sp() as hoje,
    (select max(public.hoje_sp() - c.previsao_entrega) from public.compras c
      where c.solicitacao_id = s.id and c.data_entrega_real is null and c.previsao_entrega < public.hoje_sp()) as atraso_entrega_aberta
  from public.solicitacoes s
), calc as (
  select b.*,
    case when b.status in ('nova','cronograma_confirmado','em_cotacao','aguardando_aprovacao','aprovada')
              and b.prazo_compra < b.hoje then b.hoje - b.prazo_compra end as d_compra,
    case when b.status not in ('entregue','cancelada') then b.atraso_entrega_aberta end as d_entrega,
    case when b.status not in ('entregue','cancelada') and b.data_necessaria < b.hoje then b.hoje - b.data_necessaria end as d_chegada,
    case when b.status in ('entregue','cancelada') then null else
      least(
        case when b.status in ('nova','cronograma_confirmado','em_cotacao','aguardando_aprovacao','aprovada') and b.prazo_compra >= b.hoje then b.prazo_compra - b.hoje end,
        case when b.data_necessaria >= b.hoje then b.data_necessaria - b.hoje end,
        (select min(c.previsao_entrega - b.hoje) from public.compras c
          where c.solicitacao_id = b.id and c.data_entrega_real is null and c.previsao_entrega >= b.hoje)
      ) end as d_vence
  from base b
)
select k.id, k.codigo, k.numero, k.cliente, k.empreendimento, k.unidade, k.titulo, k.prioridade,
  k.data_necessaria, k.status, k.created_at, k.updated_at, k.solicitante_id,
  ps.nome as solicitante_nome, k.responsavel_compras_id, pr.nome as responsavel_nome,
  (select count(*) from public.solicitacao_itens i where i.solicitacao_id = k.id) as qtd_itens,
  (select count(*) from public.solicitacao_anexos a where a.solicitacao_id = k.id) as qtd_anexos,
  coalesce((select sum(c.valor_total) from public.compras c where c.solicitacao_id = k.id), 0::numeric) as custo_total,
  (select string_agg(distinct c.fornecedor, ', ') from public.compras c where c.solicitacao_id = k.id) as fornecedores,
  (select min(c.previsao_entrega) from public.compras c where c.solicitacao_id = k.id and c.data_entrega_real is null) as proxima_entrega,
  (select string_agg(distinct c.local_entrega, ', ') from public.compras c where c.solicitacao_id = k.id) as locais_entrega,
  coalesce(greatest(k.d_compra, k.d_entrega, k.d_chegada), 0) > 0 as atrasada,
  (k.extracao_id is not null) as via_projeto_executivo,
  -- novos campos
  k.prazo_compra,
  k.d_compra as dias_atraso_compra,
  k.d_entrega as dias_atraso_entrega,
  k.d_chegada as dias_atraso_chegada,
  greatest(k.d_compra, k.d_entrega, k.d_chegada) as dias_atraso,
  case
    when k.d_compra is not null and k.d_compra >= coalesce(k.d_entrega, 0) and k.d_compra >= coalesce(k.d_chegada, 0) then 'compra'
    when k.d_entrega is not null and k.d_entrega >= coalesce(k.d_chegada, 0) then 'entrega'
    when k.d_chegada is not null then 'chegada'
  end as tipo_atraso,
  case
    when k.status in ('entregue','cancelada') then 'concluida'
    when coalesce(greatest(k.d_compra, k.d_entrega, k.d_chegada), 0) > 0 then 'atrasada'
    when k.d_vence = 0 then 'vence_hoje'
    when k.d_vence between 1 and 3 then 'vence_em_breve'
    when k.d_vence is not null then 'no_prazo'
    else 'sem_prazo'
  end as situacao_prazo,
  k.d_vence as vence_em_dias
from calc k
left join public.profiles ps on ps.id = k.solicitante_id
left join public.profiles pr on pr.id = k.responsavel_compras_id;


revoke execute on function public.dias_atraso_entrega(public.compras) from anon;
