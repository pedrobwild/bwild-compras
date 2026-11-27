CREATE INDEX itens_pagamento_solicitacao_idx ON public.solicitacao_itens(pagamento_id,solicitacao_id);
CREATE INDEX anexos_pagamento_solicitacao_idx ON public.solicitacao_anexos(pagamento_id,solicitacao_id);
ALTER POLICY pagamentos_criacao ON public.solicitacao_pagamentos WITH CHECK((select public.is_compras((select auth.uid()))));
ALTER POLICY pagamentos_edicao ON public.solicitacao_pagamentos USING((select public.is_compras((select auth.uid())))) WITH CHECK((select public.is_compras((select auth.uid()))));
ALTER POLICY pagamentos_remocao ON public.solicitacao_pagamentos USING((select public.is_compras((select auth.uid()))));
DROP TRIGGER solicitacoes_meios ON public.solicitacoes;
CREATE CONSTRAINT TRIGGER solicitacoes_meios AFTER UPDATE ON public.solicitacoes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status AND NEW.status='solicitacao_pagamento') EXECUTE FUNCTION public.conferir_pagamentos_finais();
CREATE CONSTRAINT TRIGGER solicitacoes_meios_insert AFTER INSERT ON public.solicitacoes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW.status='solicitacao_pagamento') EXECUTE FUNCTION public.conferir_pagamentos_finais();