import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { useAuth, useRole } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingList } from "@/components/States";
import { fmtDate } from "@/lib/format";

// Cliente sem persistência de sessão: cria o usuário sem deslogar o admin.
const signupClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const novoUsuarioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(100),
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo de 6 caracteres").max(100),
});

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">Todo cadastro entra como solicitante. Libere Compras ou Admin aqui.</p>
        </div>
        <NovoUsuarioDialog onCreated={() => qc.invalidateQueries({ queryKey: ["admin-usuarios"] })} />
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

function NovoUsuarioDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof novoUsuarioSchema>>({ resolver: zodResolver(novoUsuarioSchema) });

  const submit = form.handleSubmit(async (v) => {
    const { data, error } = await signupClient.auth.signUp({
      email: v.email,
      password: v.password,
      options: { data: { nome: v.nome }, emailRedirectTo: window.location.origin },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return toast.error("Já existe um usuário com este e-mail.");
      return toast.error(error.message);
    }
    // Com confirmação de e-mail ligada, o Supabase responde "sucesso" para e-mail já cadastrado,
    // mas sem nenhuma identidade: nada foi criado.
    if (data.user && (data.user.identities?.length ?? 0) === 0) return toast.error("Já existe um usuário com este e-mail.");
    toast.success(
      data.session
        ? `Usuário ${v.nome} criado. Ele já pode entrar.`
        : `Usuário ${v.nome} criado. Enviamos um link de confirmação para o e-mail dele.`,
    );
    form.reset();
    setOpen(false);
    onCreated();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Novo usuário</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Criar usuário</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="nu-nome">Nome</Label>
            <Input id="nu-nome" {...form.register("nome")} />
            {form.formState.errors.nome && <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-email">E-mail</Label>
            <Input id="nu-email" type="email" autoComplete="off" {...form.register("email")} />
            {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-senha">Senha temporária</Label>
            <Input id="nu-senha" type="password" autoComplete="new-password" {...form.register("password")} />
            {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
          </div>
          <Button className="w-full" disabled={form.formState.isSubmitting}>Criar usuário</Button>
          <p className="text-xs text-muted-foreground">
            O usuário entra como solicitante. Depois libere Compras ou Admin na lista. Sua sessão não é alterada.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
