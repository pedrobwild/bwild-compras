DROP TRIGGER boletos_meios ON public.solicitacao_anexos;
CREATE CONSTRAINT TRIGGER boletos_meios_insert AFTER INSERT ON public.solicitacao_anexos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW.finalidade='pagamento') EXECUTE FUNCTION public.conferir_pagamentos_finais();
CREATE CONSTRAINT TRIGGER boletos_meios_delete AFTER DELETE ON public.solicitacao_anexos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.finalidade='pagamento') EXECUTE FUNCTION public.conferir_pagamentos_finais();
CREATE CONSTRAINT TRIGGER boletos_meios_update AFTER UPDATE ON public.solicitacao_anexos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.finalidade='pagamento' OR NEW.finalidade='pagamento') EXECUTE FUNCTION public.conferir_pagamentos_finais();
CREATE OR REPLACE FUNCTION public.validar_dados_pagamento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.status='solicitacao_pagamento' AND auth.uid() IS NOT NULL AND NOT public.is_compras(auth.uid()) THEN RAISE EXCEPTION 'Somente Compras/Admin pode solicitar pagamento.'; END IF;
 IF TG_OP='UPDATE' AND (NEW.pagamento_link IS DISTINCT FROM OLD.pagamento_link OR NEW.pagamento_instrucoes IS DISTINCT FROM OLD.pagamento_instrucoes) AND auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Use a lista de pagamentos; os campos antigos são somente para referência.'; END IF;
 IF TG_OP='UPDATE' AND NEW.status='solicitacao_pagamento' AND OLD.status<>NEW.status THEN
  IF NOT public.is_compras(auth.uid()) THEN RAISE EXCEPTION 'Somente Compras/Admin pode solicitar pagamento.'; END IF;
  IF OLD.status<>'aprovada' THEN RAISE EXCEPTION 'A solicitação de pagamento só pode ser pedida depois de Aprovado.'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.log_pagamento_multiplo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.solicitacao_id ELSE NEW.solicitacao_id END;
 IF EXISTS(SELECT 1 FROM public.solicitacoes WHERE id=sid) THEN
  UPDATE public.solicitacoes SET updated_at=now() WHERE id=sid;
  INSERT INTO public.solicitacao_eventos(solicitacao_id,tipo,descricao,usuario_id) VALUES(sid,'comentario',CASE WHEN TG_OP='INSERT' THEN 'Pagamento adicionado' WHEN TG_OP='DELETE' THEN 'Pagamento removido' ELSE 'Pagamento alterado' END,auth.uid());
 END IF; RETURN NULL;
END $$;
-- Conferência imediata da transação inclui os gatilhos de boleto atuais.
CREATE OR REPLACE FUNCTION public.conferir_salvamento_pagamentos() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.conferir_salvamento_pagamentos() FROM PUBLIC,anon,authenticated;