import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function ResponsavelCompra({ valor, nomeAtual, onSave }: {
  valor: string | null;
  nomeAtual?: string;
  onSave: (id: string | null) => Promise<boolean>;
}) {
  const [salvando, setSalvando] = useState(false);
  const equipe = useQuery({
    queryKey: ["responsaveis-compras"],
    queryFn: async () => {
      const ids = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("user_roles").select("user_id, role")
          .in("role", ["compras", "admin"]).order("user_id").order("role").range(from, from + 999);
        if (error) throw error;
        for (const row of data ?? []) ids.add(row.user_id);
        if (!data || data.length < 1000) break;
      }
      const usuarios: { id: string; nome: string | null; email: string | null }[] = [];
      const lista = [...ids];
      for (let i = 0; i < lista.length; i += 100) {
        const { data, error } = await supabase.from("profiles").select("id, nome, email").in("id", lista.slice(i, i + 100));
        if (error) throw error;
        usuarios.push(...(data ?? []));
      }
      return usuarios.sort((a, b) => (a.nome || a.email || "").localeCompare(b.nome || b.email || "", "pt-BR"));
    },
  });

  const escolher = async (id: string) => {
    const novo = id === "sem-responsavel" ? null : id;
    if (novo === valor || salvando) return;
    setSalvando(true);
    try { await onSave(novo); } finally { setSalvando(false); }
  };

  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground" id="responsavel-compra-label">Responsável de compras</dt>
      <dd className="mt-1">
        <Select value={valor ?? "sem-responsavel"} onValueChange={escolher} disabled={salvando || equipe.isPending || equipe.isError}>
          <SelectTrigger aria-labelledby="responsavel-compra-label" aria-busy={salvando} className="min-h-11 w-full min-w-0">
            <SelectValue placeholder="Selecionar responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sem-responsavel">Sem responsável</SelectItem>
            {valor && !equipe.data?.some((u) => u.id === valor) && <SelectItem value={valor}>{nomeAtual || "Responsável atual"}</SelectItem>}
            {equipe.data?.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome || u.email || "Usuário"}</SelectItem>)}
          </SelectContent>
        </Select>
        {equipe.isPending && <p className="mt-1 text-xs text-muted-foreground" role="status">Carregando responsáveis…</p>}
        {salvando && <p className="mt-1 text-xs text-muted-foreground" role="status">Salvando…</p>}
        {equipe.isError && <div className="mt-1 text-xs text-destructive" role="alert">Não foi possível carregar os responsáveis. <Button variant="link" size="sm" onClick={() => equipe.refetch()}>Tentar novamente</Button></div>}
        {equipe.isSuccess && equipe.data.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Nenhum responsável disponível.</p>}
      </dd>
    </div>
  );
}