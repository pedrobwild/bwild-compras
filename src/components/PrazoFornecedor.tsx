import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { fmtDate, fmtDias } from "@/lib/format";
import { diferencaDias, hojeSP, lerPrazoDias, prazoVencido } from "@/lib/prazos";
import { cn } from "@/lib/utils";

/** Prazo do fornecedor (dias) editável no cabeçalho; salva ao sair do campo ou com Enter. */
export function PrazoFornecedorInfo({ value, editavel, onSave }: { value: number | null; editavel: boolean; onSave: (v: number | null) => Promise<boolean> }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => setV(value == null ? "" : String(value)), [value]);
  const salvar = async () => {
    const texto = v.trim();
    const novo = texto === "" ? null : lerPrazoDias(texto);
    if (texto !== "" && novo == null) { setErro("Use um número inteiro de 0 a 365"); return; }
    setErro(null);
    if (novo === value) return;
    if (!(await onSave(novo))) setV(value == null ? "" : String(value));
  };
  return (
    <div>
      <dt className="text-xs text-muted-foreground">Prazo do fornecedor (dias)</dt>
      {editavel ? (
        <dd className="mt-1">
          <Input
            className={cn("h-9 tabular-nums", (v === "" || erro) && "border-destructive/60")}
            inputMode="numeric"
            aria-label="Prazo do fornecedor (dias)"
            aria-invalid={!!erro}
            placeholder="Preencher"
            value={v}
            onChange={(e) => { setV(e.target.value); setErro(null); }}
            onBlur={() => void salvar()}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          />
          {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
        </dd>
      ) : (
        <dd className={cn("font-medium tabular-nums", value == null && "text-destructive")}>{value == null ? "Preencher" : fmtDias(value)}</dd>
      )}
    </div>
  );
}

/** "Comprar até": calculado no banco (data na obra − prazo do fornecedor); só leitura. */
export function ComprarAteInfo({ value, concluido }: { value: string | null; concluido: boolean }) {
  const hoje = hojeSP();
  const vencido = !concluido && prazoVencido(value, hoje);
  return (
    <div>
      <dt className="text-xs text-muted-foreground">Comprar até</dt>
      <dd className={cn("mt-1 font-medium tabular-nums", vencido && "text-destructive")} title="Calculado: data na obra menos o prazo do fornecedor">
        {value ? fmtDate(value) : "—"}
      </dd>
      {vencido && value && <p className="mt-1 text-xs font-medium text-destructive">Vencido há {fmtDias(diferencaDias(value, hoje))}</p>}
    </div>
  );
}
