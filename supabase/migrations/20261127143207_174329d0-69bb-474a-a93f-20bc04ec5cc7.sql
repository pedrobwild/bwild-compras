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