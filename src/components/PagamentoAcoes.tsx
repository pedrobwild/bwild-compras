import { Copy, ExternalLink, FileText, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { abrirArquivo } from "@/lib/upload";
import { linkPagamentoValido, type BoletoPagamento } from "@/lib/pagamentos";

export function PagamentoAcoes({ link, instrucoes, boletos, compact = false }: {
  link: string | null; instrucoes: string | null; boletos: BoletoPagamento[]; compact?: boolean;
}) {
  const copiar = async (texto: string, nome: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success(`${nome} copiado${nome === "Link" ? "" : "s"}`); }
    catch { toast.error("Não foi possível copiar. Tente novamente."); }
  };
  const abrir = (b: BoletoPagamento) => { void abrirArquivo(b.storage_path).catch(() => toast.error("Não foi possível abrir o boleto. Tente novamente.")); };
  const valido = link && linkPagamentoValido(link);
  const cls = compact ? "h-11 w-11 shrink-0 p-0" : "min-h-11";
  return (
    <div className={compact ? "grid w-[88px] grid-cols-2" : "flex flex-wrap gap-2"}>
      {valido && <>
        <Button asChild variant="ghost" className={cls} title="Abrir link" aria-label="Abrir link"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{!compact && "Abrir link"}</a></Button>
        <Button variant="ghost" className={cls} title="Copiar link" aria-label="Copiar link" onClick={() => copiar(link, "Link")}><Copy className="h-4 w-4" />{!compact && "Copiar link"}</Button>
      </>}
      {instrucoes && <Button variant="ghost" className={cls} title="Copiar instruções" aria-label="Copiar instruções" onClick={() => copiar(instrucoes, "Instruções")}><ClipboardCopy className="h-4 w-4" />{!compact && "Copiar instruções"}</Button>}
      {boletos.length === 1 && <Button variant="ghost" className={cls} title="Ver boleto" aria-label="Ver boleto" onClick={() => { const b = boletos[0]; if (b) abrir(b); }}><FileText className="h-4 w-4" />{!compact && "Ver boleto"}</Button>}
      {boletos.length > 1 && <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" className={cls} title="Ver boletos" aria-label="Ver boletos"><FileText className="h-4 w-4" />{!compact && `Ver boletos (${boletos.length})`}</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">{boletos.map((b) => <DropdownMenuItem key={b.id} onClick={() => abrir(b)} className="min-h-11 max-w-72 break-words">{b.nome_arquivo}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>}
    </div>
  );
}