import { STATUS, type Status } from "@/lib/format";

export interface EventoStatus {
  solicitacao_id: string;
  descricao: string | null;
  created_at: string;
}

export interface SolicBasica {
  id: string;
  status: Status;
  created_at: string;
}

export interface TempoStatus {
  status: Status;
  /** cards atualmente nessa etapa */
  qtdAgora: number;
  /** média de dias que os cards atuais já estão na etapa */
  mediaDiasAgora: number | null;
  /** média de dias que os cards ficaram nessa etapa antes de sair (histórico) */
  mediaDiasHistorico: number | null;
  /** maior permanência atual na etapa (dias) */
  maxDiasAgora: number | null;
}

const DIA = 86400000;
const ORDEM = Object.keys(STATUS) as Status[];

/** Extrai o status de destino da descrição do evento ("Status alterado para Em cotação" etc.). */
export function statusDoEvento(descricao: string | null): Status | null {
  if (!descricao) return null;
  const txt = descricao.toLowerCase();
  // Procura o rótulo mais longo primeiro ("Entregue parcial" antes de "Entregue").
  const porTamanho = [...ORDEM].sort((a, b) => STATUS[b].label.length - STATUS[a].label.length);
  for (const k of porTamanho) {
    if (txt.includes(STATUS[k].label.toLowerCase())) return k;
  }
  return null;
}

/** Junta eventos de status + situação atual e calcula o tempo médio por etapa. */
export function calcularTempoPorStatus(eventos: EventoStatus[], solicitacoes: SolicBasica[], agora = Date.now()): TempoStatus[] {
  const porSolic = new Map<string, { status: Status; em: number }[]>();
  for (const e of eventos) {
    const st = statusDoEvento(e.descricao);
    if (!st) continue;
    const lista = porSolic.get(e.solicitacao_id) ?? [];
    lista.push({ status: st, em: new Date(e.created_at).getTime() });
    porSolic.set(e.solicitacao_id, lista);
  }

  const historico = new Map<Status, number[]>();
  const atual = new Map<Status, number[]>();

  for (const s of solicitacoes) {
    const criado = new Date(s.created_at).getTime();
    const evs = (porSolic.get(s.id) ?? []).sort((a, b) => a.em - b.em);
    // Linha do tempo: criação (status "nova") + cada mudança de status.
    const linha: { status: Status; em: number }[] = [{ status: "nova", em: criado }, ...evs];
    for (let i = 0; i < linha.length; i++) {
      const fim = i + 1 < linha.length ? linha[i + 1].em : agora;
      const dias = Math.max(0, (fim - linha[i].em) / DIA);
      const ehAtual = i === linha.length - 1 && linha[i].status === s.status;
      const mapa = ehAtual ? atual : historico;
      const arr = mapa.get(linha[i].status) ?? [];
      arr.push(dias);
      mapa.set(linha[i].status, arr);
    }
  }

  const media = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return ORDEM.map((status) => {
    const agr = atual.get(status) ?? [];
    const hist = historico.get(status) ?? [];
    return {
      status,
      qtdAgora: agr.length,
      mediaDiasAgora: media(agr),
      mediaDiasHistorico: media(hist),
      maxDiasAgora: agr.length ? Math.max(...agr) : null,
    };
  });
}

export const fmtDiasMedia = (v: number | null) =>
  v == null ? "—" : v < 1 ? `${Math.round(v * 24)} h` : `${v.toFixed(1).replace(".", ",")} dias`;
