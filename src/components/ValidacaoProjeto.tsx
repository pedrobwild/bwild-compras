import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, Copy, ExternalLink, Plus, Search, Trash2, X, Loader2, FileSearch } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AMBIENTES, CATEGORIAS, UNIDADES, fmtDate } from "@/lib/format";
import { extrairProjeto, type Confianca, type ResultadoExtracao } from "@/lib/extracao";
import { cn } from "@/lib/utils";

export interface VItem {
  key: string;
  descricao: string;
  categoria: string;
  quantidade: string;
  unidade: string;
  ambiente: string;
  especificacao: string;
  referencia_projeto: string;
  link_referencia: string;
  observacao: string;
  confianca: Confianca;
  revisado: boolean;
  manual?: boolean;
}

export interface ObraEditavel {
  cliente: string;
  empreendimento: string;
  unidade: string;
  endereco: string;
  area_m2: string;
  prazo_obra: string;
}

export interface ValidacaoAplicada {
  extracao_id: string;
  obra: ObraEditavel;
  area_m2: number | null;
  prazo_obra: string | null;
  avisos: string[];
  itens: (Omit<VItem, "key" | "quantidade" | "confianca" | "revisado"> & { quantidade: number | null })[];
}

interface Rascunho {
  extracao_id: string;
  obra: ObraEditavel;
  avisos: string[];
  itens: VItem[];
  naoComprar: ResultadoExtracao["resultado"]["nao_comprar"];
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
/** Garante id único e estável em cada item (rascunhos antigos podem não ter). */
const comIds = (itens: VItem[]) => {
  const vistos = new Set<string>();
  return itens.map((i) => {
    const key = i.key && !vistos.has(i.key) ? i.key : uid();
    vistos.add(key);
    return { ...i, key };
  });
};
const draftKey = (nome: string) => `bwild-validacao:${nome}`;
export const limparRascunho = (nome: string) => {
  try { localStorage.removeItem(draftKey(nome)); } catch { /* ignore */ }
};
export const parseQtd = (s: string) => {
  const n = Number(String(s).replace(/\./g, (m, i, str) => (str.includes(",") ? "" : m)).replace(",", "."));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
};
const toStr = (v: unknown) => (v == null ? "" : String(v));

function inicial(r: ResultadoExtracao): Rascunho {
  const o = r.resultado.obra;
  return {
    extracao_id: r.extracao_id,
    obra: {
      cliente: toStr(o.cliente), empreendimento: toStr(o.empreendimento), unidade: toStr(o.unidade),
      endereco: toStr(o.endereco), area_m2: o.area_m2 != null ? String(o.area_m2).replace(".", ",") : "", prazo_obra: toStr(o.prazo_obra),
    },
    avisos: [...r.resultado.avisos],
    naoComprar: [...r.resultado.nao_comprar],
    itens: r.resultado.itens.map((i) => ({
      key: uid(),
      descricao: toStr(i.descricao),
      categoria: CATEGORIAS.includes(i.categoria ?? "") ? i.categoria! : "Outros",
      quantidade: i.quantidade != null ? String(i.quantidade).replace(".", ",") : "",
      unidade: UNIDADES.includes(i.unidade ?? "") ? i.unidade! : "un",
      ambiente: AMBIENTES.includes(i.ambiente ?? "") ? i.ambiente! : "",
      especificacao: toStr(i.especificacao),
      referencia_projeto: toStr(i.referencia_projeto),
      link_referencia: toStr(i.link_referencia),
      observacao: toStr(i.observacao),
      confianca: i.confianca ?? "media",
      revisado: false,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Hook: leitura do PDF + modal de progresso + tela de validação       */
/* ------------------------------------------------------------------ */

export function useLeituraProjeto(
  onApply: (v: ValidacaoAplicada, nomeArquivo: string) => void | Promise<void>,
  opcoes?: {
    /** Itens gravados direto no banco (quantidade obrigatória): não deixa aplicar com quantidade em branco. */
    exigirQuantidade?: boolean;
  },
) {
  const [etapa, setEtapa] = useState<null | { tipo: "pdf"; atual: number; total: number } | { tipo: "ia" }>(null);
  const [res, setRes] = useState<{ nome: string; r: ResultadoExtracao } | null>(null);

  const ler = async (file: File | Blob, nome: string) => {
    setEtapa({ tipo: "pdf", atual: 0, total: 0 });
    try {
      const { extrairTextoPdf } = await import("@/lib/pdfText");
      const paginas = await extrairTextoPdf(file, (atual, total) => setEtapa({ tipo: "pdf", atual, total }));
      setEtapa({ tipo: "ia" });
      const r = await extrairProjeto(nome, paginas);
      setRes({ nome, r });
    } catch (e) {
      toast.error((e as Error).message, { duration: 10000, description: "Você pode seguir preenchendo os itens manualmente." });
    } finally {
      setEtapa(null);
    }
  };

  const element = (
    <>
      <Dialog open={!!etapa}>
        <DialogContent className="sm:max-w-md [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-accent" /> Lendo projeto executivo</DialogTitle>
            <DialogDescription>Não feche esta janela.</DialogDescription>
          </DialogHeader>
          {etapa?.tipo === "pdf" ? (
            <div className="space-y-2">
              <p className="text-sm">{etapa.total ? `Lendo o PDF — folha ${etapa.atual} de ${etapa.total}` : "Abrindo o PDF…"}</p>
              <Progress value={etapa.total ? (etapa.atual / etapa.total) * 100 : 5} />
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Identificando itens com IA (pode levar até 1 minuto)…</p>
          )}
        </DialogContent>
      </Dialog>
      {res && (
        <ValidacaoProjeto
          nomeArquivo={res.nome}
          resultado={res.r}
          exigirQuantidade={opcoes?.exigirQuantidade}
          onClose={() => setRes(null)}
          onApply={async (v) => {
            await onApply(v, res.nome);
            limparRascunho(res.nome);
            setRes(null);
          }}
        />
      )}
    </>
  );
  return { ler, element, ocupado: !!etapa };
}

/* ------------------------------------------------------------------ */

const CONF: Record<Confianca | "revisado" | "manual", { label: string; cls: string }> = {
  alta: { label: "Alta", cls: "border-status-entregue/40 bg-status-entregue/10 text-status-entregue" },
  media: { label: "Revisar", cls: "border-status-cotacao/40 bg-status-cotacao/15 text-status-cotacao" },
  baixa: { label: "Revisar com atenção", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  revisado: { label: "Revisado", cls: "border-border bg-muted text-muted-foreground" },
  manual: { label: "Manual", cls: "border-border bg-muted text-muted-foreground" },
};

export function ValidacaoProjeto({
  nomeArquivo, resultado, onClose, onApply, exigirQuantidade,
}: {
  nomeArquivo: string;
  resultado: ResultadoExtracao;
  onClose: () => void;
  onApply: (v: ValidacaoAplicada) => void | Promise<void>;
  exigirQuantidade?: boolean;
}) {
  const [d, setD] = useState<Rascunho>(() => {
    try {
      const raw = localStorage.getItem(draftKey(nomeArquivo));
      if (raw) {
        const r = JSON.parse(raw) as Rascunho;
        if (r.extracao_id === resultado.extracao_id) return { ...r, itens: comIds(r.itens ?? []) };
      }
    } catch { /* ignore */ }
    return inicial(resultado);
  });
  useEffect(() => {
    try { localStorage.setItem(draftKey(nomeArquivo), JSON.stringify(d)); } catch { /* ignore */ }
  }, [d, nomeArquivo]);

  const [busca, setBusca] = useState("");
  const [fCat, setFCat] = useState("todas");
  const [fAmb, setFAmb] = useState("todos");
  // Os filtros guardam quais itens mostrar no momento em que foram ligados: assim o item não some
  // da tela enquanto a pessoa ainda está digitando nele (antes sumia na primeira tecla).
  const [revisarKeys, setRevisarKeys] = useState<Set<string> | null>(null);
  const [semQtdKeys, setSemQtdKeys] = useState<Set<string> | null>(null);
  const filtrarRevisar = (on: boolean) =>
    setRevisarKeys(on ? new Set(d.itens.filter((i) => i.confianca !== "alta" && !i.revisado).map((i) => i.key)) : null);
  const filtrarSemQtd = (on: boolean) =>
    setSemQtdKeys(on ? new Set(d.itens.filter((i) => parseQtd(i.quantidade) == null).map((i) => i.key)) : null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [novoAviso, setNovoAviso] = useState("");
  const [ncAberto, setNcAberto] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const o = resultado.resultado.obra;

  const setItem = (key: string, patch: Partial<VItem>) =>
    setD((p) => ({ ...p, itens: p.itens.map((i) => (i.key === key ? { ...i, ...patch, revisado: i.confianca !== "alta" ? true : i.revisado } : i)) }));

  const remover = (keys: string[]) => {
    const snapshot = d.itens;
    setD((p) => ({ ...p, itens: p.itens.filter((i) => !keys.includes(i.key)) }));
    setSel((s) => new Set([...s].filter((k) => !keys.includes(k))));
    toast(`${keys.length} item(ns) excluído(s)`, {
      duration: 5000,
      action: { label: "Desfazer", onClick: () => setD((p) => ({ ...p, itens: snapshot })) },
    });
  };
  const duplicar = (key: string) => {
    const novo = uid();
    setD((p) => {
      const i = p.itens.findIndex((x) => x.key === key);
      const c = [...p.itens];
      c.splice(i + 1, 0, { ...p.itens[i], key: novo });
      return { ...p, itens: c };
    });
    // A cópia aparece mesmo com um filtro ligado.
    setRevisarKeys((s) => (s ? new Set(s).add(novo) : s));
    setSemQtdKeys((s) => (s ? new Set(s).add(novo) : s));
  };
  const adicionar = () => {
    const it: VItem = {
      key: uid(), descricao: "", categoria: fCat !== "todas" ? fCat : "Outros", quantidade: "", unidade: "un", ambiente: fAmb !== "todos" ? fAmb : "",
      especificacao: "", referencia_projeto: "", link_referencia: "", observacao: "", confianca: "alta", revisado: false, manual: true,
    };
    setD((p) => ({ ...p, itens: [it, ...p.itens] }));
    setBusca("");
    setRevisarKeys(null);
    setSemQtdKeys(null);
  };
  const emMassa = (patch: Partial<VItem>) => {
    setD((p) => ({ ...p, itens: p.itens.map((i) => (sel.has(i.key) ? { ...i, ...patch, revisado: i.confianca !== "alta" ? true : i.revisado } : i)) }));
    toast.success(`${sel.size} item(ns) atualizado(s)`);
  };

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return d.itens.filter((i) => {
      if (fCat !== "todas" && i.categoria !== fCat) return false;
      if (fAmb !== "todos" && i.ambiente !== fAmb) return false;
      if (revisarKeys && !revisarKeys.has(i.key)) return false;
      if (semQtdKeys && !semQtdKeys.has(i.key)) return false;
      if (t && ![i.descricao, i.especificacao, i.referencia_projeto, i.observacao].some((v) => v.toLowerCase().includes(t))) return false;
      return true;
    });
  }, [d.itens, busca, fCat, fAmb, revisarKeys, semQtdKeys]);

  const grupos = useMemo(() => {
    const m = new Map<string, VItem[]>();
    for (const i of filtrados) m.set(i.categoria, [...(m.get(i.categoria) ?? []), i]);
    return [...m.entries()].sort((a, b) => CATEGORIAS.indexOf(a[0]) - CATEGORIAS.indexOf(b[0]));
  }, [filtrados]);

  const paraRevisar = d.itens.filter((i) => i.confianca !== "alta" && !i.revisado).length;

  const aplicar = async () => {
    const semDesc = d.itens.filter((i) => !i.descricao.trim());
    if (semDesc.length) return toast.error(`${semDesc.length} item(ns) sem descrição. Preencha ou exclua antes de aplicar.`);
    if (d.itens.length === 0) return toast.error("Nenhum item para aplicar.");
    const semQtd = d.itens.filter((i) => parseQtd(i.quantidade) == null).length;
    if (semQtd && exigirQuantidade) {
      // Sem isso o banco recusava o lote inteiro (quantidade é obrigatória) e o card ficava sem itens.
      // Mostra só os itens sem quantidade, sem outro filtro escondendo algum deles.
      filtrarSemQtd(true);
      setRevisarKeys(null);
      setBusca("");
      setFCat("todas");
      setFAmb("todos");
      setFechados(new Set());
      return toast.error(`${semQtd} item(ns) sem quantidade. Informe a quantidade ou exclua esses itens antes de aplicar.`);
    }
    if (semQtd) toast.warning(`${semQtd} item(ns) sem quantidade — informe antes de enviar a solicitação.`);
    setAplicando(true);
    try {
      await onApply({
        extracao_id: d.extracao_id,
        obra: d.obra,
        area_m2: parseQtd(d.obra.area_m2),
        prazo_obra: d.obra.prazo_obra.trim() || null,
        avisos: d.avisos.filter((a) => a.trim()),
        itens: d.itens.map(({ key: _k, confianca: _c, revisado: _r, manual: _m, quantidade, ...rest }) => ({ ...rest, quantidade: parseQtd(quantidade) })),
      });
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:rounded-none">
        <DialogHeader className="border-b px-4 py-3 text-left md:px-6">
          <DialogTitle>Validar itens identificados no projeto</DialogTitle>
          <DialogDescription className="space-y-0.5">
            <span className="block truncate font-medium text-foreground">{nomeArquivo}</span>
            <span className="block">{resultado.paginas} folhas lidas · {d.itens.length} itens identificados{paraRevisar ? ` · ${paraRevisar} para revisar` : ""}</span>
            <span className="block">Confira, edite, adicione ou exclua antes de aplicar à solicitação.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden bg-muted/30 px-3 py-4 md:px-6">
          {/* Bloco 1 */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold">Dados da obra</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {([
                ["cliente", "Cliente"], ["empreendimento", "Empreendimento"], ["unidade", "Unidade"],
                ["endereco", "Endereço"], ["area_m2", "Área (m²)"], ["prazo_obra", "Prazo de obra"],
              ] as const).map(([k, l]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{l}</Label>
                  <Input value={d.obra[k]} inputMode={k === "area_m2" ? "decimal" : undefined} onChange={(e) => setD((p) => ({ ...p, obra: { ...p.obra, [k]: e.target.value } }))} />
                </div>
              ))}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div><dt className="text-muted-foreground">Data do projeto</dt><dd>{o.data_projeto ? (/^\d{4}-\d{2}-\d{2}/.test(o.data_projeto) ? fmtDate(o.data_projeto.slice(0, 10)) : o.data_projeto) : "—"}</dd></div>
              <div><dt className="text-muted-foreground">Revisão</dt><dd>{o.revisao || "—"}</dd></div>
              <div className="min-w-0"><dt className="text-muted-foreground">Arquiteto</dt><dd className="break-words">{o.arquiteto || "—"}</dd></div>
            </dl>
          </section>

          {/* Bloco 2 */}
          <section className="rounded-lg border border-status-cotacao/40 bg-status-cotacao/10 p-4">
            <h3 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-status-cotacao" /> Avisos para Compras</h3>
            <p className="text-xs text-muted-foreground">Serão adicionados à descrição da solicitação.</p>
            <ul className="mt-3 space-y-2">
              {d.avisos.length === 0 && <li className="text-sm text-muted-foreground">Nenhum aviso.</li>}
              {d.avisos.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Textarea rows={1} value={a} className="min-h-9 flex-1 resize-none bg-card text-sm field-sizing-content" onChange={(e) => setD((p) => ({ ...p, avisos: p.avisos.map((x, j) => (j === i ? e.target.value : x)) }))} />
                  <button type="button" aria-label="Excluir aviso" title="Excluir aviso" className="flex h-9 w-9 items-center justify-center rounded hover:bg-card" onClick={() => setD((p) => ({ ...p, avisos: p.avisos.filter((_, j) => j !== i) }))}><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Input className="bg-card" placeholder="Novo aviso" value={novoAviso} onChange={(e) => setNovoAviso(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && novoAviso.trim()) { e.preventDefault(); setD((p) => ({ ...p, avisos: [...p.avisos, novoAviso.trim()] })); setNovoAviso(""); } }} />
              <Button type="button" variant="outline" onClick={() => { if (novoAviso.trim()) { setD((p) => ({ ...p, avisos: [...p.avisos, novoAviso.trim()] })); setNovoAviso(""); } }}><Plus className="h-4 w-4" /> Adicionar</Button>
            </div>
          </section>

          {/* Bloco 3 */}
          <section className="rounded-lg border bg-card p-3 md:p-4">
            <h3 className="font-semibold">Itens identificados</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_200px_180px_auto_auto_auto]">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar item" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <Select value={fCat} onValueChange={setFCat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todas">Todas as categorias</SelectItem>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={fAmb} onValueChange={setFAmb}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos os ambientes</SelectItem>{AMBIENTES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <label className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm">
                <Checkbox checked={!!revisarKeys} onCheckedChange={(v) => filtrarRevisar(!!v)} /> Somente para revisar
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm">
                <Checkbox checked={!!semQtdKeys} onCheckedChange={(v) => filtrarSemQtd(!!v)} /> Somente sem quantidade
              </label>
              <Button type="button" onClick={adicionar}><Plus className="h-4 w-4" /> Adicionar item</Button>
            </div>

            {sel.size > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-sm">
                <span className="font-medium">{sel.size} selecionado(s)</span>
                <Select value="" onValueChange={(v) => emMassa({ categoria: v })}>
                  <SelectTrigger className="h-9 w-48 bg-card"><SelectValue placeholder="Alterar categoria" /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Select value="" onValueChange={(v) => emMassa({ ambiente: v })}>
                  <SelectTrigger className="h-9 w-44 bg-card"><SelectValue placeholder="Alterar ambiente" /></SelectTrigger>
                  <SelectContent>{AMBIENTES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" size="sm" variant="destructive" onClick={() => remover([...sel])}><Trash2 className="h-4 w-4" /> Excluir</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpar seleção</Button>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {grupos.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum item com esses filtros.</p>}
              {grupos.map(([cat, list]) => {
                const aberto = !fechados.has(cat);
                const todos = list.every((i) => sel.has(i.key));
                return (
                  <div key={cat} className="rounded-md border">
                    <div className="flex items-center gap-2 bg-muted/60 px-3 py-2">
                      <Checkbox aria-label={`Selecionar ${cat}`} checked={todos} onCheckedChange={(v) => setSel((s) => { const n = new Set(s); list.forEach((i) => (v ? n.add(i.key) : n.delete(i.key))); return n; })} />
                      <button type="button" aria-expanded={aberto} aria-label={`${aberto ? "Recolher" : "Expandir"} grupo ${cat}`} title={aberto ? "Recolher grupo" : "Expandir grupo"} className="flex min-h-9 flex-1 items-center gap-1.5 text-left text-sm font-semibold" onClick={() => setFechados((s) => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; })}>
                        {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {cat}
                        <span className="font-normal text-muted-foreground">({list.length})</span>
                      </button>
                    </div>
                    {aberto && (
                      <div className="divide-y">
                        {list.map((i) => (
                          <ItemLinha key={i.key} i={i} selecionado={sel.has(i.key)}
                            onSel={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(i.key); else n.delete(i.key); return n; })}
                            onChange={(p) => setItem(i.key, p)} onDup={() => duplicar(i.key)} onDel={() => remover([i.key])} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Bloco 4 */}
          {d.naoComprar.length > 0 && (
            <section className="rounded-lg border bg-card">
              <button type="button" className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left font-semibold" onClick={() => setNcAberto(!ncAberto)}>
                {ncAberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Itens que o projeto manda manter/aproveitar (não comprar) <span className="font-normal text-muted-foreground">({d.naoComprar.length})</span>
              </button>
              {ncAberto && (
                <ul className="divide-y border-t">
                  {d.naoComprar.map((n, idx) => (
                    <li key={idx} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{n.descricao}</p>
                        <p className="text-xs text-muted-foreground">{[n.motivo, n.referencia_projeto].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => setD((p) => ({
                        ...p,
                        naoComprar: p.naoComprar.filter((_, j) => j !== idx),
                        itens: [...p.itens, {
                          key: uid(), descricao: n.descricao, categoria: "Outros", quantidade: "", unidade: "un", ambiente: "", especificacao: "",
                          referencia_projeto: n.referencia_projeto ?? "", link_referencia: "", observacao: n.motivo ?? "", confianca: "media", revisado: false,
                        }],
                      }))}><Plus className="h-4 w-4" /> Incluir na compra</Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t bg-card px-4 py-3 md:px-6 lg:pr-40">
          <span className="mr-auto text-sm"><strong className="tabular-nums">{d.itens.length}</strong> itens serão adicionados</span>
          <Button type="button" variant="ghost" onClick={() => { limparRascunho(nomeArquivo); onClose(); }}>Descartar leitura</Button>
          <Button type="button" onClick={aplicar} disabled={aplicando}>{aplicando ? "Aplicando…" : "Aplicar à solicitação"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemLinha({ i, selecionado, onSel, onChange, onDup, onDel }: {
  i: VItem; selecionado: boolean; onSel: (v: boolean) => void; onChange: (p: Partial<VItem>) => void; onDup: () => void; onDel: () => void;
}) {
  const conf = CONF[i.manual ? "manual" : i.revisado ? "revisado" : i.confianca];
  const semQtd = parseQtd(i.quantidade) == null;
  return (
    <div className={cn("space-y-2 p-3", i.confianca === "baixa" && !i.revisado && "bg-destructive/5")}>
      <div className="flex items-center gap-2">
        <Checkbox aria-label="Selecionar item" checked={selecionado} onCheckedChange={(v) => onSel(!!v)} />
        <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-medium", conf.cls)}>{conf.label}</span>
        <div className="ml-auto flex">
          <button type="button" aria-label="Duplicar item" title="Duplicar item" onClick={onDup} className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:bg-muted"><Copy className="h-4 w-4" /></button>
          <button type="button" aria-label="Excluir item" title="Excluir item" onClick={onDel} className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-6 lg:grid-cols-12">
        <div className="space-y-1 sm:col-span-6 lg:col-span-5">
          <Label className="text-xs">Descrição *</Label>
          <Input value={i.descricao} onChange={(e) => onChange({ descricao: e.target.value })} className={cn(!i.descricao.trim() && "border-destructive")} />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-2">
          <Label className="text-xs">Categoria</Label>
          <Select value={i.categoria} onValueChange={(v) => onChange({ categoria: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-1 lg:col-span-1">
          <Label className={cn("text-xs", semQtd && "text-status-cotacao")}>{semQtd ? "Qtd (informar)" : "Qtd"}</Label>
          <Input inputMode="decimal" value={i.quantidade} placeholder="informar" onChange={(e) => onChange({ quantidade: e.target.value })} className={cn(semQtd && "border-status-cotacao bg-status-cotacao/10")} />
        </div>
        <div className="space-y-1 sm:col-span-1 lg:col-span-1">
          <Label className="text-xs">Un.</Label>
          <Select value={i.unidade} onValueChange={(v) => onChange({ unidade: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{UNIDADES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label className="text-xs">Ambiente</Label>
          <Select value={i.ambiente || undefined} onValueChange={(v) => onChange({ ambiente: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{AMBIENTES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-6 lg:col-span-5">
          <Label className="text-xs">Especificação</Label>
          <Textarea rows={1} value={i.especificacao} className="min-h-10 resize-none field-sizing-content" onChange={(e) => onChange({ especificacao: e.target.value })} />
        </div>
        <div className="space-y-1 sm:col-span-3 lg:col-span-2">
          <Label className="text-xs">Folha/referência</Label>
          <Input value={i.referencia_projeto} onChange={(e) => onChange({ referencia_projeto: e.target.value })} />
        </div>
        <div className="space-y-1 sm:col-span-3 lg:col-span-2">
          <Label className="text-xs">Link</Label>
          <div className="flex gap-1">
            <Input value={i.link_referencia} placeholder="https://" onChange={(e) => onChange({ link_referencia: e.target.value })} />
            {/^https?:\/\//i.test(i.link_referencia) && (
              <a href={i.link_referencia} target="_blank" rel="noopener noreferrer" aria-label="Abrir link" title="Abrir link em nova aba" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border hover:bg-muted"><ExternalLink className="h-4 w-4" /></a>
            )}
          </div>
        </div>
        <div className="space-y-1 sm:col-span-6 lg:col-span-3">
          <Label className="text-xs">Observação</Label>
          <Input value={i.observacao} onChange={(e) => onChange({ observacao: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
