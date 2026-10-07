import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nova senha — Bwild Compras" },
      { name: "description", content: "Defina uma nova senha de acesso ao Bwild Compras." },
      { property: "og:title", content: "Nova senha — Bwild Compras" },
      { property: "og:description", content: "Defina uma nova senha de acesso ao Bwild Compras." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 6) return toast.error("A senha precisa de ao menos 6 caracteres");
          setBusy(true);
          const { error } = await supabase.auth.updateUser({ password: pw });
          setBusy(false);
          if (error) return toast.error(error.message);
          toast.success("Senha atualizada");
          navigate({ to: "/painel" });
        }}
      >
        <h1 className="text-lg font-semibold">Definir nova senha</h1>
        <div className="space-y-1.5">
          <Label htmlFor="pw">Nova senha</Label>
          <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <Button className="w-full" disabled={busy}>Salvar senha</Button>
      </form>
    </div>
  );
}
