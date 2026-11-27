import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { validarBoleto, type BoletoPagamento, type ItemPagamento } from "@/lib/pagamentos";

export interface PagamentoRascunho {
  id: string; onde_comprado: string; valorTexto: string; link: string; codigo: string; observacao: string;
  itens: string[]; boletos: BoletoPagamento[]; arquivos: { id: string; file: File }[];
}
export function novoPagamento(): PagamentoRascunho {
  return { id: crypto.randomUUID(), onde_comprado: "", valorTexto: "", link: "", codigo: "", observacao: "", itens: [], boletos: [], arquivos: [] };
}
export function PagamentoEditor({ pagamento: p, indice, itens, ocupados, busy, ultimoProtegido, onChange, onRemove, onError }: {
  pagamento: PagamentoRascunho; indice: number; itens: ItemPagamento[]; ocupados: Set<string>; busy: boolean; ultimoProtegido: boolean;
  onChange: (p: PagamentoRascunho) => void; onRemove: () => void; onError: (erro: string) => void;
}) {
  const field = (nome: string) => `${p.id}-${nome}`;
  return <fieldset disabled={busy} className="min-w-0 space-y-3 border-t py-4">
    <legend className="flex w-full items-center justify-between gap-2 pt-3 font-semibold">Pagamento {indice + 1}<Button type="button" variant="ghost" size="icon" className="h-11 w-11" title={ultimoProtegido ? "Mantenha pelo menos um pagamento" : "Remover pagamento"} aria-label={`Remover pagamento ${indice + 1}`} disabled={busy || ultimoProtegido} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button></legend>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor={field("onde")}>Onde foi comprado *</Label><Input id={field("onde")} value={p.onde_comprado} maxLength={200} onChange={(e) => onChange({ ...p, onde_comprado: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor={field("valor")}>Valor (opcional)</Label><Input id={field("valor")} inputMode="decimal" value={p.valorTexto} placeholder="R$" onChange={(e) => onChange({ ...p, valorTexto: e.target.value })} /></div>
    </div>
    <div className="space-y-1.5"><Label htmlFor={field("link")}>Link de pagamento</Label><Input id={field("link")} inputMode="url" placeholder="https://" maxLength={1000} value={p.link} onChange={(e) => onChange({ ...p, link: e.target.value })} /></div>
    <div className="space-y-1.5"><Label htmlFor={field("codigo")}>Código Pix ou linha digitável</Label><Textarea id={field("codigo")} rows={3} maxLength={1000} value={p.codigo} onChange={(e) => onChange({ ...p, codigo: e.target.value })} /></div>
    <div className="space-y-1.5"><Label htmlFor={field("observacao")}>Observação</Label><Textarea id={field("observacao")} rows={2} maxLength={300} value={p.observacao} onChange={(e) => onChange({ ...p, observacao: e.target.value })} /></div>
    <div className="space-y-1.5"><Label htmlFor={field("boletos")}>Boletos</Label><Input id={field("boletos")} className="min-h-11" type="file" accept=".pdf,.png,.jpg,.jpeg" multiple onChange={(e) => {
      const files = Array.from(e.target.files ?? []);
      if (files.some((file) => !validarBoleto(file))) onError("Anexe um boleto PDF, PNG, JPG ou JPEG de até 50 MB.");
      else onChange({ ...p, arquivos: [...p.arquivos, ...files.map((file) => ({ id: crypto.randomUUID(), file }))] });
      e.target.value = "";
    }} /></div>
    <ul className="divide-y">{p.boletos.map((b) => <li key={b.id} className="flex min-h-11 items-center gap-2 text-sm"><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 break-words">{b.nome_arquivo}</span><Button type="button" variant="ghost" size="icon" className="h-11 w-11" title="Remover boleto" aria-label={`Remover ${b.nome_arquivo}`} onClick={() => onChange({ ...p, boletos: p.boletos.filter((a) => a.id !== b.id) })}><Trash2 className="h-4 w-4" /></Button></li>)}
      {p.arquivos.map((a) => <li key={a.id} className="flex min-h-11 items-center gap-2 text-sm"><span className="min-w-0 flex-1 break-words">{a.file.name} · A enviar</span><Button type="button" variant="ghost" size="icon" className="h-11 w-11" title="Retirar arquivo" aria-label={`Retirar ${a.file.name}`} onClick={() => onChange({ ...p, arquivos: p.arquivos.filter((f) => f.id !== a.id) })}><Trash2 className="h-4 w-4" /></Button></li>)}
    </ul>
    <div className="space-y-1.5"><p className="text-sm font-medium">Itens cobertos (opcional)</p>{!itens.length ? <p className="text-sm text-muted-foreground">Nenhum item nesta solicitação.</p> : <div className="max-h-48 overflow-y-auto divide-y">{itens.map((i) => <label key={i.id} htmlFor={field(i.id)} className="flex min-h-11 items-center gap-3 py-2 text-sm"><Checkbox id={field(i.id)} checked={p.itens.includes(i.id)} disabled={busy || ocupados.has(i.id)} onCheckedChange={(checked) => onChange({ ...p, itens: checked ? [...p.itens, i.id] : p.itens.filter((id) => id !== i.id) })} /><span className="min-w-0 break-words">{i.descricao}{ocupados.has(i.id) && <span className="ml-1 text-xs text-muted-foreground">· Em outro pagamento</span>}</span></label>)}</div>}</div>
  </fieldset>;
}