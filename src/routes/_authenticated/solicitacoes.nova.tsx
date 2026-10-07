import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useFieldArray, useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDropzone, type PendingFile } from "@/components/FileDropzone";
import { uploadAnexo } from "@/lib/upload";
import { AMBIENTES, UNIDADES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/solicitacoes/nova")({
  head: () => ({
    meta: [
      { title: "Nova solicitação — Bwild Compras" },
      { name: "description", content: "Peça materiais e serviços para a obra." },
      { property: "og:title", content: "Nova solicitação — Bwild Compras" },
      { property: "og:description", content: "Peça materiais e serviços para a obra." },
    ],
  }),
  component: NovaSolicitacao,
});

const itemSchema = z.object({
  descricao: z.string().trim().min(1, "Descreva o item").max(500),
  quantidade: z.coerce.number().positive("Qtd > 0").max(1e9),
  unidade: z.string().max(20),
  ambiente: z.string().max(60).optional(),
  referencia_projeto: z.string().max(200).optional(),
  observacao: z.string().max(500).optional(),
});

const schema = z.object({
  cliente: z.string().trim().min(1, "Informe o cliente").max(150),
  empreendimento: z.string().trim().max(150).optional(),
  unidade: z.string().trim().max(60).optional(),
  endereco_obra: z.string().trim().max(300).optional(),
  titulo: z.string().trim().min(1, "Informe um título").max(200),
  descricao: z.string().trim().max(2000).optional(),
  prioridade: z.enum(["baixa", "normal", "urgente"]),
  data_necessaria: z.string().optional(),
  itens: z.array(itemSchema).min(1, "Adicione pelo menos 1 item"),
});
type FormValues = z.infer<typeof schema>;

const emptyItem = { descricao: "", quantidade: 1, unidade: "un", ambiente: "", referencia_projeto: "", observacao: "" };

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4 md:p-6">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
const Err = ({ m }: { m?: string }) => (m ? <p className="text-xs text-destructive">{m}</p> : null);

