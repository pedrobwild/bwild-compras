import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PainelRow } from "@/lib/format";

/** Lista do painel (paginada) + tempo real em solicitacoes/compras. */
export function usePainel() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("painel-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitacoes" }, () =>
        qc.invalidateQueries({ queryKey: ["painel"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "compras" }, () =>
        qc.invalidateQueries({ queryKey: ["painel"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return useQuery({
    queryKey: ["painel"],
    queryFn: async () => {
      const all: PainelRow[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await supabase
          .from("painel_solicitacoes")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, from + page - 1);
        if (error) throw error;
        all.push(...((data ?? []) as PainelRow[]));
        if (!data || data.length < page) break;
      }
      return all;
    },
  });
}
