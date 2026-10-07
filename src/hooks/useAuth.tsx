import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "solicitante" | "compras" | "admin";
interface AuthCtx {
  session: Session | null;
  user: User | null;
  nome: string;
  roles: Role[];
  loading: boolean;
}
const Ctx = createContext<AuthCtx>({ session: null, user: null, nome: "", roles: [], loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) {
      setRoles([]);
      setNome("");
      return;
    }
    setLoading(true);
    Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("nome").eq("id", uid).maybeSingle(),
    ]).then(([r, p]) => {
      setRoles(((r.data ?? []) as { role: Role }[]).map((x) => x.role));
      setNome((p.data as { nome?: string } | null)?.nome ?? "");
      setLoading(false);
    });
  }, [uid]);

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, nome, roles, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

export function useRole() {
  const { roles, loading } = useAuth();
  const isAdmin = roles.includes("admin");
  const isCompras = isAdmin || roles.includes("compras");
  const label = isAdmin ? "Admin" : isCompras ? "Compras" : "Solicitante";
  return { roles, isAdmin, isCompras, label, loading };
}
