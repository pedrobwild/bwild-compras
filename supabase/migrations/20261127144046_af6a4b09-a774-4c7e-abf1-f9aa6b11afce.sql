-- Testes transacionais: usam um registro existente e desfazem TODAS as alterações.
-- Não criam usuário, solicitação, compra ou arquivo; não incrementam sequências.
DO $$
DECLARE
  admin_id uuid; solicitante_id uuid; sid uuid; bloqueou boolean; antes integer; depois integer;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin' ORDER BY user_id LIMIT 1;
  SELECT r.user_id INTO solicitante_id FROM public.user_roles r WHERE role = 'solicitante' AND NOT EXISTS (SELECT 1 FROM public.user_roles b WHERE b.user_id = r.user_id AND b.role IN ('compras','admin')) ORDER BY r.user_id LIMIT 1;
  SELECT id INTO sid FROM public.solicitacoes WHERE pagamento_link IS NULL AND pagamento_instrucoes IS NULL AND NOT EXISTS (SELECT 1 FROM public.solicitacao_anexos a WHERE a.solicitacao_id = solicitacoes.id AND a.finalidade = 'pagamento') ORDER BY id LIMIT 1;
  IF admin_id IS NULL OR solicitante_id IS NULL OR sid IS NULL THEN RAISE EXCEPTION 'Faltam registros para executar os testes transacionais.'; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
    UPDATE public.solicitacoes SET status = 'aprovada' WHERE id = sid;

    bloqueou := false;
    BEGIN
      UPDATE public.solicitacoes SET status = 'solicitacao_pagamento' WHERE id = sid;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Informe um link,%' THEN RAISE; END IF; bloqueou := true;
    END;
    IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: passagem vazia permitida.'; END IF;

    SELECT count(*) INTO antes FROM public.solicitacao_eventos WHERE solicitacao_id = sid AND descricao = 'Dados de pagamento informados';
    PERFORM public.salvar_pagamento(sid,'https://pagamento.example/pedido','',true,'{}');
    IF NOT EXISTS (SELECT 1 FROM public.solicitacoes WHERE id = sid AND status = 'solicitacao_pagamento' AND pagamento_link = 'https://pagamento.example/pedido') THEN RAISE EXCEPTION 'Falha: link não persistido.'; END IF;
    SELECT count(*) INTO depois FROM public.solicitacao_eventos WHERE solicitacao_id = sid AND descricao = 'Dados de pagamento informados';
    IF depois <> antes + 1 THEN RAISE EXCEPTION 'Falha: histórico ausente ou duplicado.'; END IF;

    bloqueou := false;
    BEGIN PERFORM public.salvar_pagamento(sid,'','',false,'{}');
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Informe um link,%' THEN RAISE; END IF; bloqueou := true;
    END;
    IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: remoção do último meio permitida.'; END IF;

    bloqueou := false;
    BEGIN PERFORM public.salvar_pagamento(sid,'javascript:alert(1)','',false,'{}');
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Informe um link completo%' THEN RAISE; END IF; bloqueou := true;
    END;
    IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: protocolo executável permitido.'; END IF;

    PERFORM public.salvar_pagamento(sid,'https://pagamento.example/' || repeat('a',1000-length('https://pagamento.example/')),'',false,'{}');
    bloqueou := false;
    BEGIN PERFORM public.salvar_pagamento(sid,'https://pagamento.example/' || repeat('a',1001-length('https://pagamento.example/')),'',false,'{}');
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Informe um link completo%' THEN RAISE; END IF; bloqueou := true;
    END;
    IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: link de 1001 caracteres permitido.'; END IF;

    PERFORM public.salvar_pagamento(sid,'',repeat('x',500),false,'{}');
    bloqueou := false;
    BEGIN PERFORM public.salvar_pagamento(sid,'',repeat('x',501),false,'{}');
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'As instruções%' THEN RAISE; END IF; bloqueou := true;
    END;
    IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: instruções de 501 caracteres permitidas.'; END IF;

    PERFORM set_config('request.jwt.claim.sub',solicitante_id::text,true);
    bloqueou := false;
    BEGIN PERFORM public.salvar_pagamento(sid,'https://pagamento.example/nao-autorizado','',false,'{}');
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Somente Compras/Admin%' THEN RAISE; END IF; bloqueou := true;
    END;
    IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: solicitante conseguiu gravar via função.'; END IF;
    bloqueou := false;
    BEGIN UPDATE public.solicitacoes SET pagamento_instrucoes = 'alteração direta indevida' WHERE id = sid;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Somente Compras/Admin%' THEN RAISE; END IF; bloqueou := true;
    END;
    IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: solicitante conseguiu gravar direto.'; END IF;

    PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
    -- Um boleto só conta se existir no bucket; metadados fabricados não bastam.
    bloqueou := false;
    BEGIN INSERT INTO public.solicitacao_anexos(solicitacao_id,nome_arquivo,storage_path,tamanho_bytes,tipo_mime,finalidade,enviado_por)
      VALUES(sid,'boleto.pdf',sid::text || '/pagamentos/teste-inexistente.pdf',10,'application/pdf','pagamento',admin_id);
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Envie o boleto%' THEN RAISE; END IF; bloqueou := true;
    END;
    IF NOT bloqueou THEN RAISE EXCEPTION 'Falha: boleto não enviado aceito.'; END IF;

    -- Exercita as mesmas políticas da API com o papel authenticated, sem criar sessão.
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF NOT EXISTS (SELECT 1 FROM public.solicitacoes WHERE id = sid) THEN RAISE EXCEPTION 'Falha: usuário logado não consegue consultar.'; END IF;
    PERFORM public.salvar_pagamento(sid,'','Pix: teste transacional',false,'{}');
    PERFORM set_config('request.jwt.claim.sub',solicitante_id::text,true);
    IF NOT EXISTS (SELECT 1 FROM public.solicitacoes WHERE id = sid AND pagamento_instrucoes = 'Pix: teste transacional') THEN RAISE EXCEPTION 'Falha: solicitante não consegue ler pagamento.'; END IF;
    UPDATE public.solicitacoes SET pagamento_instrucoes = 'tentativa sem permissão' WHERE id = sid;
    IF FOUND THEN RAISE EXCEPTION 'Falha: RLS permitiu edição pelo solicitante.'; END IF;
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Desfazer testes';
  EXCEPTION WHEN no_data_found THEN
    RAISE NOTICE 'Testes de pagamentos passaram; todas as alterações foram desfeitas.';
  END;
END; $$;