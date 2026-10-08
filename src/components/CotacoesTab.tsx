import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileText, Image as ImageIcon, Paperclip, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingList } from "@/components/States";
import { fmtBRL, fmtDate, maskBRL, numToMask, parseBRL } from "@/lib/format";
import { signedUrl, uploadArquivoCotacao } from "@/lib/upload";
import { cn } from "@/lib/utils";

interface Cotacao {
  id: string;
  fornecedor: string;
  fornecedor_contato: string | null;
  valor_total: number | null;
  prazo_entrega_dias: number | null;
  condicao_pagamento: string | null;
  validade: string | null;
  comentario: string | null;
  escolhida: boolean;
}

interface CotacaoAnexo {
  id: string;
  cotacao_id: string;
  nome_arquivo: string;
  storage_path: string;
  tamanho_bytes: number | null;
  tipo_mime: string | null;
}

const ACCEPT_ANEXO = ".pdf,.png,.jpg,.jpeg";

export function CotacoesTab({ solicitacaoId, podeEditar }: { solicitacaoId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const key = ["cotacoes", solicitacaoId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("cotacoes").select("*").eq("solicitacao_id", solicitacaoId).order("created_at");
      if (error) throw error;
      return (data ?? []) as Cotacao[];
    },
    retry: false,
  });
  const [edit, setEdit] = useState<Cotacao | null | "new">(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["cotacao-anexos", solicitacaoId] });
  };

  const anexosQ = useQuery({
    queryKey: ["cotacao-anexos", solicitacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cotacao_anexos")
        .select("*")
        .order("created_at");
      if (error) {
        if (/cotacao_anexos|schema cache|does not exist/i.test(error.message)) return [] as CotacaoAnexo[];
        throw error;
      }
      return (data ?? []) as CotacaoAnexo[];
    },
    retry: false,
  });
  const anexosPorCotacao = new Map<string, CotacaoAnexo[]>();
  for (const a of anexosQ.data ?? []) {
    const l = anexosPorCotacao.get(a.cotacao_id) ?? [];
    l.push(a);
    anexosPorCotacao.set(a.cotacao_id, l);
  }

  useEffect(() => {
    const ch = supabase
      .channel(`cot-${solicitacaoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cotacoes", filter: `solicitacao_id=eq.${solicitacaoId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cotacao_anexos" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitacaoId]);

  const anexar = async (cotacaoId: string, files: FileList | null) => {
    if (!files?.length) return;
    setEnviando(cotacaoId);
    try {
      for (const file of Array.from(files)) {
        const path = await uploadArquivoCotacao(solicitacaoId, cotacaoId, file);
        const { error } = await supabase.from("cotacao_anexos").insert({
          cotacao_id: cotacaoId,
          nome_arquivo: file.name,
          storage_path: path,
          tamanho_bytes: file.size,
          tipo_mime: file.type || null,
        });
        if (error) throw error;
      }
      toast.success(files.length > 1 ? `${files.length} anexos enviados` : "Anexo enviado");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar anexo");
    } finally {
      setEnviando(null);
    }
  };

  const abrirAnexo = async (a: CotacaoAnexo) => {
    try {
      window.open(await signedUrl(a.storage_path), "_blank", "noopener");
    } catch {
      toast.error("Não foi possível abrir o anexo");
    }
  };

  const excluirAnexo = async (a: CotacaoAnexo) => {
    if (!confirm(`Excluir o anexo ${a.nome_arquivo}?`)) return;
    const { error } = await supabase.from("cotacao_anexos").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Anexo excluído");
    refresh();
  };

  if (q.isLoading) return <LoadingList />;
  if (q.error) {
    const msg = (q.error as { message?: string }).message ?? "";
    const faltaTabela = /cotacoes|schema cache|does not exist/i.test(msg);
    return <ErrorState message={faltaTabela ? "As cotações ainda não foram ativadas no banco. Rode o script cotacoes.sql no Supabase." : "Erro ao carregar cotações: " + msg} />;
  }
  const rows = q.data ?? [];
  const comValor = rows.filter((r) => r.valor_total != null);
  const menorValor = comValor.length ? Math.min(...comValor.map((r) => Number(r.valor_total))) : null;
  const comPrazo = rows.filter((r) => r.prazo_entrega_dias != null);
  const menorPrazo = comPrazo.length ? Math.min(...comPrazo.map((r) => r.prazo_entrega_dias!)) : null;

  const escolher = async (c: Cotacao) => {
    const novo = !c.escolhida;
    if (novo) await supabase.from("cotacoes").update({ escolhida: false }).eq("solicitacao_id", solicitacaoId).neq("id", c.id);
    const { error } = await supabase.from("cotacoes").update({ escolhida: novo }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(novo ? `${c.fornecedor} marcado como escolhido` : "Escolha removida");
    refresh();
  };
  const excluir = async (c: Cotacao) => {
    if (!confirm(`Excluir a cotação de ${c.fornecedor}?`)) return;
    const { error } = await supabase.from("cotacoes").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Cotação excluída");
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Compare preço, prazo e condições de cada fornecedor antes de comprar.</p>
        {podeEditar && <Button onClick={() => setEdit("new")}><Plus className="mr-1 h-4 w-4" />Adicionar cotação</Button>}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={podeEditar ? "Nenhuma cotação ainda — adicione a primeira" : "Compras ainda não registrou cotações"} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <div key={c.id} className={cn("rounded-lg border bg-card p-4 space-y-3", c.escolhida && "border-primary ring-2 ring-primary/30")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{c.fornecedor}</p>
                  {c.fornecedor_contato && <p className="text-xs text-muted-foreground truncate">{c.fornecedor_contato}</p>}
                </div>
                {c.escolhida && <Badge className="shrink-0"><Trophy className="mr-1 h-3 w-3" />Escolhida</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Preço</p>
                  <p className="font-semibold tabular-nums">{c.valor_total != null ? fmtBRL(c.valor_total) : "—"}</p>
                  {menorValor != null && c.valor_total != null && Number(c.valor_total) === menorValor && comValor.length > 1 && (
                    <Badge variant="outline" className="mt-1 text-[10px]">Menor preço</Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Prazo</p>
                  <p className="font-semibold tabular-nums">{c.prazo_entrega_dias != null ? `${c.prazo_entrega_dias} dias` : "—"}</p>
                  {menorPrazo != null && c.prazo_entrega_dias === menorPrazo && comPrazo.length > 1 && (
                    <Badge variant="outline" className="mt-1 text-[10px]">Menor prazo</Badge>
                  )}
                </div>
                <div><p className="text-xs text-muted-foreground">Pagamento</p><p>{c.condicao_pagamento || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Validade</p><p>{fmtDate(c.validade)}</p></div>
              </div>
              {c.comentario && <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm">{c.comentario}</p>}
              <div className="space-y-1.5">
                {(anexosPorCotacao.get(c.id) ?? []).map((a) => {
                  const isImg = /^image\//.test(a.tipo_mime ?? "") || /\.(png|jpe?g)$/i.test(a.nome_arquivo);
                  return (
                    <div key={a.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                      {isImg ? <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <button
                        type="button"
                        onClick={() => abrirAnexo(a)}
                        className="min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline"
                        title={`Abrir ${a.nome_arquivo}`}
                      >
                        {a.nome_arquivo}
                      </button>
                      {podeEditar && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => excluirAnexo(a)} aria-label={`Excluir anexo ${a.nome_arquivo}`} title="Excluir anexo">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                {podeEditar && (
                  <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/50", enviando === c.id && "pointer-events-none opacity-50")}>
                    <Paperclip className="h-3.5 w-3.5" />
                    {enviando === c.id ? "Enviando…" : "Anexar PDF ou imagem"}
                    <input
                      type="file"
                      accept={ACCEPT_ANEXO}
                      multiple
                      className="hidden"
                      aria-label="Anexar arquivo à cotação"
                      onChange={(e) => { anexar(c.id, e.target.files); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>
              {podeEditar && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant={c.escolhida ? "secondary" : "default"} onClick={() => escolher(c)}>
                    <Check className="mr-1 h-4 w-4" />{c.escolhida ? "Desmarcar" : "Escolher"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEdit(c)} aria-label="Editar cotação" title="Editar"><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => excluir(c)} aria-label="Excluir cotação" title="Excluir"><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CotacaoDialog solicitacaoId={solicitacaoId} value={edit} onClose={() => setEdit(null)} onSaved={refresh} />
    </div>
  );
}

function CotacaoDialog({ solicitacaoId, value, onClose, onSaved }: { solicitacaoId: string; value: Cotacao | null | "new"; onClose: () => void; onSaved: () => void }) {
  const c = value && value !== "new" ? value : null;
  const [f, setF] = useState({ fornecedor: "", contato: "", valor: "", prazo: "", pagamento: "", validade: "", comentario: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!value) return;
    setF({
      fornecedor: c?.fornecedor ?? "",
      contato: c?.fornecedor_contato ?? "",
      valor: numToMask(c?.valor_total),
      prazo: c?.prazo_entrega_dias?.toString() ?? "",
      pagamento: c?.condicao_pagamento ?? "",
      validade: c?.validade ?? "",
      comentario: c?.comentario ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const salvar = async () => {
    const fornecedor = f.fornecedor.trim().slice(0, 150);
    if (!fornecedor) return toast.error("Informe o fornecedor");
    const prazo = f.prazo.trim() ? parseInt(f.prazo, 10) : null;
    if (prazo != null && (isNaN(prazo) || prazo < 0)) return toast.error("Prazo inválido");
    const payload = {
      solicitacao_id: solicitacaoId,
      fornecedor,
      fornecedor_contato: f.contato.trim().slice(0, 150) || null,
      valor_total: f.valor ? parseBRL(f.valor) : null,
      prazo_entrega_dias: prazo,
      condicao_pagamento: f.pagamento.trim().slice(0, 150) || null,
      validade: f.validade || null,
      comentario: f.comentario.trim().slice(0, 2000) || null,
    };
    setSaving(true);
    const { error } = c
      ? await supabase.from("cotacoes").update(payload).eq("id", c.id)
      : await supabase.from("cotacoes").insert(payload);
    setSaving(false);
    if (error) return toast.error("Erro ao salvar cotação: " + error.message);
    toast.success(c ? "Cotação atualizada" : "Cotação adicionada");
    onClose();
    onSaved();
  };

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{c ? "Editar cotação" : "Nova cotação"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Fornecedor *</Label><Input value={f.fornecedor} onChange={set("fornecedor")} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Contato</Label><Input value={f.contato} onChange={set("contato")} /></div>
          <div className="space-y-1.5">
            <Label>Preço total (R$)</Label>
            <Input inputMode="numeric" placeholder="0,00" className="tabular-nums" value={f.valor} onChange={(e) => setF((p) => ({ ...p, valor: maskBRL(e.target.value) }))} />
          </div>
          <div className="space-y-1.5"><Label>Prazo de entrega (dias)</Label><Input inputMode="numeric" value={f.prazo} onChange={set("prazo")} /></div>
          <div className="space-y-1.5"><Label>Condição de pagamento</Label><Input placeholder="Ex.: 30/60 boleto" value={f.pagamento} onChange={set("pagamento")} /></div>
          <div className="space-y-1.5"><Label>Validade da proposta</Label><Input type="date" value={f.validade} onChange={set("validade")} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Comentários</Label><Textarea rows={3} value={f.comentario} onChange={set("comentario")} placeholder="Frete, marca, qualidade, observações..." /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
