/**
 * Prazos em datas de calendário ("yyyy-MM-dd"), sem fuso: o banco calcula o mesmo
 * (prazo_compra = data_necessaria - prazo_fornecedor_dias, em dias corridos).
 * Seguro para navegador e servidor.
 */
const MS_DIA = 86_400_000;
export const PRAZO_FORNECEDOR_MAX = 365;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const paraUTC = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a ?? 0, (m ?? 1) - 1, d ?? 1);
};
const deUTC = (t: number) => new Date(t).toISOString().slice(0, 10);

export const dataValida = (iso: string | null | undefined): iso is string => !!iso && DATA_ISO.test(iso);

export function somarDias(iso: string, dias: number) {
  return deUTC(paraUTC(iso) + dias * MS_DIA);
}

/** Dias corridos de `de` até `ate` (negativo se `ate` vem antes). */
export function diferencaDias(de: string, ate: string) {
  return Math.round((paraUTC(ate) - paraUTC(de)) / MS_DIA);
}

/** "Comprar até" = data na obra menos o prazo do fornecedor. */
export function calcularComprarAte(dataObra: string | null | undefined, prazoDias: number | null | undefined) {
  if (!dataValida(dataObra) || prazoDias == null || !Number.isInteger(prazoDias) || prazoDias < 0) return null;
  return somarDias(dataObra, -prazoDias);
}

export const prazoVencido = (data: string | null | undefined, hoje: string) => dataValida(data) && data < hoje;

/** Prazo do fornecedor digitado: inteiro de 0 a 365; vazio ou inválido devolve null. */
export function lerPrazoDias(texto: string | number | null | undefined) {
  const t = String(texto ?? "").trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n <= PRAZO_FORNECEDOR_MAX ? n : null;
}

/** Ao escolher uma cotação: pergunta só quando ela traz um prazo válido diferente do informado. */
export function devePerguntarPrazo(atual: number | null | undefined, daCotacao: number | null | undefined) {
  return daCotacao != null && Number.isInteger(daCotacao) && daCotacao >= 0 && daCotacao <= PRAZO_FORNECEDOR_MAX && daCotacao !== atual;
}

/** Hoje no fuso de São Paulo. */
export function hojeSP(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}
