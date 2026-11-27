DROP FUNCTION public.conferir_salvamento_pagamentos();
CREATE OR REPLACE FUNCTION public.salvar_pagamentos(p_solicitacao_id uuid,p_pagamentos jsonb,p_solicitar boolean,p_versao timestamptz) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s public.solicitacoes; p jsonb; a jsonb; iid uuid; pid uuid; kept uuid[]:='{}'; bids uuid[]; usados uuid[]:='{}';
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_compras(auth.uid()) THEN RAISE EXCEPTION 'Somente Compras/Admin pode gerenciar pagamentos.'; END IF;
 SELECT * INTO s FROM public.solicitacoes WHERE id=p_solicitacao_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
 IF p_versao IS NULL OR s.updated_at IS DISTINCT FROM p_versao THEN RAISE EXCEPTION 'A solicitação foi alterada. Reabra o diálogo antes de salvar.'; END IF;
 IF (p_solicitar AND s.status<>'aprovada') OR (NOT p_solicitar AND s.status<>'solicitacao_pagamento') THEN RAISE EXCEPTION 'A etapa mudou. Atualize a página.'; END IF;
 IF jsonb_typeof(p_pagamentos)<>'array' OR jsonb_array_length(p_pagamentos)=0 OR jsonb_array_length(p_pagamentos)>100 THEN RAISE EXCEPTION 'Informe pelo menos um pagamento válido (até 100 por edição).'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(p_pagamentos) LOOP
  pid:=(p->>'id')::uuid;
  IF pid IS NULL OR pid=ANY(kept) THEN RAISE EXCEPTION 'Pagamento repetido ou inválido.'; END IF; kept:=array_append(kept,pid);
  IF EXISTS(SELECT 1 FROM public.solicitacao_pagamentos WHERE id=pid AND solicitacao_id<>p_solicitacao_id) THEN RAISE EXCEPTION 'Pagamento de outra solicitação.'; END IF;
  FOR iid IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p->'itens','[]')) LOOP
   IF iid=ANY(usados) THEN RAISE EXCEPTION 'Um item não pode estar em dois pagamentos.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.solicitacao_itens WHERE id=iid AND solicitacao_id=p_solicitacao_id) THEN RAISE EXCEPTION 'Item de outra solicitação.'; END IF; usados:=array_append(usados,iid);
  END LOOP;
 END LOOP;
 UPDATE public.solicitacao_itens SET pagamento_id=NULL WHERE solicitacao_id=p_solicitacao_id AND pagamento_id IS NOT NULL;
 FOR p IN SELECT value FROM jsonb_array_elements(p_pagamentos) LOOP
  pid:=(p->>'id')::uuid;
  INSERT INTO public.solicitacao_pagamentos(id,solicitacao_id,onde_comprado,valor,link,codigo,observacao) VALUES(pid,p_solicitacao_id,p->>'onde_comprado',nullif(p->>'valor','')::numeric,nullif(p->>'link',''),nullif(p->>'codigo',''),nullif(p->>'observacao',''))
  ON CONFLICT(id) DO UPDATE SET onde_comprado=excluded.onde_comprado,valor=excluded.valor,link=excluded.link,codigo=excluded.codigo,observacao=excluded.observacao;
  UPDATE public.solicitacao_itens SET pagamento_id=pid WHERE solicitacao_id=p_solicitacao_id AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p->'itens','[]')));
  bids:='{}';
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p->'boletos','[]')) LOOP
   IF (a->>'id')::uuid=ANY(bids) THEN RAISE EXCEPTION 'Boleto repetido.'; END IF;
   bids:=array_append(bids,(a->>'id')::uuid);
   IF EXISTS(SELECT 1 FROM public.solicitacao_anexos WHERE id=(a->>'id')::uuid) THEN
    IF NOT EXISTS(SELECT 1 FROM public.solicitacao_anexos WHERE id=(a->>'id')::uuid AND solicitacao_id=p_solicitacao_id AND pagamento_id=pid AND finalidade='pagamento') THEN RAISE EXCEPTION 'Boleto de outro pagamento.'; END IF;
   ELSE
    IF a->>'storage_path' NOT LIKE p_solicitacao_id::text||'/pagamentos/'||pid::text||'/%' THEN RAISE EXCEPTION 'Arquivo fora do pagamento.'; END IF;
    INSERT INTO public.solicitacao_anexos(id,solicitacao_id,pagamento_id,finalidade,nome_arquivo,storage_path,tamanho_bytes,tipo_mime,enviado_por) VALUES((a->>'id')::uuid,p_solicitacao_id,pid,'pagamento',a->>'nome_arquivo',a->>'storage_path',(a->>'tamanho_bytes')::bigint,a->>'tipo_mime',auth.uid());
   END IF;
  END LOOP;
  DELETE FROM public.solicitacao_anexos WHERE solicitacao_id=p_solicitacao_id AND pagamento_id=pid AND NOT(id=ANY(bids));
 END LOOP;
 DELETE FROM public.solicitacao_pagamentos WHERE solicitacao_id=p_solicitacao_id AND NOT(id=ANY(kept));
 UPDATE public.solicitacoes SET status=CASE WHEN p_solicitar THEN 'solicitacao_pagamento'::public.status_solicitacao ELSE status END,updated_at=now() WHERE id=p_solicitacao_id;
 SET CONSTRAINTS pagamentos_meios,boletos_meios_insert,boletos_meios_delete,boletos_meios_update,solicitacoes_meios,solicitacoes_meios_insert IMMEDIATE;
END $$;
REVOKE ALL ON FUNCTION public.salvar_pagamentos(uuid,jsonb,boolean,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_pagamentos(uuid,jsonb,boolean,timestamptz) TO authenticated,service_role;