export type Ordenacao = "padrao" | "recentes" | "antigas" | "az" | "za";

export function ordenarRegistros<T>(registros: T[], ordem: Ordenacao, campos: { nome: (r: T) => string; data: (r: T) => string | null | undefined; id: (r: T) => string }): T[] {
  const copia = [...registros];
  if (ordem === "padrao") return copia;
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  return copia.sort((a, b) => {
    let resultado: number;
    if (ordem === "az" || ordem === "za") {
      resultado = collator.compare(campos.nome(a), campos.nome(b)) * (ordem === "az" ? 1 : -1);
    } else {
      const da = Date.parse(campos.data(a) ?? "");
      const db = Date.parse(campos.data(b) ?? "");
      if (!Number.isFinite(da) || !Number.isFinite(db)) {
        resultado = Number(!Number.isFinite(da)) - Number(!Number.isFinite(db));
      } else {
        resultado = (da - db) * (ordem === "antigas" ? 1 : -1);
      }
    }
    return resultado || campos.id(a).localeCompare(campos.id(b));
  });
}