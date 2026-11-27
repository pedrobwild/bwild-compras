CREATE TABLE public.solicitacao_pagamentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
 onde_comprado text NOT NULL, valor numeric, link text, codigo text, observacao text,
 criado_por uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 legado boolean NOT NULL DEFAULT false, UNIQUE(id,solicitacao_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.solicitacao_pagamentos TO authenticated;
GRANT ALL ON public.solicitacao_pagamentos TO service_role;
ALTER TABLE public.solicitacao_pagamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pagamentos_leitura ON public.solicitacao_pagamentos FOR SELECT TO authenticated USING(true);
CREATE POLICY pagamentos_criacao ON public.solicitacao_pagamentos FOR INSERT TO authenticated WITH CHECK(public.is_compras(auth.uid()));
CREATE POLICY pagamentos_edicao ON public.solicitacao_pagamentos FOR UPDATE TO authenticated USING(public.is_compras(auth.uid())) WITH CHECK(public.is_compras(auth.uid()));
CREATE POLICY pagamentos_remocao ON public.solicitacao_pagamentos FOR DELETE TO authenticated USING(public.is_compras(auth.uid()));
CREATE INDEX pagamentos_solicitacao_idx ON public.solicitacao_pagamentos(solicitacao_id);
CREATE UNIQUE INDEX pagamentos_legado_idx ON public.solicitacao_pagamentos(solicitacao_id) WHERE legado;
ALTER TABLE public.solicitacao_itens ADD COLUMN pagamento_id uuid;
ALTER TABLE public.solicitacao_anexos ADD COLUMN pagamento_id uuid;

-- Transferência inicial, sem truncar conteúdo ou inventar vínculos de itens.
INSERT INTO public.solicitacao_pagamentos(solicitacao_id,onde_comprado,link,codigo,legado)
SELECT s.id,coalesce((SELECT c.fornecedor FROM public.cotacoes c WHERE c.solicitacao_id=s.id AND c.escolhida ORDER BY c.id LIMIT 1),'Não informado (migrado)'),s.pagamento_link,s.pagamento_instrucoes,true
FROM public.solicitacoes s WHERE nullif(btrim(s.pagamento_link),'') IS NOT NULL OR nullif(btrim(s.pagamento_instrucoes),'') IS NOT NULL OR EXISTS(SELECT 1 FROM public.solicitacao_anexos a WHERE a.solicitacao_id=s.id AND a.finalidade='pagamento')
ON CONFLICT (solicitacao_id) WHERE legado DO NOTHING;
-- O gatilho antigo não permite edição dos boletos de etapas posteriores; a transferência é feita antes da nova proteção.
ALTER TABLE public.solicitacao_anexos DISABLE TRIGGER anexos_proteger_pagamento;
UPDATE public.solicitacao_anexos a SET pagamento_id=p.id FROM public.solicitacao_pagamentos p WHERE p.solicitacao_id=a.solicitacao_id AND p.legado AND a.finalidade='pagamento' AND a.pagamento_id IS NULL;
ALTER TABLE public.solicitacao_anexos ENABLE TRIGGER anexos_proteger_pagamento;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.solicitacao_pagamentos WHERE length(link)>1000 OR length(codigo)>1000) THEN RAISE EXCEPTION 'Dados antigos excedem os limites; transferência interrompida sem perda.'; END IF;
 IF EXISTS(SELECT 1 FROM public.solicitacao_anexos WHERE finalidade='pagamento' AND pagamento_id IS NULL) THEN RAISE EXCEPTION 'Boleto antigo sem pagamento; transferência interrompida.'; END IF;
