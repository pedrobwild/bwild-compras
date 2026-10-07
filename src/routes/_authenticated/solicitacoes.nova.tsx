import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useFieldArray, useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Info, FileSearch, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDropzone, type PendingFile } from "@/components/FileDropzone";
import { uploadAnexo } from "@/lib/upload";
import { AMBIENTES, CATEGORIAS, UNIDADES } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { useLeituraProjeto, limparRascunho, type ValidacaoAplicada } from "@/components/ValidacaoProjeto";

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
  quantidade: z.preprocess(
    (v) => (v === "" || v == null || (typeof v === "number" && Number.isNaN(v)) ? undefined : typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z.number({ message: "Informe a qtd" }).positive("Qtd > 0").max(1e9),
  ),
  unidade: z.string().max(20),
  ambiente: z.string().max(60).optional(),
  referencia_projeto: z.string().max(200).optional(),
  observacao: z.string().max(500).optional(),
  categoria: z.string().max(60).optional(),
  especificacao: z.string().max(2000).optional(),
  link_referencia: z.string().max(1000).optional(),
  origem: z.enum(["manual", "projeto_executivo"]).optional(),
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

const emptyItem = { descricao: "", quantidade: 1, unidade: "un", ambiente: "", referencia_projeto: "", observacao: "", categoria: "", especificacao: "", link_referencia: "", origem: "manual" as const };

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
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "itens" });
  const e = form.formState.errors;
  const [autoLer, setAutoLer] = useState(true);
  const [extra, setExtra] = useState<{ extracao_id: string | null; area_m2: number | null; prazo_obra: string | null }>({ extracao_id: null, area_m2: null, prazo_obra: null });

  const aplicarValidacao = (v: ValidacaoAplicada) => {
    const cur = form.getValues();
    const obra = { cliente: v.obra.cliente.trim(), empreendimento: v.obra.empreendimento.trim(), unidade: v.obra.unidade.trim(), endereco_obra: v.obra.endereco.trim() } as const;
    const chaves = Object.keys(obra) as (keyof typeof obra)[];
    const conflito = chaves.some((k) => obra[k] && cur[k]?.trim() && cur[k]!.trim() !== obra[k]);
    const substituir = !conflito || window.confirm("Substituir dados da obra pelos do projeto?");
    for (const k of chaves) if (obra[k] && (substituir || !cur[k]?.trim())) form.setValue(k, obra[k]);
    if (!cur.titulo?.trim()) {
      const emp = form.getValues("empreendimento") || "";
      const un = form.getValues("unidade") || "";
      form.setValue("titulo", `Compras projeto executivo — ${[emp, un].filter(Boolean).join(" ")}`.trim().replace(/ —$/, ""));
    }
    if (v.avisos.length) {
      const bloco = "Avisos do projeto:\n" + v.avisos.map((a) => `- ${a}`).join("\n");
      form.setValue("descricao", [cur.descricao?.trim(), bloco].filter(Boolean).join("\n\n").slice(0, 2000));
    }
    const novos = v.itens.map((i) => ({
      descricao: i.descricao, quantidade: (i.quantidade ?? "") as unknown as number, unidade: i.unidade || "un", ambiente: i.ambiente,
      referencia_projeto: i.referencia_projeto, observacao: i.observacao, categoria: i.categoria, especificacao: i.especificacao,
      link_referencia: i.link_referencia, origem: "projeto_executivo" as const,
    }));
    const atuais = cur.itens ?? [];
    const soVazio = atuais.length === 1 && !atuais[0].descricao?.trim();
    if (soVazio || atuais.length === 0) replace(novos);
    else append(novos);
    setExtra({ extracao_id: v.extracao_id, area_m2: v.area_m2, prazo_obra: v.prazo_obra });
    toast.success(`${novos.length} itens aplicados à solicitação`);
  };
  const leitura = useLeituraProjeto((v) => aplicarValidacao(v));
  const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const onFilesChange = (next: PendingFile[]) => {
    const novosPdf = next.filter((pf) => !files.includes(pf) && isPdf(pf.file));
    setFiles(next);
    if (autoLer && novosPdf.length && !leitura.ocupado) leitura.ler(novosPdf[0].file, novosPdf[0].file.name);
  };

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
          area_m2: extra.area_m2,
          prazo_obra: extra.prazo_obra,
          extracao_id: extra.extracao_id,
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
          categoria: i.categoria || null,
          especificacao: i.especificacao?.trim() || null,
          link_referencia: i.link_referencia?.trim() || null,
          origem: i.origem ?? "manual",
        })),
      );
      if (ie) throw ie;

      if (extra.extracao_id) {
        const { error: xe } = await supabase.from("extracoes_projeto").update({ solicitacao_id: id }).eq("id", extra.extracao_id);
        if (xe) console.warn("Não foi possível vincular a leitura do projeto:", xe.message);
      }
      files.forEach((f) => limparRascunho(f.file.name));

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
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border p-3 text-sm">
          <span><span className="font-medium">Identificar itens automaticamente</span><span className="block text-xs text-muted-foreground">Ao anexar um PDF, a IA lê o projeto e sugere os itens para você validar.</span></span>
          <Switch checked={autoLer} onCheckedChange={setAutoLer} />
        </label>
        <FileDropzone files={files} onChange={onFilesChange} disabled={saving}
          renderActions={(pf) => isPdf(pf.file) ? (
            <Button type="button" size="sm" variant="outline" disabled={leitura.ocupado || saving} onClick={() => leitura.ler(pf.file, pf.file.name)}>
              <FileSearch className="h-4 w-4" /> Ler projeto e identificar itens
            </Button>
          ) : null} />
        {leitura.element}
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
  const valores = (form.watch("itens") ?? []) as { categoria?: string }[];
  const agrupar = fields.length > 10;
  const grupos: [string, number[]][] = [];
  if (agrupar) {
    const m = new Map<string, number[]>();
    fields.forEach((_, i) => { const c = valores[i]?.categoria || "Sem categoria"; m.set(c, [...(m.get(c) ?? []), i]); });
    grupos.push(...[...m.entries()].sort((a, b) => (CATEGORIAS.indexOf(a[0]) + 100) % 120 - (CATEGORIAS.indexOf(b[0]) + 100) % 120));
  } else grupos.push(["", fields.map((_, i) => i)]);
  return (
    <div className="space-y-4">
      {grupos.map(([cat, idxs]) => (
        <div key={cat || "todos"} className="space-y-3">
          {agrupar && <h3 className="text-sm font-semibold">{cat} <span className="font-normal text-muted-foreground">({idxs.length})</span></h3>}
          {idxs.map((i) => (
            <ItemCard key={fields[i].id} form={form} i={i} err={errs[i]} podeRemover={fields.length > 1} onRemove={() => remove(i)} />
          ))}
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ItemCard({ form, i, err, podeRemover, onRemove }: { form: any; i: number; err: any; podeRemover: boolean; onRemove: () => void }) {
  const origem = form.watch(`itens.${i}.origem`);
  const link = (form.watch(`itens.${i}.link_referencia`) ?? "") as string;
  const temDetalhe = !!(form.getValues(`itens.${i}.especificacao`) || link);
  const [aberto, setAberto] = useState(temDetalhe);
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          Item {i + 1}
          {origem === "projeto_executivo" && <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">do projeto</span>}
        </span>
        {podeRemover && (
          <button type="button" aria-label="Remover item" onClick={onRemove} className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-12">
        <div className="space-y-1 md:col-span-6">
          <Label className="text-xs">Descrição *</Label>
          <Input {...form.register(`itens.${i}.descricao`)} />
          <Err m={err?.descricao?.message} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Qtd</Label>
          <Input inputMode="decimal" {...form.register(`itens.${i}.quantidade`)} />
          <Err m={err?.quantidade?.message} />
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
        <div className="space-y-1 md:col-span-4">
          <Label className="text-xs">Categoria</Label>
          <Controller control={form.control} name={`itens.${i}.categoria`} render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{CATEGORIAS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </div>
        <div className="space-y-1 md:col-span-4">
          <Label className="text-xs">Referência no projeto (folha)</Label>
          <Input placeholder="Folha 09 – Marcenaria cozinha" {...form.register(`itens.${i}.referencia_projeto`)} />
        </div>
        <div className="space-y-1 md:col-span-4">
          <Label className="text-xs">Observação</Label>
          <Input {...form.register(`itens.${i}.observacao`)} />
        </div>
      </div>
      <button type="button" onClick={() => setAberto(!aberto)} className="mt-2 flex min-h-9 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Mais detalhes (especificação e link)
      </button>
      {aberto && (
        <div className="mt-2 grid gap-3 md:grid-cols-12">
          <div className="space-y-1 md:col-span-7">
            <Label className="text-xs">Especificação</Label>
            <Textarea rows={2} className="field-sizing-content" {...form.register(`itens.${i}.especificacao`)} />
          </div>
          <div className="space-y-1 md:col-span-5">
            <Label className="text-xs">Link de referência</Label>
            <div className="flex gap-1">
              <Input placeholder="https://" {...form.register(`itens.${i}.link_referencia`)} />
              {/^https?:\/\//i.test(link) && (
                <a href={link} target="_blank" rel="noopener noreferrer" aria-label="Abrir link" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border hover:bg-muted"><ExternalLink className="h-4 w-4" /></a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
