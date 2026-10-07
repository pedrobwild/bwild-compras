import { createFileRoute } from "@tanstack/react-router";
import { ValidacaoProjeto } from "@/components/ValidacaoProjeto";
export const Route = createFileRoute("/teste-validacao")({ ssr: false, component: T });
const it = (descricao: string, categoria: string) => ({ descricao, categoria, quantidade: null, unidade: "un", ambiente: "Cozinha", especificacao: null, referencia_projeto: null, link_referencia: null, observacao: null, confianca: "media" as const });
function T() {
  return <ValidacaoProjeto nomeArquivo="teste.pdf" onClose={() => {}} onApply={(v) => { (window as unknown as { aplicado: unknown }).aplicado = v; }}
    resultado={{ extracao_id: "x1", modelo: "m", paginas: 3, resultado: { obra: { cliente: "C", empreendimento: null, unidade: null, endereco: null, area_m2: null, prazo_obra: null, data_projeto: null, revisao: null, arquiteto: null }, avisos: [], nao_comprar: [],
      itens: [it("Armário aéreo cozinha", "Marcenaria"), it("Gaveteiro", "Marcenaria"), it("Dobradiça", "Ferragens"), it("Sistema Krok para bancada", "Ferragens")] } }} />;
}