END $$;
ALTER TABLE public.solicitacao_itens ADD CONSTRAINT itens_pagamento_fk FOREIGN KEY(pagamento_id,solicitacao_id) REFERENCES public.solicitacao_pagamentos(id,solicitacao_id) ON DELETE SET NULL(pagamento_id);
ALTER TABLE public.solicitacao_anexos ADD CONSTRAINT anexos_pagamento_fk FOREIGN KEY(pagamento_id,solicitacao_id) REFERENCES public.solicitacao_pagamentos(id,solicitacao_id) ON DELETE CASCADE;
CREATE INDEX itens_pagamento_idx ON public.solicitacao_itens(pagamento_id) WHERE pagamento_id IS NOT NULL;
CREATE INDEX anexos_pagamento_idx ON public.solicitacao_anexos(pagamento_id) WHERE pagamento_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validar_pagamento_multiplo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; etapa public.status_solicitacao;
BEGIN
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.solicitacao_id ELSE NEW.solicitacao_id END;
 SELECT status INTO etapa FROM public.solicitacoes WHERE id=sid FOR UPDATE;
 IF NOT FOUND AND TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF auth.uid() IS NOT NULL AND NOT public.is_compras(auth.uid()) THEN RAISE EXCEPTION 'Somente Compras/Admin pode gerenciar pagamentos.'; END IF;
 IF auth.uid() IS NOT NULL AND etapa NOT IN ('aprovada','solicitacao_pagamento') THEN RAISE EXCEPTION 'Gerencie pagamentos em Aprovado ou Solicitação de pagamento.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.solicitacao_id<>OLD.solicitacao_id OR NEW.id<>OLD.id OR NEW.legado<>OLD.legado) THEN RAISE EXCEPTION 'Não é permitido transferir o pagamento.'; END IF;
 IF nullif(btrim(NEW.onde_comprado),'') IS NULL OR length(NEW.onde_comprado)>200 THEN RAISE EXCEPTION 'Informe onde foi comprado, até 200 caracteres.'; END IF;
 IF NEW.valor IS NOT NULL AND NEW.valor<0 THEN RAISE EXCEPTION 'O valor não pode ser negativo.'; END IF;
 IF NEW.link IS NOT NULL AND (length(NEW.link)>1000 OR (btrim(NEW.link)<>'' AND NEW.link !~* '^https?://[^/[:space:]?#]+[^[:space:]]*$')) THEN RAISE EXCEPTION 'Informe um link HTTP/HTTPS de até 1.000 caracteres.'; END IF;
 IF length(NEW.codigo)>1000 THEN RAISE EXCEPTION 'O código deve ter até 1.000 caracteres.'; END IF;
 IF length(NEW.observacao)>300 THEN RAISE EXCEPTION 'A observação deve ter até 300 caracteres.'; END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER pagamentos_validar BEFORE INSERT OR UPDATE OR DELETE ON public.solicitacao_pagamentos FOR EACH ROW EXECUTE FUNCTION public.validar_pagamento_multiplo();

CREATE OR REPLACE FUNCTION public.conferir_pagamentos_finais() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
 IF TG_TABLE_NAME='solicitacoes' THEN sid:=NEW.id; ELSE sid:=CASE WHEN TG_OP='DELETE' THEN OLD.solicitacao_id ELSE NEW.solicitacao_id END; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.solicitacoes WHERE id=sid) THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.solicitacoes WHERE id=sid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.solicitacao_pagamentos p WHERE p.solicitacao_id=sid AND nullif(btrim(p.link),'') IS NULL AND nullif(btrim(p.codigo),'') IS NULL AND NOT EXISTS(SELECT 1 FROM public.solicitacao_anexos a WHERE a.pagamento_id=p.id AND a.finalidade='pagamento')) THEN RAISE EXCEPTION 'Cada pagamento precisa de link, código ou boleto.'; END IF;
 IF EXISTS(SELECT 1 FROM public.solicitacoes WHERE id=sid AND status='solicitacao_pagamento') AND NOT EXISTS(SELECT 1 FROM public.solicitacao_pagamentos WHERE solicitacao_id=sid) THEN RAISE EXCEPTION 'Mantenha pelo menos um pagamento nesta etapa.'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER pagamentos_meios AFTER INSERT OR UPDATE OR DELETE ON public.solicitacao_pagamentos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.conferir_pagamentos_finais();
CREATE CONSTRAINT TRIGGER boletos_meios AFTER INSERT OR UPDATE OR DELETE ON public.solicitacao_anexos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.conferir_pagamentos_finais();
CREATE CONSTRAINT TRIGGER solicitacoes_meios AFTER INSERT OR UPDATE ON public.solicitacoes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.conferir_pagamentos_finais();

