ALTER TABLE public.solicitacoes ADD COLUMN pagamento_link text, ADD COLUMN pagamento_instrucoes text;
ALTER TABLE public.solicitacao_anexos ADD COLUMN finalidade text NOT NULL DEFAULT 'geral';
CREATE INDEX solicitacao_anexos_pagamento_idx ON public.solicitacao_anexos(solicitacao_id) WHERE finalidade = 'pagamento';

CREATE OR REPLACE FUNCTION public.validar_dados_pagamento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mudou boolean; entrando boolean; tem_dados boolean;
BEGIN
  NEW.pagamento_link := nullif(btrim(NEW.pagamento_link), '');
  NEW.pagamento_instrucoes := nullif(btrim(NEW.pagamento_instrucoes), '');
  IF NEW.pagamento_link IS NOT NULL AND (char_length(NEW.pagamento_link) > 1000 OR NEW.pagamento_link !~* '^https?://[^/[:space:]?#]+[^[:space:]]*$') THEN RAISE EXCEPTION 'Informe um link completo com http:// ou https://, de até 1.000 caracteres.'; END IF;
  IF char_length(NEW.pagamento_instrucoes) > 500 THEN RAISE EXCEPTION 'As instruções devem ter até 500 caracteres.'; END IF;
  IF TG_OP = 'INSERT' THEN
    mudou := NEW.pagamento_link IS NOT NULL OR NEW.pagamento_instrucoes IS NOT NULL;
    entrando := NEW.status = 'solicitacao_pagamento';
  ELSE
    mudou := NEW.pagamento_link IS DISTINCT FROM OLD.pagamento_link OR NEW.pagamento_instrucoes IS DISTINCT FROM OLD.pagamento_instrucoes;
    entrando := NEW.status = 'solicitacao_pagamento' AND OLD.status IS DISTINCT FROM NEW.status;
  END IF;
  IF mudou OR entrando THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_compras(auth.uid()) THEN RAISE EXCEPTION 'Somente Compras/Admin pode informar dados de pagamento.'; END IF;
    IF TG_OP = 'UPDATE' THEN
      IF mudou AND NOT (OLD.status = 'solicitacao_pagamento' AND NEW.status = 'solicitacao_pagamento') AND NOT (OLD.status = 'aprovada' AND NEW.status = 'solicitacao_pagamento') THEN RAISE EXCEPTION 'Edite os dados na etapa Solicitação de pagamento.'; END IF;
      IF entrando AND OLD.status <> 'aprovada' THEN RAISE EXCEPTION 'A solicitação de pagamento só pode ser pedida depois de Aprovado.'; END IF;
    END IF;
    tem_dados := NEW.pagamento_link IS NOT NULL OR NEW.pagamento_instrucoes IS NOT NULL OR EXISTS (SELECT 1 FROM public.solicitacao_anexos WHERE solicitacao_id = NEW.id AND finalidade = 'pagamento');
    IF NEW.status = 'solicitacao_pagamento' AND NOT tem_dados THEN RAISE EXCEPTION 'Informe um link, instruções ou anexe um boleto para solicitar pagamento.'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER solicitacoes_validar_pagamento BEFORE INSERT OR UPDATE ON public.solicitacoes FOR EACH ROW EXECUTE FUNCTION public.validar_dados_pagamento();

