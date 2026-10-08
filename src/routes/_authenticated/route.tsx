import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, PlusCircle, KanbanSquare, Users, LogOut, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRole } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  const { nome, user, session, loading } = useAuth();
  const { isCompras, isAdmin, label } = useRole();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Sessão encerrada com a tela aberta (saiu em outra aba, token expirou): volta ao login
  // em vez de mostrar listas vazias, já que sem login o banco não devolve nada.
  useEffect(() => {
    if (!loading && !session) {
      qc.clear();
      navigate({ to: "/login", replace: true });
    }
  }, [loading, session, qc, navigate]);

  const items = [
    { to: "/painel", label: "Painel", icon: LayoutDashboard, show: true },
    { to: "/solicitacoes/nova", label: "Nova", long: "Nova solicitação", icon: PlusCircle, show: true },
    { to: "/compras", label: "Fila", long: "Fila de Compras", icon: KanbanSquare, show: isCompras },
    { to: "/clientes", label: "Clientes", long: "Clientes e obras", icon: Building2, show: true },
    { to: "/admin/usuarios", label: "Usuários", icon: Users, show: isAdmin },
  ].filter((i) => i.show) as { to: "/painel"; label: string; long?: string; icon: typeof Users }[];

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 px-5 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-accent font-bold">
            B<span className="text-sidebar-primary">w</span>
          </div>
          <span className="font-semibold tracking-tight">Bwild Compras</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((i) => (
            <Link
              key={i.to}
              to={i.to}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
            >
              <i.icon className="h-4 w-4" />
              {i.long ?? i.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-sm font-medium">{nome || user?.email}</p>
          <p className="text-xs text-sidebar-primary">{label}</p>
          <button onClick={signOut} className="mt-3 flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-accent-foreground">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        <span className="font-semibold">Bwild <span className="text-accent">Compras</span></span>
        <div className="text-right">
          <p className="max-w-[10rem] truncate text-xs font-medium">{nome || user?.email}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </header>

      <main className="pb-24 lg:pb-8 lg:pl-60">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card lg:hidden">
        {items.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
            activeProps={{ className: "text-foreground font-medium" }}
          >
            {({ isActive }) => (
              <>
                <i.icon className={cn("h-5 w-5", isActive && "text-accent")} />
                {i.label}
              </>
            )}
          </Link>
        ))}
        <button onClick={signOut} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground">
          <LogOut className="h-5 w-5" /> Sair
        </button>
      </nav>
    </div>
  );
}
