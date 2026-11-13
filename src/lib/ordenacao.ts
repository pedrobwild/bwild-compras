export type Ordenacao = "padrao" | "recentes" | "antigas" | "az" | "za" | "necessario_proximo" | "necessario_distante" | "previsao_proxima" | "previsao_distante";

export function ordenarRegistros<T>(registros: T[], ordem: Ordenacao, campos: { nome: (r: T) => string; data: (r: T) => string | null | undefined; necessario?: (r: T) => string | null | undefined; previsao?: (r: T) => string | null | undefined; id: (r: T) => string }): T[] {
  const copia = [...registros];
  if (ordem === "padrao") return copia;
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  return copia.sort((a, b) => {
    let resultado: number;
    if (ordem === "az" || ordem === "za") {
      resultado = collator.compare(campos.nome(a), campos.nome(b)) * (ordem === "az" ? 1 : -1);
    } else {
      const obterData = ordem.startsWith("necessario_") ? campos.necessario : ordem.startsWith("previsao_") ? campos.previsao : campos.data;
      const da = Date.parse(obterData?.(a) ?? "");
      const db = Date.parse(obterData?.(b) ?? "");
      if (!Number.isFinite(da) || !Number.isFinite(db)) {
        resultado = Number(!Number.isFinite(da)) - Number(!Number.isFinite(db));
      } else {
        const crescente = ordem === "antigas" || ordem === "necessario_proximo" || ordem === "previsao_proxima";
        resultado = (da - db) * (crescente ? 1 : -1);
      }
    }
    return resultado || campos.id(a).localeCompare(campos.id(b));
  });
}