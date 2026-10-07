import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const fmtBRL = (v: number | null | undefined) => brl.format(Number(v ?? 0));

export function fmtDate(d: string | null | undefined, pattern = "dd/MM/yyyy") {
  if (!d) return "—";
  try {
    const date = d.length === 10 ? parseISO(d + "T12:00:00") : parseISO(d);
    return format(date, pattern, { locale: ptBR });
  } catch {
    return "—";
  }
}

export function fmtBytes(b: number | null | undefined) {
  const n = Number(b ?? 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Máscara BRL: "12345" -> "123,45" */
export function maskBRL(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  const cents = Number(digits) / 100;
  return cents.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const parseBRL = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
export const numToMask = (n: number | null | undefined) =>
  n == null ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

export type Status = "nova" | "em_cotacao" | "aguardando_aprovacao" | "aprovada" | "comprada" | "entregue_parcial" | "entregue" | "cancelada";
export type Prioridade = "baixa" | "normal" | "urgente";

export const STATUS: Record<Status, { label: string; cls: string }> = {
  nova: { label: "Nova", cls: "bg-status-nova/12 text-status-nova border-status-nova/30" },
  em_cotacao: { label: "Em cotação", cls: "bg-status-cotacao/15 text-status-cotacao border-status-cotacao/35" },
  aguardando_aprovacao: { label: "Aprovação", cls: "bg-status-aprovacao/15 text-status-aprovacao border-status-aprovacao/35" },
  aprovada: { label: "Aprovado", cls: "bg-status-aprovada/12 text-status-aprovada border-status-aprovada/30" },
  comprada: { label: "Comprada", cls: "bg-status-comprada/12 text-status-comprada border-status-comprada/30" },
  entregue_parcial: { label: "Entregue parcial", cls: "bg-status-parcial/12 text-status-parcial border-status-parcial/30" },
  entregue: { label: "Entregue", cls: "bg-status-entregue/12 text-status-entregue border-status-entregue/30" },
  cancelada: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
};
export const STATUS_KEYS = Object.keys(STATUS) as Status[];

export const PRIORIDADE: Record<Prioridade, { label: string; cls: string }> = {
  baixa: { label: "Baixa", cls: "bg-muted text-muted-foreground border-border" },
  normal: { label: "Normal", cls: "bg-secondary text-secondary-foreground border-border" },
  urgente: { label: "Urgente", cls: "bg-destructive/12 text-destructive border-destructive/40" },
};

export const UNIDADES = ["un", "m²", "m", "m³", "kg", "cx", "pç", "rolo", "galão", "lata", "saco", "jogo", "kit", "conj", "vb"];
export const AMBIENTES = ["Cozinha", "Banho", "Dormitório/Estar", "Terraço", "Área de serviço", "Área técnica", "Geral"];
export const CATEGORIAS = [
  "Marcenaria", "Ferragens", "Revestimentos e pisos", "Pintura", "Iluminação", "Elétrica", "Hidráulica", "Louças e metais",
  "Bancadas e pedras", "Vidros e box", "Portas e esquadrias", "Eletrodomésticos", "Climatização", "Mobiliário",
  "Cortinas e persianas", "Decoração", "Acessórios de banheiro", "Drywall e gesso", "Outros",
];
export const FORMAS_PAGAMENTO = ["Pix", "Boleto", "Cartão", "Transferência", "Faturado"];
export const LOCAIS_ENTREGA = ["Obra", "Depósito Bwild", "Retirada no fornecedor", "Outro"];

export interface PainelRow {
  id: string;
  codigo: string;
  numero: number;
  cliente: string;
  empreendimento: string | null;
  unidade: string | null;
  titulo: string;
  prioridade: Prioridade;
  data_necessaria: string | null;
  status: Status;
  created_at: string;
  updated_at: string;
  solicitante_id: string;
  solicitante_nome: string | null;
  responsavel_compras_id: string | null;
  responsavel_nome: string | null;
  qtd_itens: number;
  qtd_anexos: number;
  custo_total: number | null;
  fornecedores: string | null;
  proxima_entrega: string | null;
  locais_entrega: string | null;
  atrasada: boolean;
  via_projeto_executivo?: boolean | null;
}
