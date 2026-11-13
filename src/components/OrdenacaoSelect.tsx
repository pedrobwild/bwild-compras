import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Ordenacao } from "@/lib/ordenacao";

const opcoes: { value: Ordenacao; label: string }[] = [
  { value: "padrao", label: "Ordem padrão" },
  { value: "recentes", label: "Solicitação: mais recentes" },
  { value: "antigas", label: "Solicitação: mais antigas" },
  { value: "az", label: "Nome: A a Z" },
  { value: "za", label: "Nome: Z a A" },
];

export function OrdenacaoSelect({ value, onChange }: { value: Ordenacao; onChange: (value: Ordenacao) => void }) {
  return <Select value={value} onValueChange={(next) => {
    const opcao = opcoes.find((o) => o.value === next);
    if (opcao) onChange(opcao.value);
  }}>
    <SelectTrigger aria-label="Ordenar itens" className="min-h-11 w-full sm:w-64"><SelectValue /></SelectTrigger>
    <SelectContent>{opcoes.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
  </Select>;
}