CREATE OR REPLACE FUNCTION public.validar_dados_pagamento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.pagamento_link IS DISTINCT FROM OLD.pagamento_link OR NEW.pagamento_instrucoes IS DISTINCT FROM OLD.pagamento_instrucoes) AND auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Use a lista de pagamentos; os campos antigos são somente para referência.'; END IF;
 IF TG_OP='UPDATE' AND NEW.status='solicitacao_pagamento' AND OLD.status<>NEW.status THEN
  IF NOT public.is_compras(auth.uid()) THEN RAISE EXCEPTION 'Somente Compras/Admin pode solicitar pagamento.'; END IF;
  IF OLD.status<>'aprovada' THEN RAISE EXCEPTION 'A solicitação de pagamento só pode ser pedida depois de Aprovado.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.proteger_anexo_pagamento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; etapa public.status_solicitacao;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.finalidade IS DISTINCT FROM OLD.finalidade OR NEW.solicitacao_id IS DISTINCT FROM OLD.solicitacao_id OR NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.pagamento_id IS DISTINCT FROM OLD.pagamento_id) THEN RAISE EXCEPTION 'Não é permitido transferir um anexo.'; END IF;
 IF TG_OP='DELETE' THEN
  IF OLD.finalidade<>'pagamento' THEN RETURN OLD; END IF; sid:=OLD.solicitacao_id;
 ELSE
  IF NEW.finalidade NOT IN ('geral','pagamento') THEN RAISE EXCEPTION 'Finalidade inválida.'; END IF;
  IF NEW.finalidade='geral' THEN IF NEW.pagamento_id IS NOT NULL THEN RAISE EXCEPTION 'Somente boletos podem ter pagamento.'; END IF; RETURN NEW; END IF;
  sid:=NEW.solicitacao_id;
  IF NEW.pagamento_id IS NULL THEN RAISE EXCEPTION 'Vincule o boleto a um pagamento.'; END IF;
  IF NEW.nome_arquivo !~* '\.(pdf|png|jpe?g)$' OR coalesce(NEW.tamanho_bytes,0)<=0 OR NEW.tamanho_bytes>52428800 OR NEW.tipo_mime IS NULL OR NEW.tipo_mime NOT IN ('application/pdf','image/png','image/jpeg') THEN RAISE EXCEPTION 'Anexe PDF, PNG, JPG ou JPEG de até 50 MB.'; END IF;
 END IF;
 SELECT status INTO etapa FROM public.solicitacoes WHERE id=sid FOR UPDATE;
 IF NOT FOUND AND TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF auth.uid() IS NOT NULL AND NOT public.is_compras(auth.uid()) THEN RAISE EXCEPTION 'Somente Compras/Admin pode gerenciar boletos.'; END IF;
 IF auth.uid() IS NOT NULL AND etapa NOT IN ('aprovada','solicitacao_pagamento') THEN RAISE EXCEPTION 'Gerencie boletos em Aprovado ou Solicitação de pagamento.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.proteger_vinculo_pagamento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE etapa public.status_solicitacao;
BEGIN
 IF (TG_OP='INSERT' AND NEW.pagamento_id IS NOT NULL) OR (TG_OP='UPDATE' AND (NEW.pagamento_id IS DISTINCT FROM OLD.pagamento_id OR (OLD.pagamento_id IS NOT NULL AND NEW.solicitacao_id IS DISTINCT FROM OLD.solicitacao_id))) THEN
  SELECT status INTO etapa FROM public.solicitacoes WHERE id=NEW.solicitacao_id FOR UPDATE;
  IF auth.uid() IS NOT NULL AND (NOT public.is_compras(auth.uid()) OR etapa NOT IN ('aprovada','solicitacao_pagamento')) THEN RAISE EXCEPTION 'Somente Compras/Admin pode vincular itens durante o pagamento.'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER itens_proteger_pagamento BEFORE INSERT OR UPDATE ON public.solicitacao_itens FOR EACH ROW EXECUTE FUNCTION public.proteger_vinculo_pagamento();
