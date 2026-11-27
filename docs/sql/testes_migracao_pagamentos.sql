-- Simula dados legados em uma solicitação existente e repete a transferência; reverte tudo.
DO $$
DECLARE sid uuid; pid uuid; arquivo public.solicitacao_anexos; aid uuid; n integer;
BEGIN
 SELECT id INTO sid FROM public.solicitacoes s WHERE NOT EXISTS(SELECT 1 FROM public.solicitacao_pagamentos p WHERE p.solicitacao_id=s.id) ORDER BY id LIMIT 1;
 SELECT a.* INTO arquivo FROM public.solicitacao_anexos a JOIN storage.objects o ON o.name=a.storage_path AND o.bucket_id='projetos-executivos' WHERE a.nome_arquivo ~* '\.(pdf|png|jpe?g)$' AND a.tipo_mime IN ('application/pdf','image/png','image/jpeg') AND a.tamanho_bytes BETWEEN 1 AND 52428800 ORDER BY a.id LIMIT 1;
 IF sid IS NULL OR arquivo.id IS NULL THEN RAISE EXCEPTION 'Faltam registros para simular a transferência.'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub','',true);
  UPDATE public.solicitacoes SET pagamento_link='https://pagamento.example/legado',pagamento_instrucoes=repeat('x',900) WHERE id=sid;
  FOR n IN 1..2 LOOP
   INSERT INTO public.solicitacao_pagamentos(solicitacao_id,onde_comprado,link,codigo,legado)
   SELECT s.id,coalesce((SELECT c.fornecedor FROM public.cotacoes c WHERE c.solicitacao_id=s.id AND c.escolhida ORDER BY c.id LIMIT 1),'Não informado (migrado)'),s.pagamento_link,s.pagamento_instrucoes,true FROM public.solicitacoes s WHERE s.id=sid ON CONFLICT(solicitacao_id) WHERE legado DO NOTHING;
  END LOOP;
  SELECT id INTO pid FROM public.solicitacao_pagamentos WHERE solicitacao_id=sid AND legado;
  INSERT INTO public.solicitacao_anexos(solicitacao_id,pagamento_id,finalidade,nome_arquivo,storage_path,tamanho_bytes,tipo_mime,enviado_por) VALUES(sid,pid,'pagamento',arquivo.nome_arquivo,arquivo.storage_path,arquivo.tamanho_bytes,arquivo.tipo_mime,arquivo.enviado_por) RETURNING id INTO aid;
  IF (SELECT count(*) FROM public.solicitacao_pagamentos WHERE solicitacao_id=sid)<>1 THEN RAISE EXCEPTION 'Falha: transferência duplicou o pagamento.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.solicitacao_pagamentos p JOIN public.solicitacoes s ON s.id=p.solicitacao_id WHERE p.id=pid AND p.link=s.pagamento_link AND p.codigo=s.pagamento_instrucoes AND length(p.codigo)=900 AND p.valor IS NULL) THEN RAISE EXCEPTION 'Falha: conteúdo truncado ou valor inventado.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.solicitacao_anexos WHERE id=aid AND pagamento_id=pid AND storage_path=arquivo.storage_path AND finalidade='pagamento') THEN RAISE EXCEPTION 'Falha: boleto ou finalidade perdidos.'; END IF;
  IF EXISTS(SELECT 1 FROM public.solicitacao_itens WHERE solicitacao_id=sid AND pagamento_id IS NOT NULL) THEN RAISE EXCEPTION 'Falha: vínculos inventados na transferência.'; END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Reverter testes';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE NOTICE 'PASSOU: transferência reexecutável, conteúdo, boleto e colunas preservados; tudo desfeito.'; END;
END $$;
