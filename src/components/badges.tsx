import { cn } from "@/lib/utils";
import { PRIORIDADE, STATUS, type Prioridade, type Status } from "@/lib/format";

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const s = STATUS[status] ?? STATUS.nova;
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap", s.cls, className)}>
      {s.label}
    </span>
  );
}

export function PrioridadeBadge({ prioridade }: { prioridade: Prioridade }) {
  const p = PRIORIDADE[prioridade] ?? PRIORIDADE.normal;
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap", p.cls)}>
      {p.label}
    </span>
  );
}
