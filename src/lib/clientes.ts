export type ClienteObraOpcao = {
  id: string;
  nome: string;
  empreendimento: string | null;
  unidade: string | null;
  endereco: string | null;
};

/** Minúsculas, sem acento, espaços simples — igual à norm_txt do banco. */
export function normalizar(t?: string | null): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export const rotuloCliente = (c: ClienteObraOpcao) =>
  [c.nome, [c.empreendimento, c.unidade].filter(Boolean).join(" ")].filter(Boolean).join(" — ");

/**
 * Sugere o cadastro que melhor bate com o nome lido na capa do projeto.
 * Nome precisa bater (igual ou um contém o outro); empreendimento/unidade desempatam.
 */
export function sugerirCliente(
  lista: ClienteObraOpcao[],
  obra: { cliente?: string; empreendimento?: string; unidade?: string },
): ClienteObraOpcao | null {
  const n = normalizar(obra.cliente);
  if (n.length < 3) return null;
  const e = normalizar(obra.empreendimento);
  const u = normalizar(obra.unidade);
  let melhor: { c: ClienteObraOpcao; p: number } | null = null;
  for (const c of lista) {
    const cn = normalizar(c.nome);
    if (!cn) continue;
    let p = cn === n ? 10 : cn.includes(n) || n.includes(cn) ? 6 : 0;
    if (!p) continue;
    if (e && normalizar(c.empreendimento) === e) p += 3;
    if (u && normalizar(c.unidade) === u) p += 2;
    if (!melhor || p > melhor.p) melhor = { c, p };
  }
  return melhor?.c ?? null;
}