CREATE OR REPLACE FUNCTION public.log_pagamento_multiplo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.solicitacao_id ELSE NEW.solicitacao_id END;
 IF EXISTS(SELECT 1 FROM public.solicitacoes WHERE id=sid) THEN
  INSERT INTO public.solicitacao_eventos(solicitacao_id,tipo,descricao,usuario_id) VALUES(sid,'comentario',CASE WHEN TG_OP='INSERT' THEN 'Pagamento adicionado' WHEN TG_OP='DELETE' THEN 'Pagamento removido' ELSE 'Pagamento alterado' END,auth.uid());
 END IF; RETURN NULL;
END $$;
CREATE TRIGGER pagamentos_historico AFTER INSERT OR UPDATE OR DELETE ON public.solicitacao_pagamentos FOR EACH ROW EXECUTE FUNCTION public.log_pagamento_multiplo();

CREATE OR REPLACE FUNCTION public.salvar_pagamentos(p_solicitacao_id uuid,p_pagamentos jsonb,p_solicitar boolean,p_versao timestamptz) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s public.solicitacoes; p jsonb; a jsonb; iid uuid; pid uuid; kept uuid[]:='{}'; bids uuid[]; usados uuid[]:='{}';
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_compras(auth.uid()) THEN RAISE EXCEPTION 'Somente Compras/Admin pode gerenciar pagamentos.'; END IF;
 SELECT * INTO s FROM public.solicitacoes WHERE id=p_solicitacao_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
 IF p_versao IS NULL OR s.updated_at IS DISTINCT FROM p_versao THEN RAISE EXCEPTION 'A solicitação foi alterada. Reabra o diálogo antes de salvar.'; END IF;
 IF (p_solicitar AND s.status<>'aprovada') OR (NOT p_solicitar AND s.status<>'solicitacao_pagamento') THEN RAISE EXCEPTION 'A etapa mudou. Atualize a página.'; END IF;
 IF jsonb_typeof(p_pagamentos)<>'array' OR jsonb_array_length(p_pagamentos)=0 OR jsonb_array_length(p_pagamentos)>100 THEN RAISE EXCEPTION 'Informe pelo menos um pagamento válido (até 100 por edição).'; END IF;
 -- Verificar os vínculos antes de retirar os antigos.
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
 SET CONSTRAINTS pagamentos_meios,boletos_meios,solicitacoes_meios IMMEDIATE;
END $$;
REVOKE ALL ON FUNCTION public.salvar_pagamentos(uuid,jsonb,boolean,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_pagamentos(uuid,jsonb,boolean,timestamptz) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.salvar_pagamento(uuid,text,text,boolean,uuid[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.validar_pagamento_multiplo(),public.conferir_pagamentos_finais(),public.proteger_vinculo_pagamento(),public.log_pagamento_multiplo() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';CREATE INDEX itens_pagamento_solicitacao_idx ON public.solicitacao_itens(pagamento_id,solicitacao_id);
CREATE INDEX anexos_pagamento_solicitacao_idx ON public.solicitacao_anexos(pagamento_id,solicitacao_id);
ALTER POLICY pagamentos_criacao ON public.solicitacao_pagamentos WITH CHECK((select public.is_compras((select auth.uid()))));
ALTER POLICY pagamentos_edicao ON public.solicitacao_pagamentos USING((select public.is_compras((select auth.uid())))) WITH CHECK((select public.is_compras((select auth.uid()))));
ALTER POLICY pagamentos_remocao ON public.solicitacao_pagamentos USING((select public.is_compras((select auth.uid()))));
DROP TRIGGER solicitacoes_meios ON public.solicitacoes;
CREATE CONSTRAINT TRIGGER solicitacoes_meios AFTER UPDATE ON public.solicitacoes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status AND NEW.status='solicitacao_pagamento') EXECUTE FUNCTION public.conferir_pagamentos_finais();
CREATE CONSTRAINT TRIGGER solicitacoes_meios_insert AFTER INSERT ON public.solicitacoes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW.status='solicitacao_pagamento') EXECUTE FUNCTION public.conferir_pagamentos_finais();REVOKE ALL ON public.solicitacao_pagamentos FROM anon, PUBLIC;DROP TRIGGER boletos_meios ON public.solicitacao_anexos;
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
REVOKE ALL ON FUNCTION public.conferir_salvamento_pagamentos() FROM PUBLIC,anon,authenticated;DROP FUNCTION public.conferir_salvamento_pagamentos();
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