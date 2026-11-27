import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingList, ErrorState } from "@/components/States";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET } from "@/lib/supabase-config";
import { fmtBRL, sanitizeFileName } from "@/lib/format";
import { consultarPagamentos, gravarPagamento, registrarBoleto } from "@/lib/pagamentos.functions";
import { dadosPagamentoSchema, temMeioPagamento, validarBoleto, type BoletoPagamento } from "@/lib/pagamentos";

// Montado apenas enquanto aberto: reabrir sempre carrega os dados atuais sem apagar uma edição em andamento.
export function PagamentoDialog({ id, solicitar, onClose, onSaved }: { id: string; solicitar: boolean; onClose: () => void; onSaved: () => void }) {
  const consultar = useServerFn(consultarPagamentos);
  const gravar = useServerFn(gravarPagamento);
  const registrar = useServerFn(registrarBoleto);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["painel", "pagamento", id], queryFn: () => consultar({ data: { ids: [id] } }), staleTime: 0 });
  const [inicializado, setInicializado] = useState(false);
  const [link, setLink] = useState("");
  const [instrucoes, setInstrucoes] = useState("");
  const [boletos, setBoletos] = useState<BoletoPagamento[]>([]);
  const [remover, setRemover] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const atual = q.data?.[0];
  useEffect(() => {
    if (!atual || inicializado) return;
    setLink(atual.pagamento_link ?? ""); setInstrucoes(atual.pagamento_instrucoes ?? ""); setBoletos(atual.boletos); setInicializado(true);
  }, [atual, inicializado]);

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !inicializado) return;
    const parsed = dadosPagamentoSchema.safeParse({ link, instrucoes });
    if (!parsed.success) { setErro(parsed.error.issues[0]?.message ?? "Confira os dados de pagamento."); return; }
    const mantidos = boletos.filter((b) => !remover.includes(b.id));
    if (!temMeioPagamento(parsed.data.link, parsed.data.instrucoes, mantidos.length) && !files.length) {
      setErro("Informe um link, instruções ou anexe um boleto para solicitar pagamento."); return;
    }
    setBusy(true); setErro("");
    try {
      const registrados = [...mantidos];
      for (const file of files) {
        if (!validarBoleto(file)) throw new Error("Anexe um boleto PDF, PNG, JPG ou JPEG de até 50 MB.");
        const path = `${id}/pagamentos/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
        const upload = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw new Error("Não foi possível enviar o boleto. Tente novamente.");
        let anexo: BoletoPagamento;
        try { anexo = await registrar({ data: { id, path, name: file.name, size: file.size, type: file.type } }); }
        catch (e) { await supabase.storage.from(BUCKET).remove([path]); throw e; }
        registrados.push(anexo);
        setBoletos((prev) => [...prev, anexo]);
        setFiles((prev) => prev.filter((f) => f !== file));
      }
      if (!temMeioPagamento(parsed.data.link, parsed.data.instrucoes, registrados.length)) throw new Error("Informe um link, instruções ou anexe um boleto para solicitar pagamento.");
      const result = await gravar({ data: { id, ...parsed.data, solicitar, remover } });
      if (!result.ok) throw new Error(result.erro ?? "Não foi possível salvar o pagamento.");
      toast.success(solicitar ? "Pagamento solicitado" : "Dados de pagamento atualizados");
      await qc.invalidateQueries({ queryKey: ["painel"] });
      onSaved(); onClose();
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente."); }
    finally { setBusy(false); }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl" onInteractOutside={(e) => { if (busy) e.preventDefault(); }}>
      <DialogHeader><DialogTitle>{solicitar ? "Solicitar pagamento" : "Editar dados de pagamento"}</DialogTitle></DialogHeader>
      {q.isLoading ? <LoadingList rows={3} /> : q.isError ? <><ErrorState /><Button variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button></> : !atual ? <ErrorState message="Solicitação não encontrada." /> : <form onSubmit={salvar} className="space-y-4">
        <dl className="grid gap-2 border-b pb-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Fornecedor escolhido</dt><dd className="break-words">{atual.cotacao?.fornecedor ?? "Sem cotação escolhida"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Valor</dt><dd className="whitespace-nowrap tabular-nums">{atual.cotacao?.valor_total == null ? "—" : fmtBRL(atual.cotacao.valor_total)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Condição de pagamento</dt><dd className="break-words">{atual.cotacao?.condicao_pagamento ?? "—"}</dd></div>
        </dl>
        <div className="space-y-2"><Label htmlFor="pagamento-link">Link de pagamento</Label><Input id="pagamento-link" value={link} onChange={(e) => { setLink(e.target.value); setErro(""); }} inputMode="url" maxLength={1000} placeholder="https://" disabled={busy} /></div>
        <div className="space-y-2"><Label htmlFor="pagamento-instrucoes">Instruções de pagamento</Label><Textarea id="pagamento-instrucoes" value={instrucoes} onChange={(e) => { setInstrucoes(e.target.value); setErro(""); }} maxLength={500} rows={3} placeholder="Chave Pix, linha digitável ou observação" disabled={busy} /></div>
        <div className="space-y-2"><Label htmlFor="pagamento-boleto">Boletos</Label><Input id="pagamento-boleto" type="file" accept=".pdf,.png,.jpg,.jpeg" multiple disabled={busy} className="min-h-11" onChange={(e) => {
          const novos = Array.from(e.target.files ?? []);
          if (novos.some((f) => !validarBoleto(f))) setErro("Anexe um boleto PDF, PNG, JPG ou JPEG de até 50 MB.");
          else { setFiles((prev) => [...prev, ...novos]); setErro(""); }
          e.target.value = "";
        }} /></div>
        <ul className="divide-y">{boletos.map((b) => <li key={b.id} className="flex min-h-11 items-center gap-2 text-sm"><FileText className="h-4 w-4 shrink-0" /><span className={`min-w-0 flex-1 break-words ${remover.includes(b.id) ? "line-through text-muted-foreground" : ""}`}>{b.nome_arquivo}</span><Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={busy} aria-label={remover.includes(b.id) ? `Manter ${b.nome_arquivo}` : `Remover ${b.nome_arquivo}`} title={remover.includes(b.id) ? "Manter boleto" : "Remover boleto"} onClick={() => setRemover((prev) => prev.includes(b.id) ? prev.filter((i) => i !== b.id) : [...prev, b.id])}>{remover.includes(b.id) ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}</Button></li>)}</ul>
        <ul className="divide-y">{files.map((f, i) => <li key={`${f.name}-${i}`} className="flex min-h-11 items-center gap-2 text-sm"><span className="min-w-0 flex-1 break-words">{f.name} · A enviar</span><Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={busy} aria-label={`Retirar ${f.name}`} onClick={() => setFiles((prev) => prev.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4" /></Button></li>)}</ul>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || !inicializado}>{busy ? "Salvando…" : solicitar ? "Solicitar pagamento" : "Salvar pagamento"}</Button></DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}