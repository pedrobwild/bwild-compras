-- Prazo do fornecedor, dados previstos na solicitação e painel com a melhor informação disponível.
-- Não altera guard_aprovacao, sync_status_compras, RLS nem as regras de atraso (que seguem lendo prazo_compra).

ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS prazo_fornecedor_dias integer,
  ADD COLUMN IF NOT EXISTS fornecedor_previsto text,
  ADD COLUMN IF NOT EXISTS valor_estimado numeric,
  ADD COLUMN IF NOT EXISTS local_entrega_previsto text;

-- Valida os campos novos e calcula prazo_compra = data_necessaria - prazo_fornecedor_dias (dias corridos).
-- Sem prazo do fornecedor, o prazo_compra existente fica como está.
CREATE OR REPLACE FUNCTION public.calcular_prazo_compra()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.prazo_fornecedor_dias IS NOT NULL AND (NEW.prazo_fornecedor_dias < 0 OR NEW.prazo_fornecedor_dias > 365) THEN
    RAISE EXCEPTION 'O prazo do fornecedor deve ficar entre 0 e 365 dias.';
  END IF;
  IF NEW.valor_estimado IS NOT NULL AND NEW.valor_estimado < 0 THEN
    RAISE EXCEPTION 'O valor estimado não pode ser negativo.';
  END IF;
  IF length(NEW.fornecedor_previsto) > 150 THEN
    RAISE EXCEPTION 'O fornecedor previsto deve ter até 150 caracteres.';
  END IF;
  IF length(NEW.local_entrega_previsto) > 60 THEN
    RAISE EXCEPTION 'O local de entrega deve ter até 60 caracteres.';
  END IF;
  IF NEW.prazo_fornecedor_dias IS NOT NULL AND NEW.data_necessaria IS NOT NULL THEN
    NEW.prazo_compra := NEW.data_necessaria - NEW.prazo_fornecedor_dias;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS solicitacoes_calcular_prazo ON public.solicitacoes;
CREATE TRIGGER solicitacoes_calcular_prazo
  BEFORE INSERT OR UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.calcular_prazo_compra();

-- Solicitações antigas: prazo do fornecedor = diferença entre as duas datas; prazo_compra não muda.
-- updated_at é preservado para não afetar indicadores que leem essa data, e a conferência de pagamentos
-- fica de fora só neste preenchimento (nenhum dado de pagamento muda; há solicitações antigas que ela recusaria).
ALTER TABLE public.solicitacoes DISABLE TRIGGER solicitacoes_touch;
ALTER TABLE public.solicitacoes DISABLE TRIGGER solicitacoes_meios;
UPDATE public.solicitacoes
   SET prazo_fornecedor_dias = data_necessaria - prazo_compra
 WHERE prazo_fornecedor_dias IS NULL
   AND prazo_compra IS NOT NULL AND data_necessaria IS NOT NULL
   AND data_necessaria - prazo_compra BETWEEN 0 AND 365;
ALTER TABLE public.solicitacoes ENABLE TRIGGER solicitacoes_touch;
ALTER TABLE public.solicitacoes ENABLE TRIGGER solicitacoes_meios;

