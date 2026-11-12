import { useState } from "react";
import { ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function LinkReferenciaItem({ itemId, solicitacaoId, descricao, link, editavel, onSaved }: {
  itemId: string;
  solicitacaoId: string;
  descricao: string;
  link: string | null | undefined;
  editavel: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editavel || saving) return;
    const url = valor.trim();
    if (url) {
      try {
        const parsed = new URL(url);
        if (!["https:", "http:"].includes(parsed.protocol) || url.length > 1000) throw new Error();
      } catch {
        setErro("Informe um link completo com http:// ou https://, de até 1.000 caracteres.");
        return;
      }
    }
    setSaving(true);
    setErro("");
    try {
      const { error } = await supabase.from("solicitacao_itens")
        .update({ link_referencia: url || null })
        .eq("id", itemId).eq("solicitacao_id", solicitacaoId)
        .select("id").single();
      if (error) throw error;
      onSaved();
      setOpen(false);
      toast.success("Link atualizado");
    } catch {
      setErro("Não foi possível salvar o link. Confira sua permissão e tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {link && /^https?:\/\//i.test(link) && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline" aria-label={`Abrir link de ${descricao}`}>
          <ExternalLink className="h-3.5 w-3.5" /> Abrir link
        </a>
      )}
      {editavel && (
        <Button variant="ghost" size="sm" className="min-h-11" onClick={() => { setValor(link ?? ""); setErro(""); setOpen(true); }} aria-label={`${link ? "Editar" : "Adicionar"} link de ${descricao}`}>
          <Link2 className="mr-1 h-4 w-4" /> {link ? "Editar link" : "Adicionar link"}
        </Button>
      )}
      <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{link ? "Editar link" : "Adicionar link"}</DialogTitle></DialogHeader>
          <p className="break-words text-sm text-muted-foreground">{descricao}</p>
          <form onSubmit={salvar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`link-${itemId}`}>Link de referência</Label>
              <Input id={`link-${itemId}`} type="text" inputMode="url" placeholder="https://" value={valor} maxLength={1000} disabled={saving} onChange={(event) => { setValor(event.target.value); setErro(""); }} aria-invalid={!!erro} aria-describedby={erro ? `erro-link-${itemId}` : undefined} autoFocus />
              {erro && <p id={`erro-link-${itemId}`} role="alert" className="text-sm text-destructive">{erro}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar link"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}