CREATE OR REPLACE FUNCTION public.log_dados_pagamento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pagamento_link IS DISTINCT FROM OLD.pagamento_link OR NEW.pagamento_instrucoes IS DISTINCT FROM OLD.pagamento_instrucoes THEN
    INSERT INTO public.solicitacao_eventos(solicitacao_id,tipo,descricao,usuario_id) VALUES (NEW.id,'comentario',CASE WHEN OLD.pagamento_link IS NULL AND OLD.pagamento_instrucoes IS NULL THEN 'Dados de pagamento informados' ELSE 'Dados de pagamento alterados' END,auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER solicitacoes_log_pagamento AFTER UPDATE ON public.solicitacoes FOR EACH ROW EXECUTE FUNCTION public.log_dados_pagamento();

CREATE OR REPLACE FUNCTION public.proteger_anexo_pagamento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid; s public.solicitacoes; fid uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.finalidade IS DISTINCT FROM OLD.finalidade OR NEW.solicitacao_id IS DISTINCT FROM OLD.solicitacao_id OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN RAISE EXCEPTION 'Não é permitido mudar a finalidade, solicitação ou arquivo de um anexo.'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.finalidade NOT IN ('geral','pagamento') THEN RAISE EXCEPTION 'Finalidade de anexo inválida.'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.finalidade <> 'pagamento' THEN RETURN OLD; END IF;
    sid := OLD.solicitacao_id; fid := OLD.id;
  ELSE
    IF NEW.finalidade <> 'pagamento' THEN RETURN NEW; END IF;
    sid := NEW.solicitacao_id; fid := NEW.id;
  END IF;
  SELECT * INTO s FROM public.solicitacoes WHERE id = sid FOR UPDATE;
  IF NOT FOUND AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_compras(auth.uid()) THEN RAISE EXCEPTION 'Somente Compras/Admin pode gerenciar boletos.'; END IF;
  IF s.status NOT IN ('aprovada','solicitacao_pagamento') THEN RAISE EXCEPTION 'Gerencie boletos ao solicitar pagamento ou durante essa etapa.'; END IF;
  IF TG_OP <> 'DELETE' AND (NEW.nome_arquivo !~* '\.(pdf|png|jpe?g)$' OR coalesce(NEW.tamanho_bytes,0) > 52428800 OR NEW.tipo_mime NOT IN ('application/pdf','image/png','image/jpeg')) THEN RAISE EXCEPTION 'Anexe um boleto PDF, PNG, JPG ou JPEG de até 50 MB.'; END IF;
  IF TG_OP = 'DELETE' AND s.status = 'solicitacao_pagamento' AND s.pagamento_link IS NULL AND s.pagamento_instrucoes IS NULL AND NOT EXISTS (SELECT 1 FROM public.solicitacao_anexos WHERE solicitacao_id = sid AND finalidade = 'pagamento' AND id <> fid) THEN RAISE EXCEPTION 'Mantenha pelo menos um link, instruções ou boleto nesta etapa.'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER anexos_proteger_pagamento BEFORE INSERT OR UPDATE OR DELETE ON public.solicitacao_anexos FOR EACH ROW EXECUTE FUNCTION public.proteger_anexo_pagamento();

CREATE OR REPLACE FUNCTION public.log_anexo_pagamento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid; finalidade_anexo text;
BEGIN
  IF TG_OP = 'DELETE' THEN sid := OLD.solicitacao_id; finalidade_anexo := OLD.finalidade; ELSE sid := NEW.solicitacao_id; finalidade_anexo := NEW.finalidade; END IF;
  IF finalidade_anexo = 'pagamento' AND EXISTS (SELECT 1 FROM public.solicitacoes WHERE id = sid) THEN
    INSERT INTO public.solicitacao_eventos(solicitacao_id,tipo,descricao,usuario_id) VALUES (sid,'comentario',CASE WHEN TG_OP = 'INSERT' THEN 'Boleto de pagamento anexado' ELSE 'Boleto de pagamento removido' END,auth.uid());
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER anexos_log_pagamento AFTER INSERT OR DELETE ON public.solicitacao_anexos FOR EACH ROW EXECUTE FUNCTION public.log_anexo_pagamento();

ALTER POLICY "logado anexa" ON public.solicitacao_anexos WITH CHECK (enviado_por = auth.uid() AND (finalidade = 'geral' OR public.is_compras(auth.uid())));
ALTER POLICY "autor ou compras remove anexo" ON public.solicitacao_anexos USING ((finalidade = 'geral' AND (enviado_por = auth.uid() OR public.is_compras(auth.uid()))) OR (finalidade = 'pagamento' AND public.is_compras(auth.uid())));
ALTER POLICY "dono ou compras apaga projeto" ON storage.objects USING (bucket_id = 'projetos-executivos' AND (owner_id = auth.uid()::text OR public.is_compras(auth.uid())) AND NOT EXISTS (SELECT 1 FROM public.solicitacao_anexos a WHERE a.storage_path = name AND a.finalidade = 'pagamento'));
ALTER POLICY "logados enviam projetos" ON storage.objects WITH CHECK (bucket_id = 'projetos-executivos' AND (name NOT LIKE '%/pagamentos/%' OR (public.is_compras(auth.uid()) AND EXISTS (SELECT 1 FROM public.solicitacoes s WHERE s.id::text = (storage.foldername(name))[1] AND s.status IN ('aprovada','solicitacao_pagamento')))));

CREATE OR REPLACE FUNCTION public.salvar_pagamento(p_solicitacao_id uuid,p_link text,p_instrucoes text,p_solicitar boolean DEFAULT false,p_remover_anexos uuid[] DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s public.solicitacoes;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_compras(auth.uid()) THEN RAISE EXCEPTION 'Somente Compras/Admin pode informar dados de pagamento.'; END IF;
  SELECT * INTO s FROM public.solicitacoes WHERE id = p_solicitacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF (p_solicitar AND s.status <> 'aprovada') OR (NOT p_solicitar AND s.status <> 'solicitacao_pagamento') THEN RAISE EXCEPTION 'A etapa da solicitação mudou. Atualize a página.'; END IF;
  UPDATE public.solicitacoes SET pagamento_link = p_link,pagamento_instrucoes = p_instrucoes,status = CASE WHEN p_solicitar THEN 'solicitacao_pagamento'::public.status_solicitacao ELSE status END WHERE id = p_solicitacao_id;
  DELETE FROM public.solicitacao_anexos WHERE solicitacao_id = p_solicitacao_id AND finalidade = 'pagamento' AND id = ANY(p_remover_anexos);
END; $$;
REVOKE ALL ON FUNCTION public.salvar_pagamento(uuid,text,text,boolean,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_pagamento(uuid,text,text,boolean,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.validar_dados_pagamento(),public.log_dados_pagamento(),public.proteger_anexo_pagamento(),public.log_anexo_pagamento() FROM PUBLIC,anon;
NOTIFY pgrst, 'reload schema';REVOKE ALL ON FUNCTION public.validar_dados_pagamento(),public.log_dados_pagamento(),public.proteger_anexo_pagamento(),public.log_anexo_pagamento() FROM authenticated;
CREATE OR REPLACE FUNCTION public.conferir_arquivo_pagamento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.finalidade = 'pagamento' THEN
    IF NEW.tipo_mime IS NULL OR NEW.tamanho_bytes IS NULL OR NEW.tamanho_bytes <= 0 THEN RAISE EXCEPTION 'Informe um boleto PDF ou imagem válido.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'projetos-executivos' AND name = NEW.storage_path) THEN RAISE EXCEPTION 'Envie o boleto antes de registrar os dados de pagamento.'; END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.conferir_arquivo_pagamento() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER anexos_conferir_arquivo_pagamento BEFORE INSERT ON public.solicitacao_anexos FOR EACH ROW EXECUTE FUNCTION public.conferir_arquivo_pagamento();