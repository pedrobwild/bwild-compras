-- Testa o cálculo do prazo de compra e a ordem de prioridade do painel; reverte tudo no final.
DO $$
DECLARE sid uuid; autor uuid; r record; bloqueou boolean := false;
BEGIN
 SELECT id INTO autor FROM public.profiles ORDER BY id LIMIT 1;
 INSERT INTO public.solicitacoes(cliente, titulo, solicitante_id, data_necessaria, prazo_fornecedor_dias, valor_estimado, fornecedor_previsto, local_entrega_previsto)
 VALUES ('Teste prazo', 'Teste prazo', autor, '2026-12-20', 10, 300, 'Loja estimada', 'Depósito Bwild') RETURNING id INTO sid;
 IF (SELECT prazo_compra FROM public.solicitacoes WHERE id=sid) <> '2026-12-10' THEN RAISE EXCEPTION 'Falha: prazo não calculado na criação.'; END IF;
 UPDATE public.solicitacoes SET data_necessaria='2026-12-25' WHERE id=sid;
 IF (SELECT prazo_compra FROM public.solicitacoes WHERE id=sid) <> '2026-12-15' THEN RAISE EXCEPTION 'Falha: prazo não recalculado com a data na obra.'; END IF;
 UPDATE public.solicitacoes SET prazo_fornecedor_dias=0 WHERE id=sid;
 IF (SELECT prazo_compra FROM public.solicitacoes WHERE id=sid) <> '2026-12-25' THEN RAISE EXCEPTION 'Falha: prazo zero.'; END IF;
 BEGIN UPDATE public.solicitacoes SET prazo_fornecedor_dias=366 WHERE id=sid;
 EXCEPTION WHEN raise_exception THEN bloqueou := SQLERRM LIKE 'O prazo do fornecedor%'; END;
 IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: aceitou prazo acima de 365.'; END IF;

 SELECT * INTO r FROM public.painel_solicitacoes WHERE id=sid;
 IF r.valor_exibicao <> 300 OR r.valor_origem <> 'solicitacao' OR r.fornecedor_exibicao <> 'Loja estimada' OR r.local_exibicao <> 'Depósito Bwild' OR r.previsao_exibicao <> '2026-12-25' OR r.previsao_origem <> 'solicitacao' THEN RAISE EXCEPTION 'Falha: dados da solicitação.'; END IF;

 INSERT INTO public.cotacoes(solicitacao_id, fornecedor, valor_total, prazo_entrega_dias, escolhida) VALUES (sid, 'Loja cotada', 250, 7, true);
 SELECT * INTO r FROM public.painel_solicitacoes WHERE id=sid;
 IF r.valor_exibicao <> 250 OR r.valor_origem <> 'cotacao' OR r.fornecedor_exibicao <> 'Loja cotada' OR r.cotacao_prazo_dias <> 7 THEN RAISE EXCEPTION 'Falha: cotação escolhida não tem prioridade sobre o estimado.'; END IF;

 INSERT INTO public.compras(solicitacao_id, fornecedor, valor_total, previsao_entrega, local_entrega, registrado_por) VALUES (sid, 'Loja comprada', 260, '2026-12-18', 'Obra', autor);
 SELECT * INTO r FROM public.painel_solicitacoes WHERE id=sid;
 IF r.valor_exibicao <> 260 OR r.valor_origem <> 'compra' OR r.fornecedor_exibicao <> 'Loja comprada' OR r.local_exibicao <> 'Obra' OR r.previsao_exibicao <> '2026-12-18' OR r.previsao_origem <> 'compra' THEN RAISE EXCEPTION 'Falha: compra registrada não tem prioridade ou somou a cotação.'; END IF;

 UPDATE public.compras SET data_entrega_real='2026-12-17' WHERE solicitacao_id=sid;
 SELECT * INTO r FROM public.painel_solicitacoes WHERE id=sid;
 IF r.previsao_exibicao <> '2026-12-18' OR r.proxima_entrega IS NOT NULL THEN RAISE EXCEPTION 'Falha: previsão sumiu depois da entrega.'; END IF;

 RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='Reverter testes';
EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE NOTICE 'PASSOU: prazo calculado, limites e prioridade compra > cotação > solicitação. Tudo desfeito.';
END $$;
