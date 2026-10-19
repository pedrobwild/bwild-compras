import type { Status } from "@/lib/format";

export function cardPosCompra(status: Status) {
  return status === "comprada" || status === "entregue_parcial" || status === "entregue";
}

export function previsaoChegada(proximaEntrega: string | null, compras: { previsao_entrega: string | null }[] = []) {
  return proximaEntrega ?? compras.flatMap((c) => c.previsao_entrega ? [c.previsao_entrega] : []).sort()[0] ?? null;
}