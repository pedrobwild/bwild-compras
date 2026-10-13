import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { bateBusca, normalizar, rotuloCliente, type ClienteObraOpcao } from "@/lib/clientes";

export function ClientePicker({
  lista, valorId, textoLivre, onEscolher, onNovo, invalido, onAbrir,
}: {
  lista: ClienteObraOpcao[];
  valorId: string | null;
  textoLivre: string;
  onEscolher: (c: ClienteObraOpcao) => void;
  onNovo: (nome: string) => void;
  invalido?: boolean;
  onAbrir?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const atual = lista.find((c) => c.id === valorId);
  const temExato = lista.some((c) => normalizar(c.nome) === normalizar(busca));
  return (
    <Popover open={aberto} onOpenChange={(o) => { setAberto(o); if (o) onAbrir?.(); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={aberto} aria-invalid={invalido}
          className={cn("h-10 w-full justify-between font-normal", invalido && "border-destructive")}>
          <span className={cn("truncate", !atual && !textoLivre && "text-muted-foreground")}>
            {atual ? `${rotuloCliente(atual)}${atual.semCadastro ? " (sem cadastro)" : ""}` : textoLivre ? `${textoLivre} (novo)` : "Escolher cliente/obra"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command filter={(v, s) => (bateBusca(v, s) ? 1 : 0)}>
          <CommandInput placeholder="Buscar cliente, empreendimento…" value={busca} onValueChange={setBusca} />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              {lista.map((c) => (
                <CommandItem key={c.id} value={`${rotuloCliente(c)} ${c.id}`} onSelect={() => { onEscolher(c); setAberto(false); }}>
                  <Check className={cn("h-4 w-4", c.id === valorId ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{rotuloCliente(c)}</span>
                  {c.semCadastro && <span className="ml-auto shrink-0 text-xs text-muted-foreground">sem cadastro</span>}
                </CommandItem>
              ))}
            </CommandGroup>
            {busca.trim().length >= 2 && !temExato && (
              <CommandGroup>
                <CommandItem value={`__novo__ ${busca}`} onSelect={() => { onNovo(busca.trim()); setAberto(false); setBusca(""); }}>
                  <Plus className="h-4 w-4" /> Cadastrar novo cliente: <strong className="truncate">{busca.trim()}</strong>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
