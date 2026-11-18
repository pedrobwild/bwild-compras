import { endOfDay, parseISO, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

// Inclui os dias inicial e final inteiros, inclusive quando só um dia foi escolhido.
export function noPeriodo(iso: string | null | undefined, range?: DateRange): boolean {
  if (!range?.from) return true;
  if (!iso) return false;
  const data = parseISO(iso);
  return data >= startOfDay(range.from) && data <= endOfDay(range.to ?? range.from);
}