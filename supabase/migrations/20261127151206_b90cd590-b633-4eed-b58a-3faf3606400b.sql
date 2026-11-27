-- Usa um arquivo já existente sem modificar seu conteúdo; todas as referências de teste são desfeitas.
DO $$
DECLARE comprador uuid; sid uuid; arquivo public.solicitacao_anexos; boleto uuid; bloqueou boolean; eventos integer;
BEGIN
  SELECT user_id INTO comprador FROM public.user_roles WHERE role = 'admin' ORDER BY user_id LIMIT 1;
  SELECT a.* INTO arquivo FROM public.solicitacao_anexos a JOIN storage.objects o ON o.name = a.storage_path AND o.bucket_id = 'projetos-executivos'
    WHERE a.nome_arquivo ~* '\.(pdf|png|jpe?g)$' AND a.tipo_mime IN ('application/pdf','image/png','image/jpeg') AND a.tamanho_bytes BETWEEN 1 AND 52428800 ORDER BY a.id LIMIT 1;
  SELECT id INTO sid FROM public.solicitacoes s WHERE s.pagamento_link IS NULL AND s.pagamento_instrucoes IS NULL AND NOT EXISTS (SELECT 1 FROM public.solicitacao_anexos a WHERE a.solicitacao_id = s.id AND a.finalidade = 'pagamento') ORDER BY id LIMIT 1;
  IF comprador IS NULL OR sid IS NULL OR arquivo.id IS NULL THEN RAISE EXCEPTION 'Faltam registros para o teste transacional de boletos.'; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub',comprador::text,true);
    UPDATE public.solicitacoes SET status = 'aprovada' WHERE id = sid;
    SELECT count(*) INTO eventos FROM public.solicitacao_eventos WHERE solicitacao_id = sid AND descricao = 'Boleto de pagamento anexado';
    INSERT INTO public.solicitacao_anexos(solicitacao_id,nome_arquivo,storage_path,tamanho_bytes,tipo_mime,finalidade,enviado_por)
      VALUES(sid,arquivo.nome_arquivo,arquivo.storage_path,arquivo.tamanho_bytes,arquivo.tipo_mime,'pagamento',comprador) RETURNING id INTO boleto;
    IF (SELECT count(*) FROM public.solicitacao_eventos WHERE solicitacao_id = sid AND descricao = 'Boleto de pagamento anexado') <> eventos + 1 THEN RAISE EXCEPTION 'Falha: histórico do boleto não registrado.'; END IF;
    PERFORM public.salvar_pagamento(sid,'','',true,'{}');
    IF NOT EXISTS (SELECT 1 FROM public.solicitacoes WHERE id = sid AND status = 'solicitacao_pagamento' AND pagamento_link IS NULL AND pagamento_instrucoes IS NULL) THEN RAISE EXCEPTION 'Falha: passagem com somente boleto recusada.'; END IF;
    bloqueou := false;
    BEGIN DELETE FROM public.solicitacao_anexos WHERE id = boleto;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Mantenha pelo menos%' THEN RAISE; END IF; bloqueou := true;
    END;
    IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: último boleto removido sem outro meio.'; END IF;
    PERFORM public.salvar_pagamento(sid,'','Pix: substituir boleto',false,ARRAY[boleto]);
    IF EXISTS (SELECT 1 FROM public.solicitacao_anexos WHERE id = boleto) THEN RAISE EXCEPTION 'Falha: boleto não foi removido após substituição.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.solicitacao_eventos WHERE solicitacao_id = sid AND descricao = 'Boleto de pagamento removido') THEN RAISE EXCEPTION 'Falha: remoção sem histórico.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'projetos-executivos' AND name = arquivo.storage_path) THEN RAISE EXCEPTION 'Falha: arquivo original alterado.'; END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Desfazer testes';
  EXCEPTION WHEN no_data_found THEN RAISE NOTICE 'Testes de boletos passaram; todas as alterações foram desfeitas.';
  END;
END; $$;