-- Painel: mesmas colunas e cálculos de atraso; acrescenta no fim a melhor informação disponível
-- (compra registrada > cotação escolhida > solicitação) e a origem de cada valor.
CREATE OR REPLACE VIEW public.painel_solicitacoes WITH (security_invoker = true) AS
WITH base AS (
         SELECT s.id,
            s.numero,
            s.codigo,
            s.cliente,
            s.empreendimento,
            s.unidade,
            s.endereco_obra,
            s.titulo,
            s.descricao,
            s.prioridade,
            s.data_necessaria,
            s.status,
            s.solicitante_id,
            s.responsavel_compras_id,
            s.motivo_cancelamento,
            s.created_at,
            s.updated_at,
            s.area_m2,
            s.prazo_obra,
            s.extracao_id,
            s.prazo_compra,
            hoje_sp() AS hoje,
            ( SELECT max(hoje_sp() - c.previsao_entrega) AS max
                   FROM compras c
                  WHERE c.solicitacao_id = s.id AND c.data_entrega_real IS NULL AND c.previsao_entrega < hoje_sp()) AS atraso_entrega_aberta
           FROM solicitacoes s
        ), calc AS (
         SELECT b.id,
            b.numero,
            b.codigo,
            b.cliente,
            b.empreendimento,
            b.unidade,
            b.endereco_obra,
            b.titulo,
            b.descricao,
            b.prioridade,
            b.data_necessaria,
            b.status,
            b.solicitante_id,
            b.responsavel_compras_id,
            b.motivo_cancelamento,
            b.created_at,
            b.updated_at,
            b.area_m2,
            b.prazo_obra,
            b.extracao_id,
            b.prazo_compra,
            b.hoje,
            b.atraso_entrega_aberta,
                CASE
                    WHEN (b.status = ANY (ARRAY['nova'::status_solicitacao, 'cronograma_confirmado'::status_solicitacao, 'em_cotacao'::status_solicitacao, 'aguardando_aprovacao'::status_solicitacao, 'aprovada'::status_solicitacao, 'solicitacao_pagamento'::status_solicitacao])) AND b.prazo_compra < b.hoje THEN b.hoje - b.prazo_compra
                    ELSE NULL::integer
                END AS d_compra,
                CASE
                    WHEN b.status <> ALL (ARRAY['entregue'::status_solicitacao, 'cancelada'::status_solicitacao]) THEN b.atraso_entrega_aberta
                    ELSE NULL::integer
                END AS d_entrega,
                CASE
                    WHEN (b.status <> ALL (ARRAY['entregue'::status_solicitacao, 'cancelada'::status_solicitacao])) AND b.data_necessaria < b.hoje THEN b.hoje - b.data_necessaria
                    ELSE NULL::integer
                END AS d_chegada,
                CASE
                    WHEN b.status = ANY (ARRAY['entregue'::status_solicitacao, 'cancelada'::status_solicitacao]) THEN NULL::integer
                    ELSE LEAST(
                    CASE
                        WHEN (b.status = ANY (ARRAY['nova'::status_solicitacao, 'cronograma_confirmado'::status_solicitacao, 'em_cotacao'::status_solicitacao, 'aguardando_aprovacao'::status_solicitacao, 'aprovada'::status_solicitacao, 'solicitacao_pagamento'::status_solicitacao])) AND b.prazo_compra >= b.hoje THEN b.prazo_compra - b.hoje
                        ELSE NULL::integer
                    END,
                    CASE
                        WHEN b.data_necessaria >= b.hoje THEN b.data_necessaria - b.hoje
                        ELSE NULL::integer
                    END, ( SELECT min(c.previsao_entrega - b.hoje) AS min
                       FROM compras c
                      WHERE c.solicitacao_id = b.id AND c.data_entrega_real IS NULL AND c.previsao_entrega >= b.hoje))
                END AS d_vence
           FROM base b
        )
 SELECT k.id,
    k.codigo,
    k.numero,
    k.cliente,
    k.empreendimento,
    k.unidade,
    k.titulo,
    k.prioridade,
    k.data_necessaria,
    k.status,
    k.created_at,
    k.updated_at,
    k.solicitante_id,
    ps.nome AS solicitante_nome,
    k.responsavel_compras_id,
    pr.nome AS responsavel_nome,
    ( SELECT count(*) AS count
           FROM solicitacao_itens i
          WHERE i.solicitacao_id = k.id) AS qtd_itens,
    ( SELECT count(*) AS count
           FROM solicitacao_anexos a
          WHERE a.solicitacao_id = k.id) AS qtd_anexos,
    COALESCE(( SELECT sum(c.valor_total) AS sum
           FROM compras c
          WHERE c.solicitacao_id = k.id), 0::numeric) AS custo_total,
    ( SELECT string_agg(DISTINCT c.fornecedor, ', '::text) AS string_agg
           FROM compras c
          WHERE c.solicitacao_id = k.id) AS fornecedores,
    ( SELECT min(c.previsao_entrega) AS min
           FROM compras c
          WHERE c.solicitacao_id = k.id AND c.data_entrega_real IS NULL) AS proxima_entrega,
    ( SELECT string_agg(DISTINCT c.local_entrega, ', '::text) AS string_agg
           FROM compras c
          WHERE c.solicitacao_id = k.id) AS locais_entrega,
    COALESCE(GREATEST(k.d_compra, k.d_entrega, k.d_chegada), 0) > 0 AS atrasada,
    k.extracao_id IS NOT NULL AS via_projeto_executivo,
    k.prazo_compra,
    k.d_compra AS dias_atraso_compra,
    k.d_entrega AS dias_atraso_entrega,
    k.d_chegada AS dias_atraso_chegada,
    GREATEST(k.d_compra, k.d_entrega, k.d_chegada) AS dias_atraso,
        CASE
            WHEN k.d_compra IS NOT NULL AND k.d_compra >= COALESCE(k.d_entrega, 0) AND k.d_compra >= COALESCE(k.d_chegada, 0) THEN 'compra'::text
            WHEN k.d_entrega IS NOT NULL AND k.d_entrega >= COALESCE(k.d_chegada, 0) THEN 'entrega'::text
            WHEN k.d_chegada IS NOT NULL THEN 'chegada'::text
            ELSE NULL::text
        END AS tipo_atraso,
        CASE
            WHEN k.status = ANY (ARRAY['entregue'::status_solicitacao, 'cancelada'::status_solicitacao]) THEN 'concluida'::text
            WHEN COALESCE(GREATEST(k.d_compra, k.d_entrega, k.d_chegada), 0) > 0 THEN 'atrasada'::text
            WHEN k.d_vence = 0 THEN 'vence_hoje'::text
            WHEN k.d_vence >= 1 AND k.d_vence <= 3 THEN 'vence_em_breve'::text
            WHEN k.d_vence IS NOT NULL THEN 'no_prazo'::text
            ELSE 'sem_prazo'::text
        END AS situacao_prazo,
    k.d_vence AS vence_em_dias,
    sx.prazo_fornecedor_dias,
    sx.fornecedor_previsto,
    sx.valor_estimado,
    sx.local_entrega_previsto,
    cp.qtd_compras,
    cp.data_compra_min,
    COALESCE(cp.fornecedores, NULLIF(btrim(cot.fornecedor), ''), NULLIF(btrim(sx.fornecedor_previsto), '')) AS fornecedor_exibicao,
    CASE
        WHEN cp.fornecedores IS NOT NULL THEN 'compra'
        WHEN NULLIF(btrim(cot.fornecedor), '') IS NOT NULL THEN 'cotacao'
        WHEN NULLIF(btrim(sx.fornecedor_previsto), '') IS NOT NULL THEN 'solicitacao'
        ELSE NULL::text
    END AS fornecedor_origem,
    CASE
        WHEN cp.qtd_compras > 0 THEN cp.valor_compras
        WHEN cot.valor_total IS NOT NULL THEN cot.valor_total
        ELSE sx.valor_estimado
    END AS valor_exibicao,
    CASE
        WHEN cp.qtd_compras > 0 THEN 'compra'
        WHEN cot.valor_total IS NOT NULL THEN 'cotacao'
        WHEN sx.valor_estimado IS NOT NULL THEN 'solicitacao'
        ELSE NULL::text
    END AS valor_origem,
    COALESCE(cp.locais, NULLIF(btrim(sx.local_entrega_previsto), '')) AS local_exibicao,
    CASE
        WHEN cp.locais IS NOT NULL THEN 'compra'
        WHEN NULLIF(btrim(sx.local_entrega_previsto), '') IS NOT NULL THEN 'solicitacao'
        ELSE NULL::text
    END AS local_origem,
    COALESCE(cp.previsao_aberta, cp.previsao_ultima, k.data_necessaria) AS previsao_exibicao,
    CASE
        WHEN COALESCE(cp.previsao_aberta, cp.previsao_ultima) IS NOT NULL THEN 'compra'
        WHEN k.data_necessaria IS NOT NULL THEN 'solicitacao'
        ELSE NULL::text
    END AS previsao_origem,
    cot.prazo_entrega_dias AS cotacao_prazo_dias
   FROM calc k
     LEFT JOIN profiles ps ON ps.id = k.solicitante_id
     LEFT JOIN profiles pr ON pr.id = k.responsavel_compras_id
     LEFT JOIN solicitacoes sx ON sx.id = k.id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS qtd_compras,
            sum(c.valor_total) AS valor_compras,
            string_agg(DISTINCT c.fornecedor, ', '::text) AS fornecedores,
            string_agg(DISTINCT c.local_entrega, ', '::text) AS locais,
            min(c.data_compra) AS data_compra_min,
            min(c.previsao_entrega) FILTER (WHERE c.data_entrega_real IS NULL) AS previsao_aberta,
            max(c.previsao_entrega) AS previsao_ultima
           FROM compras c
          WHERE c.solicitacao_id = k.id) cp ON true
     LEFT JOIN LATERAL ( SELECT ct.fornecedor, ct.valor_total, ct.prazo_entrega_dias
           FROM cotacoes ct
          WHERE ct.solicitacao_id = k.id AND ct.escolhida
          ORDER BY ct.updated_at DESC, ct.id
         LIMIT 1) cot ON true;