function NovaSolicitacao() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: sugestoes } = useQuery({
    queryKey: ["sugestoes-obra"],
    queryFn: async () => {
      const { data } = await supabase.from("solicitacoes").select("cliente, empreendimento, endereco_obra").order("created_at", { ascending: false }).limit(1000);
      const rows = (data ?? []) as { cliente: string; empreendimento: string | null; endereco_obra: string | null }[];
      return {
        clientes: [...new Set(rows.map((r) => r.cliente).filter(Boolean))],
        empreendimentos: [...new Set(rows.map((r) => r.empreendimento).filter(Boolean))] as string[],
        enderecos: rows,
      };
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { prioridade: "normal", itens: [emptyItem] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "itens" });
  const e = form.formState.errors;

  const onSubmit = async (v: FormValues) => {
    setSaving(true);
    try {
      const { data: sol, error } = await supabase
        .from("solicitacoes")
        .insert({
          cliente: v.cliente,
          empreendimento: v.empreendimento || null,
          unidade: v.unidade || null,
          endereco_obra: v.endereco_obra || null,
          titulo: v.titulo,
          descricao: v.descricao || null,
          prioridade: v.prioridade,
          data_necessaria: v.data_necessaria || null,
        })
        .select("id, codigo")
        .single();
      if (error) throw error;
      const id = sol.id as string;

      const { error: ie } = await supabase.from("solicitacao_itens").insert(
        v.itens.map((i) => ({
          solicitacao_id: id,
          descricao: i.descricao,
          quantidade: i.quantidade,
          unidade: i.unidade || "un",
          ambiente: i.ambiente || null,
          referencia_projeto: i.referencia_projeto || null,
          observacao: i.observacao || null,
        })),
      );
      if (ie) throw ie;

      for (let idx = 0; idx < files.length; idx++) {
        try {
          await uploadAnexo(id, files[idx].file, (p) =>
            setFiles((prev) => prev.map((f, j) => (j === idx ? { ...f, progress: p } : f))),
          );
        } catch (err) {
          toast.error((err as Error).message);
        }
      }

      qc.invalidateQueries({ queryKey: ["painel"] });
      toast.success(`Solicitação ${sol.codigo} enviada para Compras`);
      navigate({ to: "/solicitacoes/$id", params: { id } });
    } catch (err) {
      toast.error("Não foi possível salvar: " + (err as Error).message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nova solicitação</h1>
        <p className="text-sm text-muted-foreground">Descreva o que a obra precisa. Compras recebe na hora.</p>
      </div>

      <datalist id="dl-clientes">{sugestoes?.clientes.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-emp">{sugestoes?.empreendimentos.map((c) => <option key={c} value={c} />)}</datalist>

      <Section title="Obra">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Cliente *</Label>
            <Input list="dl-clientes" {...form.register("cliente")}
              onBlur={(ev) => {
                const hit = sugestoes?.enderecos.find((r) => r.cliente === ev.target.value && r.endereco_obra);
                if (hit && !form.getValues("endereco_obra")) form.setValue("endereco_obra", hit.endereco_obra ?? "");
                if (hit?.empreendimento && !form.getValues("empreendimento")) form.setValue("empreendimento", hit.empreendimento);
              }}
            />
            <Err m={e.cliente?.message} />
          </div>
          <div className="space-y-1.5">
            <Label>Empreendimento</Label>
            <Input list="dl-emp" {...form.register("empreendimento")} />
          </div>
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Input placeholder="Ex.: Apto 1204" {...form.register("unidade")} />
          </div>
          <div className="space-y-1.5">
            <Label>Endereço da obra</Label>
            <Input {...form.register("endereco_obra")} />
          </div>
        </div>
      </Section>

      <Section title="Pedido">
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input placeholder="Ex.: Ferragens marcenaria cozinha" {...form.register("titulo")} />
          <Err m={e.titulo?.message} />
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea rows={3} {...form.register("descricao")} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Controller control={form.control} name="prioridade" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </div>
          <div className="space-y-1.5">
            <Label>Data necessária na obra</Label>
            <Input type="date" {...form.register("data_necessaria")} />
          </div>
        </div>
      </Section>

      <Section title="Itens">
        <ItensFields form={form} fields={fields} remove={remove} />
        <Err m={e.itens?.message || e.itens?.root?.message} />
        <Button type="button" variant="outline" onClick={() => append(emptyItem)}><Plus className="h-4 w-4" /> Adicionar item</Button>
      </Section>

      <Section title="Projeto executivo">
        <div className="flex gap-2 rounded-md bg-accent/10 p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>Recomendamos anexar o projeto executivo do cliente (folhas de marcenaria, elétrica, etc.) para Compras cotar certo.</span>
        </div>
        <FileDropzone files={files} onChange={setFiles} disabled={saving} />
      </Section>

      <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-lg border bg-card/95 p-3 backdrop-blur lg:bottom-4">
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/painel" })}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? "Enviando…" : "Enviar para Compras"}</Button>
      </div>
    </form>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ItensFields({ form, fields, remove }: { form: any; fields: { id: string }[]; remove: (i: number) => void }) {
  const errs = form.formState.errors.itens ?? [];
  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <div key={f.id} className="rounded-md border bg-background p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Item {i + 1}</span>
            {fields.length > 1 && (
              <button type="button" aria-label="Remover item" onClick={() => remove(i)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-12">
            <div className="space-y-1 md:col-span-6">
              <Label className="text-xs">Descrição *</Label>
              <Input {...form.register(`itens.${i}.descricao`)} />
              <Err m={errs[i]?.descricao?.message} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Qtd</Label>
              <Input type="number" step="any" inputMode="decimal" {...form.register(`itens.${i}.quantidade`)} />
              <Err m={errs[i]?.quantidade?.message} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Unidade</Label>
              <Controller control={form.control} name={`itens.${i}.unidade`} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Ambiente</Label>
              <Controller control={form.control} name={`itens.${i}.ambiente`} render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{AMBIENTES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1 md:col-span-6">
              <Label className="text-xs">Referência no projeto (folha)</Label>
              <Input placeholder="Folha 09 – Marcenaria cozinha" {...form.register(`itens.${i}.referencia_projeto`)} />
            </div>
            <div className="space-y-1 md:col-span-6">
              <Label className="text-xs">Observação</Label>
              <Input {...form.register(`itens.${i}.observacao`)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
