import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Recursos opcionais do banco. Algumas telas foram publicadas antes do script SQL
 * correspondente rodar no Supabase; enquanto o recurso não existir, a tela esconde
 * o campo em vez de dar erro ao salvar. Quando o script rodar, aparece sozinho
 * (basta recarregar a página).
 */
export interface RecursosBanco {
  /** coluna solicitacoes.prazo_compra */
  prazoCompra: boolean;
  /** status 'cronograma_confirmado' no enum status_solicitacao */
  cronograma: boolean;
  /** tabela cotacao_anexos */
  anexosCotacao: boolean;
}

type ErroPg = { code?: string; message?: string } | null;

const colunaFalta = (e: ErroPg) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|could not find the '.*' column/i.test(e.message ?? ""));
const enumFalta = (e: ErroPg) => !!e && (e.code === "22P02" || /invalid input value for enum/i.test(e.message ?? ""));
const tabelaFalta = (e: ErroPg) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /could not find the table|relation .* does not exist/i.test(e.message ?? ""));

/** Enquanto a verificação não termina, nada opcional aparece (evita salvar em coluna inexistente). */
const NENHUM: RecursosBanco = { prazoCompra: false, cronograma: false, anexosCotacao: false };

export function useRecursosBanco(): RecursosBanco {
  const q = useQuery({
    queryKey: ["recursos-banco"],
    staleTime: Infinity,
    retry: 2,
    queryFn: async (): Promise<RecursosBanco> => {
      const [prazo, cronograma, anexos] = await Promise.all([
        supabase.from("solicitacoes").select("prazo_compra").limit(1),
        supabase.from("solicitacoes").select("id").eq("status", "cronograma_confirmado").limit(1),
        supabase.from("cotacao_anexos").select("id").limit(1),
      ]);
      // Só conta como existente quando a consulta funcionou. Outro erro (rede caiu, timeout) não decide nada:
      // a consulta falha, tenta de novo e, enquanto isso, os campos opcionais ficam escondidos.
      const existe = (e: ErroPg, falta: (e: ErroPg) => boolean) => {
        if (!e) return true;
        if (falta(e)) return false;
        throw new Error(e.message ?? "Falha ao verificar o banco");
      };
      return {
        prazoCompra: existe(prazo.error, colunaFalta),
        cronograma: existe(cronograma.error, enumFalta),
        anexosCotacao: existe(anexos.error, tabelaFalta),
      };
    },
  });
  return q.data ?? NENHUM;
}
