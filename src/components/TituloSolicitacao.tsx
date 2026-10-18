import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function TituloSolicitacao({ titulo, editavel, onSave }: {
  titulo: string;
  editavel: boolean;
  onSave: (titulo: string) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(titulo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  return (
    <div className="flex min-w-0 items-start gap-2">
      <h1 className="min-w-0 break-words text-xl font-semibold md:text-2xl">{titulo}</h1>
      {editavel && <Button variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" aria-label="Editar título" title="Editar título" onClick={() => { setValor(titulo); setErro(""); setAberto(true); }}><Pencil className="h-4 w-4" /></Button>}
      <Dialog open={aberto} onOpenChange={(open) => { if (!salvando) setAberto(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar título</DialogTitle></DialogHeader>
          <form onSubmit={async (event) => {
            event.preventDefault();
            if (salvando) return;
            const novo = valor.trim();
            if (!novo) { setErro("Preencha o título."); return; }
            if (novo === titulo) { setAberto(false); return; }
            setSalvando(true);
            try {
              if (await onSave(novo)) setAberto(false);
              else setErro("Não foi possível salvar. Tente novamente.");
            } catch {
              setErro("Não foi possível salvar. Tente novamente.");
            } finally { setSalvando(false); }
          }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="titulo-solicitacao">Título</Label>
              <Input id="titulo-solicitacao" value={valor} onChange={(event) => { setValor(event.target.value); setErro(""); }} disabled={salvando} aria-invalid={Boolean(erro)} aria-describedby={erro ? "erro-titulo" : undefined} autoFocus />
              {erro && <p id="erro-titulo" role="alert" className="text-sm text-destructive">{erro}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={salvando} onClick={() => setAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar título"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}