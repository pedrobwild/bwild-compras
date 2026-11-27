import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingList, ErrorState } from "@/components/States";
import { PagamentoEditor, novoPagamento, type PagamentoRascunho } from "@/components/PagamentoEditor";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET } from "@/lib/supabase-config";
import { sanitizeFileName } from "@/lib/format";
import { consultarPagamentos, gravarPagamento } from "@/lib/pagamentos.functions";
import { dadosPagamentoSchema, salvarPagamentosSchema, temMeioPagamento, validarBoleto, itensSemPagamento, valorPagamento } from "@/lib/pagamentos";

// Montado somente enquanto aberto; atualizações externas nunca apagam a edição em andamento.
export function PagamentoDialog({ id, solicitar, onClose, onSaved }: { id: string; solicitar: boolean; onClose: () => void; onSaved: () => void }) {
  const consultar = useServerFn(consultarPagamentos);
  const gravar = useServerFn(gravarPagamento);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["painel", "pagamento", id], queryFn: () => consultar({ data: { ids: [id] } }), staleTime: 0 });
  const [pagamentos, setPagamentos] = useState<PagamentoRascunho[]>([]);
  const [versao, setVersao] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const uploads = useRef<string[]>([]);
  const atual = q.data?.[0];
  useEffect(() => {
    if (!atual || versao) return;
    setVersao(atual.updated_at);
    setPagamentos(atual.pagamentos.length ? atual.pagamentos.map((p) => ({ id: p.id, onde_comprado: p.onde_comprado, valorTexto: p.valor == null ? "" : String(p.valor).replace(".", ","), link: p.link ?? "", codigo: p.codigo ?? "", observacao: p.observacao ?? "", itens: p.itens.map((i) => i.id), boletos: p.boletos, arquivos: [] })) : [novoPagamento()]);
  }, [atual, versao]);
  const limparUploads = async (mantidos: Set<string> = new Set()) => {
    const paths = uploads.current.filter((p) => !mantidos.has(p));
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    uploads.current = [];
  };
  const fechar = () => { if (busy) return; void limparUploads(); onClose(); };
  const faltam = itensSemPagamento(atual?.itens ?? [], pagamentos);
  const salvar = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !versao) return;
    if (!pagamentos.length) { setErro("Informe pelo menos um pagamento válido."); return; }
    for (const p of pagamentos) {
      const parsed = dadosPagamentoSchema.safeParse({ ...p, valor: valorPagamento(p.valorTexto) });
      if (!parsed.success) { setErro(parsed.error.issues[0]?.message ?? "Confira o pagamento."); return; }
      if (!temMeioPagamento(p.link, p.codigo, p.boletos.length) && !p.arquivos.length) { setErro("Cada pagamento precisa de link, código ou boleto."); return; }
    }
    setBusy(true); setErro("");
    try {
      const prontos: PagamentoRascunho[] = [];
      for (const p of pagamentos) {
        const boletos = [...p.boletos];
        for (const a of p.arquivos) {
          if (!validarBoleto(a.file)) throw new Error("Anexe um boleto PDF, PNG, JPG ou JPEG de até 50 MB.");
          const path = `${id}/pagamentos/${p.id}/${a.id}-${sanitizeFileName(a.file.name)}`;
          const upload = await supabase.storage.from(BUCKET).upload(path, a.file, { contentType: a.file.type, upsert: false });
          if (upload.error) throw new Error("Não foi possível enviar o boleto. Tente novamente.");
          uploads.current.push(path);
          const boleto = { id: a.id, nome_arquivo: a.file.name, storage_path: path, tamanho_bytes: a.file.size, tipo_mime: a.file.type };
          boletos.push(boleto);
          setPagamentos((prev) => prev.map((r) => r.id !== p.id ? r : { ...r, boletos: [...r.boletos, boleto], arquivos: r.arquivos.filter((f) => f.id !== a.id) }));
        }
        prontos.push({ ...p, boletos, arquivos: [] });
      }
      const data = salvarPagamentosSchema.parse({ id, solicitar, versao, pagamentos: prontos.map((p) => ({ ...p, valor: valorPagamento(p.valorTexto) })) });
      const result = await gravar({ data });
      if (!result.ok) throw new Error(result.erro ?? "Não foi possível salvar os pagamentos.");
      await limparUploads(new Set(prontos.flatMap((p) => p.boletos.map((b) => b.storage_path))));
      toast.success(solicitar ? "Pagamento solicitado" : "Pagamentos atualizados");
      await qc.invalidateQueries({ queryKey: ["painel"] });
      onSaved(); onClose();
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente."); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open) fechar(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" onInteractOutside={(e) => { if (busy) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}>
      <DialogHeader><DialogTitle>{solicitar ? "Solicitar pagamento" : "Editar pagamentos"}</DialogTitle></DialogHeader>
      {q.isLoading ? <LoadingList rows={3} /> : q.isError ? <><ErrorState /><Button variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button></> : !atual ? <ErrorState message="Solicitação não encontrada." /> : <form onSubmit={salvar} className="space-y-3">
        {pagamentos.map((p, indice) => <PagamentoEditor key={p.id} pagamento={p} indice={indice} itens={atual.itens} ocupados={new Set(pagamentos.filter((r) => r.id !== p.id).flatMap((r) => r.itens))} busy={busy} ultimoProtegido={!solicitar && pagamentos.length === 1} onChange={(novo) => { setPagamentos((prev) => prev.map((r) => r.id === novo.id ? novo : r)); setErro(""); }} onRemove={() => setPagamentos((prev) => prev.filter((r) => r.id !== p.id))} onError={setErro} />)}
        <Button type="button" variant="outline" disabled={busy || pagamentos.length >= 100} onClick={() => setPagamentos((prev) => [...prev, novoPagamento()])}><Plus className="h-4 w-4" />Adicionar pagamento</Button>
        {faltam > 0 && <p role="status" className="border-l-2 border-accent pl-3 text-sm text-muted-foreground">{faltam} {faltam === 1 ? "item sem pagamento vinculado" : "itens sem pagamento vinculado"}. É possível continuar.</p>}
        {erro && <p role="alert" className="break-words text-sm text-destructive">{erro}</p>}
        <DialogFooter className="sticky bottom-0 border-t bg-background py-3"><Button type="button" variant="outline" disabled={busy} onClick={fechar}>Cancelar</Button><Button type="submit" disabled={busy || !versao}>{busy ? "Salvando…" : solicitar ? "Solicitar pagamento" : "Salvar pagamentos"}</Button></DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}
