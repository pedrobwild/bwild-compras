import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Bwild Compras" },
      { name: "description", content: "Acesse o sistema de compras das obras Bwild." },
      { property: "og:title", content: "Entrar — Bwild Compras" },
      { property: "og:description", content: "Acesse o sistema de compras das obras Bwild." },
    ],
  }),
  component: LoginPage,
});

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo de 6 caracteres").max(100),
});
const signupSchema = loginSchema.extend({ nome: z.string().trim().min(2, "Informe seu nome").max(100) });

function Field({ label, error, ...props }: { label: string; error?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"entrar" | "cadastrar" | "recuperar">("entrar");

  useEffect(() => {
    if (session) navigate({ to: "/painel", replace: true });
  }, [session, navigate]);

  const login = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const signup = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema) });
  const [recEmail, setRecEmail] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            B<span className="text-accent">w</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Bwild Compras</h1>
          <p className="mt-1 text-sm text-muted-foreground">Solicitações de compras das obras</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {mode === "recuperar" ? (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!z.string().email().safeParse(recEmail).success) return toast.error("E-mail inválido");
                setBusy(true);
                const { error } = await supabase.auth.resetPasswordForEmail(recEmail, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                setBusy(false);
                if (error) toast.error(error.message);
                else {
                  toast.success("Enviamos um link de recuperação para seu e-mail.");
                  setMode("entrar");
                }
              }}
            >
              <h2 className="font-semibold">Recuperar senha</h2>
              <Field label="E-mail" name="rec" type="email" value={recEmail} onChange={(e) => setRecEmail(e.target.value)} />
              <Button className="w-full" disabled={busy}>Enviar link</Button>
              <button type="button" className="w-full text-sm text-muted-foreground hover:underline" onClick={() => setMode("entrar")}>
                Voltar
              </button>
            </form>
          ) : (
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="entrar">Entrar</TabsTrigger>
                <TabsTrigger value="cadastrar">Cadastrar</TabsTrigger>
              </TabsList>
              <TabsContent value="entrar">
                <form
                  className="space-y-4"
                  onSubmit={login.handleSubmit(async (v) => {
                    const { error } = await supabase.auth.signInWithPassword(v);
                    if (error) toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos" : /not confirmed/i.test(error.message) ? "Confirme seu e-mail pelo link que enviamos antes de entrar" : error.message);
                  })}
                >
                  <Field label="E-mail" type="email" autoComplete="email" {...login.register("email")} error={login.formState.errors.email?.message} />
                  <Field label="Senha" type="password" autoComplete="current-password" {...login.register("password")} error={login.formState.errors.password?.message} />
                  <Button className="w-full" disabled={login.formState.isSubmitting}>Entrar</Button>
                  <button type="button" className="w-full text-sm text-muted-foreground hover:underline" onClick={() => setMode("recuperar")}>
                    Esqueci minha senha
                  </button>
                </form>
              </TabsContent>
              <TabsContent value="cadastrar">
                <form
                  className="space-y-4"
                  onSubmit={signup.handleSubmit(async (v) => {
                    const { data, error } = await supabase.auth.signUp({
                      email: v.email,
                      password: v.password,
                      options: { data: { nome: v.nome }, emailRedirectTo: window.location.origin },
                    });
                    if (error) {
                      if (/confirm/i.test(error.message)) return toast.success("Enviamos um link de confirmação para seu e-mail");
                      return toast.error(error.message);
                    }
                    if (!data.session) {
                      toast.success("Enviamos um link de confirmação para seu e-mail");
                      signup.reset();
                      setMode("entrar");
                    }
                  })}
                >
                  <Field label="Nome" {...signup.register("nome")} error={signup.formState.errors.nome?.message} />
                  <Field label="E-mail" type="email" {...signup.register("email")} error={signup.formState.errors.email?.message} />
                  <Field label="Senha" type="password" autoComplete="new-password" {...signup.register("password")} error={signup.formState.errors.password?.message} />
                  <Button className="w-full" disabled={signup.formState.isSubmitting}>Criar conta</Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
