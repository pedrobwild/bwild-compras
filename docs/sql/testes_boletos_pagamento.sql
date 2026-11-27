-- Reutiliza arquivo existente, sem alterar Storage. Todas as referências são revertidas.
DO $$
DECLARE comprador uuid; sid uuid; arquivo public.solicitacao_anexos; pid uuid:=gen_random_uuid(); boleto uuid; versao timestamptz; bloqueou boolean; dados jsonb;
BEGIN
 SELECT user_id INTO comprador FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT a.* INTO arquivo FROM public.solicitacao_anexos a JOIN storage.objects o ON o.name=a.storage_path AND o.bucket_id='projetos-executivos' WHERE a.nome_arquivo ~* '\.(pdf|png|jpe?g)$' AND a.tipo_mime IN ('application/pdf','image/png','image/jpeg') AND a.tamanho_bytes BETWEEN 1 AND 52428800 ORDER BY a.id LIMIT 1;
 SELECT id INTO sid FROM public.solicitacoes s WHERE NOT EXISTS(SELECT 1 FROM public.solicitacao_pagamentos p WHERE p.solicitacao_id=s.id) ORDER BY id LIMIT 1;
 IF comprador IS NULL OR sid IS NULL OR arquivo.id IS NULL THEN RAISE EXCEPTION 'Faltam registros para o teste transacional de boletos.'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',comprador::text,true);
  UPDATE public.solicitacoes SET status='aprovada' WHERE id=sid;
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.solicitacao_pagamentos(id,solicitacao_id,onde_comprado) VALUES(pid,sid,'Teste boleto');
  INSERT INTO public.solicitacao_anexos(solicitacao_id,pagamento_id,nome_arquivo,storage_path,tamanho_bytes,tipo_mime,finalidade,enviado_por) VALUES(sid,pid,arquivo.nome_arquivo,arquivo.storage_path,arquivo.tamanho_bytes,arquivo.tipo_mime,'pagamento',comprador) RETURNING id INTO boleto;
  dados:=jsonb_build_array(jsonb_build_object('id',pid,'onde_comprado','Teste boleto','link','','codigo','','itens','[]'::jsonb,'boletos',jsonb_build_array(jsonb_build_object('id',boleto))));
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT updated_at INTO versao FROM public.solicitacoes WHERE id=sid;
  PERFORM public.salvar_pagamentos(sid,dados,true,versao);
  IF NOT EXISTS(SELECT 1 FROM public.solicitacoes WHERE id=sid AND status='solicitacao_pagamento') THEN RAISE EXCEPTION 'Falha: boleto sozinho não permite solicitar.'; END IF;
  bloqueou:=false;
  BEGIN DELETE FROM public.solicitacao_anexos WHERE id=boleto; SET CONSTRAINTS ALL IMMEDIATE; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Cada pagamento%' THEN RAISE; END IF; bloqueou:=true; END;
  IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: último boleto removido sem outro meio.'; END IF;
  UPDATE public.solicitacao_pagamentos SET codigo='Substituição do boleto' WHERE id=pid;
  DELETE FROM public.solicitacao_anexos WHERE id=boleto;
  SET CONSTRAINTS ALL IMMEDIATE;
  IF EXISTS(SELECT 1 FROM public.solicitacao_anexos WHERE id=boleto) OR NOT EXISTS(SELECT 1 FROM public.solicitacao_eventos WHERE solicitacao_id=sid AND descricao='Boleto de pagamento removido') THEN RAISE EXCEPTION 'Falha: remoção ou histórico ausente.'; END IF;
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='projetos-executivos' AND name=arquivo.storage_path) THEN RAISE EXCEPTION 'Falha: arquivo original alterado.'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Reverter testes';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE NOTICE 'PASSOU: boleto vinculado, passagem, proteção e substituição; tudo desfeito.'; END;
END $$;
