import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRole } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, LoadingList } from "@/components/States";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Bwild Compras" },
      { name: "description", content: "Gerencie papéis de acesso da equipe." },
      { property: "og:title", content: "Usuários — Bwild Compras" },
      { property: "og:description", content: "Gerencie papéis de acesso da equipe." },
    ],
  }),
  component: Usuarios,
});

type Role = "compras" | "admin";

function Usuarios() {
  const { isAdmin, loading } = useRole();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-usuarios"],
    enabled: isAdmin,
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, nome, email, created_at").order("nome").limit(1000),
        supabase.from("user_roles").select("user_id, role").limit(1000),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      const roles: Record<string, string[]> = {};
      for (const x of (r.data ?? []) as { user_id: string; role: string }[]) (roles[x.user_id] ??= []).push(x.role);
      return ((p.data ?? []) as { id: string; nome: string | null; email: string | null; created_at: string }[]).map((u) => ({ ...u, roles: roles[u.id] ?? [] }));
    },
  });

  if (!loading && !isAdmin) return <EmptyState title="Área exclusiva de administradores." />;

  const toggle = async (uid: string, role: Role, on: boolean) => {
    if (!on && role === "admin" && uid === user?.id) return toast.error("Você não pode remover seu próprio acesso de admin.");
    const { error } = on
      ? await supabase.from("user_roles").insert({ user_id: uid, role })
      : await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", role);
    if (error) return toast.error(error.message);
    toast.success("Papel atualizado");
    qc.invalidateQueries({ queryKey: ["admin-usuarios"] });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">Todo cadastro entra como solicitante. Libere Compras ou Admin aqui.</p>
      </div>
      {q.isLoading ? <LoadingList /> : q.error ? <ErrorState message={(q.error as Error).message} /> : !q.data?.length ? <EmptyState title="Nenhum usuário." /> : (
        <ul className="divide-y rounded-lg border bg-card">
          {q.data.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.nome || "—"}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email} · desde {fmtDate(u.created_at)}</p>
              </div>
              {(["compras", "admin"] as Role[]).map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <Switch checked={u.roles.includes(role)} onCheckedChange={(v) => toggle(u.id, role, v)} />
                  {role === "compras" ? "Compras" : "Admin"}
                </label>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
