export type ClienteObraOpcao = {
  id: string;
  nome: string;
  empreendimento: string | null;
  unidade: string | null;
  endereco: string | null;
  /** Só existe em solicitações antigas; vira cadastro quando a solicitação for enviada. */
  semCadastro?: boolean;
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

/** Busca por palavras: "eric aurora" acha "Eric Fernandes — Ed. Aurora 101" (cada palavra em qualquer ordem). */
export function bateBusca(texto: string, busca: string): boolean {
  const t = normalizar(texto);
  return normalizar(busca).split(" ").filter(Boolean).every((p) => t.includes(p));
}

export type ClienteDeSolicitacao = {
  cliente: string | null;
  empreendimento: string | null;
  unidade: string | null;
  endereco_obra: string | null;
};

/**
 * Junta ao cadastro os clientes que só existem em solicitações (texto livre de antes do
 * cadastro, ou cadastro que falhou ao enviar). Esses entram com id "sol:…" e semCadastro.
 */
export function mesclarClientes(
  cadastro: ClienteObraOpcao[],
  solicitacoes: ClienteDeSolicitacao[],
): ClienteObraOpcao[] {
  const chave = (n?: string | null, e?: string | null, u?: string | null) =>
    [normalizar(n), normalizar(e), normalizar(u)].join("|");
  const vistos = new Set(cadastro.map((c) => chave(c.nome, c.empreendimento, c.unidade)));
  const extras: ClienteObraOpcao[] = [];
  for (const s of solicitacoes) {
    const nome = s.cliente?.trim();
    if (!nome) continue;
    const k = chave(nome, s.empreendimento, s.unidade);
    if (vistos.has(k)) continue;
    vistos.add(k);
    extras.push({
      id: `sol:${k}`, nome, empreendimento: s.empreendimento?.trim() || null,
      unidade: s.unidade?.trim() || null, endereco: s.endereco_obra?.trim() || null, semCadastro: true,
    });
  }
  return [...cadastro, ...extras].sort((a, b) => normalizar(a.nome).localeCompare(normalizar(b.nome)));
}
