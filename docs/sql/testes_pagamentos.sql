-- Executa com registros existentes e reverte tudo, inclusive histórico e vínculos.
DO $$
DECLARE comprador uuid; leitor uuid; sid uuid; i1 uuid; i2 uuid; outro uuid; pid uuid:=gen_random_uuid(); pid2 uuid:=gen_random_uuid(); versao timestamptz; dados jsonb; bloqueou boolean; teste record;
BEGIN
 SELECT user_id INTO comprador FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT r.user_id INTO leitor FROM public.user_roles r WHERE r.role='solicitante' AND NOT EXISTS(SELECT 1 FROM public.user_roles b WHERE b.user_id=r.user_id AND b.role IN ('admin','compras')) ORDER BY r.user_id LIMIT 1;
 SELECT s.id INTO sid FROM public.solicitacoes s WHERE NOT EXISTS(SELECT 1 FROM public.solicitacao_pagamentos p WHERE p.solicitacao_id=s.id) AND (SELECT count(*) FROM public.solicitacao_itens i WHERE i.solicitacao_id=s.id)>=2 ORDER BY s.id LIMIT 1;
 SELECT id INTO i1 FROM public.solicitacao_itens WHERE solicitacao_id=sid ORDER BY id LIMIT 1;
 SELECT id INTO i2 FROM public.solicitacao_itens WHERE solicitacao_id=sid AND id<>i1 ORDER BY id LIMIT 1;
 SELECT id INTO outro FROM public.solicitacao_itens WHERE solicitacao_id<>sid ORDER BY id LIMIT 1;
 IF comprador IS NULL OR leitor IS NULL OR sid IS NULL OR outro IS NULL THEN RAISE EXCEPTION 'Faltam registros para o teste transacional.'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',comprador::text,true);
  UPDATE public.solicitacoes SET status='aprovada' WHERE id=sid;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT updated_at INTO versao FROM public.solicitacoes WHERE id=sid;
  dados:=jsonb_build_array(jsonb_build_object('id',pid,'onde_comprado','Teste loja A','valor',120.5,'link','https://pagamento.example/segredo-teste','codigo','','observacao','','itens',jsonb_build_array(i1),'boletos','[]'::jsonb),jsonb_build_object('id',pid2,'onde_comprado','Teste loja B','valor',79.5,'link','','codigo','segredo-teste-pix','observacao','','itens',jsonb_build_array(i2),'boletos','[]'::jsonb));
  PERFORM public.salvar_pagamentos(sid,dados,true,versao);
  IF (SELECT count(*) FROM public.solicitacao_pagamentos WHERE solicitacao_id=sid)<>2 OR (SELECT sum(valor) FROM public.solicitacao_pagamentos WHERE solicitacao_id=sid)<>200 THEN RAISE EXCEPTION 'Falha: dois pagamentos não persistidos.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.solicitacao_itens WHERE id=i1 AND pagamento_id=pid) OR NOT EXISTS(SELECT 1 FROM public.solicitacao_itens WHERE id=i2 AND pagamento_id=pid2) THEN RAISE EXCEPTION 'Falha: vínculos não persistidos.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.solicitacoes WHERE id=sid AND status='solicitacao_pagamento') THEN RAISE EXCEPTION 'Falha: etapa não atualizada.'; END IF;
  IF (SELECT count(*) FROM public.solicitacao_eventos WHERE solicitacao_id=sid AND descricao='Pagamento adicionado')<2 OR EXISTS(SELECT 1 FROM public.solicitacao_eventos WHERE solicitacao_id=sid AND descricao LIKE '%segredo-teste%') THEN RAISE EXCEPTION 'Falha: histórico ausente ou sensível.'; END IF;
  SELECT updated_at INTO versao FROM public.solicitacoes WHERE id=sid;
  FOR teste IN SELECT * FROM (VALUES
   (format('SELECT public.salvar_pagamentos(%L,%L,false,%L)',sid,jsonb_set(dados,'{1,itens}',jsonb_build_array(i1)),versao),'Um item não pode%'),
   (format('SELECT public.salvar_pagamentos(%L,%L,false,%L)',sid,jsonb_set(dados,'{1,itens}',jsonb_build_array(outro)),versao),'Item de outra%'),
   (format('DELETE FROM public.solicitacao_pagamentos WHERE solicitacao_id=%L',sid),'Mantenha pelo menos%'),
   (format('UPDATE public.solicitacao_pagamentos SET link='''',codigo='''' WHERE id=%L',pid),'Cada pagamento%'),
   (format('UPDATE public.solicitacao_pagamentos SET codigo=repeat(''x'',1001) WHERE id=%L',pid),'O código%'),
   (format('UPDATE public.solicitacao_pagamentos SET observacao=repeat(''o'',301) WHERE id=%L',pid),'A observação%'),
   (format('UPDATE public.solicitacao_pagamentos SET link=''javascript:alert(1)'' WHERE id=%L',pid),'Informe um link%'),
   (format('UPDATE public.solicitacao_pagamentos SET onde_comprado='' '' WHERE id=%L',pid),'Informe onde%'),
   (format('UPDATE public.solicitacao_pagamentos SET valor=-1 WHERE id=%L',pid),'O valor%')
  ) AS t(comando,mensagem) LOOP
   bloqueou:=false;
   BEGIN EXECUTE teste.comando; SET CONSTRAINTS ALL IMMEDIATE;
   EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE teste.mensagem THEN RAISE; END IF; bloqueou:=true; END;
   IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: regra não protegeu %',teste.mensagem; END IF;
  END LOOP;
  UPDATE public.solicitacao_pagamentos SET link='',codigo=repeat('x',1000),observacao=repeat('o',300) WHERE id=pid;
  bloqueou:=false;
  BEGIN PERFORM public.salvar_pagamentos(sid,dados,false,versao); EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'A solicitação foi alterada%' THEN RAISE; END IF; bloqueou:=true; END;
  IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: versão antiga sobrescreveu edição.'; END IF;
  bloqueou:=false;
  BEGIN INSERT INTO public.solicitacao_anexos(solicitacao_id,pagamento_id,nome_arquivo,storage_path,tamanho_bytes,tipo_mime,finalidade,enviado_por) VALUES(sid,pid,'boleto.pdf',sid::text||'/pagamentos/'||pid::text||'/nao-enviado.pdf',10,'application/pdf','pagamento',comprador);
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Envie o boleto%' THEN RAISE; END IF; bloqueou:=true; END;
  IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: boleto não enviado aceito.'; END IF;
  PERFORM set_config('request.jwt.claim.sub',leitor::text,true);
  IF (SELECT count(*) FROM public.solicitacao_pagamentos WHERE solicitacao_id=sid)<>2 THEN RAISE EXCEPTION 'Falha: logado não lê pagamentos.'; END IF;
  UPDATE public.solicitacao_pagamentos SET onde_comprado='Tentativa' WHERE id=pid;
  IF FOUND THEN RAISE EXCEPTION 'Falha: RLS permite gravação por solicitante.'; END IF;
  bloqueou:=false;
  BEGIN PERFORM public.salvar_pagamentos(sid,dados,false,versao); EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Somente Compras/Admin%' THEN RAISE; END IF; bloqueou:=true; END;
  IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: RPC permite gravação por solicitante.'; END IF;
  EXECUTE 'RESET ROLE';
  IF has_table_privilege('anon','public.solicitacao_pagamentos','SELECT') OR has_function_privilege('anon','public.salvar_pagamentos(uuid,jsonb,boolean,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'Falha: acesso anônimo.'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Reverter testes';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE NOTICE 'PASSOU: múltiplos pagamentos, vínculos, limites, histórico e permissões. Todas as alterações desfeitas.';
 END;
END $$;
