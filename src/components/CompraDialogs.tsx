import { useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FORMAS_PAGAMENTO, LOCAIS_ENTREGA, maskBRL, numToMask, parseBRL } from "@/lib/format";

export interface Compra {
  id: string;
  solicitacao_id: string;
  fornecedor: string;
  fornecedor_contato: string | null;
  descricao_itens: string | null;
  valor_total: number;
  forma_pagamento: string | null;
  numero_pedido: string | null;
  data_compra: string;
  previsao_entrega: string | null;
  local_entrega: string | null;
  endereco_entrega: string | null;
  data_entrega_real: string | null;
  recebido_por: string | null;
  observacao: string | null;
}

const today = () => format(new Date(), "yyyy-MM-dd");

const schema = z.object({
  fornecedor: z.string().trim().min(1, "Informe o fornecedor").max(150),
  fornecedor_contato: z.string().trim().max(150).optional(),
  descricao_itens: z.string().trim().max(2000).optional(),
  valor: z.string().refine((v) => parseBRL(v) > 0, "Informe o valor"),
  forma_pagamento: z.string().optional(),
  numero_pedido: z.string().trim().max(80).optional(),
  data_compra: z.string().min(1, "Informe a data"),
  previsao_entrega: z.string().optional(),
  local_entrega: z.string(),
  endereco_entrega: z.string().trim().max(300).optional(),
  observacao: z.string().trim().max(1000).optional(),
});
type V = z.infer<typeof schema>;

const Err = ({ m }: { m?: string }) => (m ? <p className="text-xs text-destructive">{m}</p> : null);

export function CompraDialog({
  open,
  onOpenChange,
  solicitacaoId,
  enderecoObra,
  compra,
  sugestao,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  solicitacaoId: string;
  enderecoObra: string | null;
  compra?: Compra | null;
  sugestao?: Partial<Compra> | null;
  onSaved: () => void;
}) {
  const form = useForm<V>({ resolver: zodResolver(schema) });
  // Preenche só ao abrir: antes, qualquer atualização da tela (tempo real, voltar para a aba)
  // reiniciava o formulário e apagava o que já tinha sido digitado.
  const preenchido = useRef(false);
  useEffect(() => {
    if (!open) {
      preenchido.current = false;
      return;
    }
    if (preenchido.current) return;
    preenchido.current = true;
    const base = compra ?? (sugestao as Compra | null | undefined);
    form.reset({
      fornecedor: base?.fornecedor ?? "",
      fornecedor_contato: base?.fornecedor_contato ?? "",
      descricao_itens: base?.descricao_itens ?? "",
      valor: numToMask(base?.valor_total),
      forma_pagamento: base?.forma_pagamento ?? undefined,
      numero_pedido: base?.numero_pedido ?? "",
      data_compra: base?.data_compra ?? today(),
      previsao_entrega: base?.previsao_entrega ?? "",
      local_entrega: base?.local_entrega ?? "Obra",
      endereco_entrega: base?.endereco_entrega ?? enderecoObra ?? "",
      observacao: base?.observacao ?? "",
    });
  }, [open, compra, sugestao, enderecoObra, form]);
  const e = form.formState.errors;

  const submit = form.handleSubmit(async (v) => {
    const payload = {
      solicitacao_id: solicitacaoId,
      fornecedor: v.fornecedor,
      fornecedor_contato: v.fornecedor_contato || null,
      descricao_itens: v.descricao_itens || null,
      valor_total: parseBRL(v.valor),
      forma_pagamento: v.forma_pagamento || null,
      numero_pedido: v.numero_pedido || null,
      data_compra: v.data_compra,
      previsao_entrega: v.previsao_entrega || null,
      local_entrega: v.local_entrega,
      endereco_entrega: v.endereco_entrega || null,
      observacao: v.observacao || null,
    };
    const { error } = compra
      ? await supabase.from("compras").update(payload).eq("id", compra.id)
      : await supabase.from("compras").insert(payload);
    if (error) return toast.error("Erro ao salvar compra: " + error.message);
    toast.success(compra ? "Compra atualizada" : "Compra registrada");
    onOpenChange(false);
    onSaved();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{compra ? "Editar compra" : "Registrar compra"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Fornecedor *</Label><Input {...form.register("fornecedor")} /><Err m={e.fornecedor?.message} /></div>
          <div className="space-y-1.5"><Label>Contato do fornecedor</Label><Input {...form.register("fornecedor_contato")} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Itens comprados</Label><Textarea rows={2} {...form.register("descricao_itens")} /></div>
          <div className="space-y-1.5">
            <Label>Valor total (R$) *</Label>
            <Controller control={form.control} name="valor" render={({ field }) => (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input className="pl-9 tabular-nums" inputMode="numeric" placeholder="0,00" value={field.value ?? ""} onChange={(ev) => field.onChange(maskBRL(ev.target.value))} />
              </div>
            )} />
            <Err m={e.valor?.message} />
          </div>
          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <Controller control={form.control} name="forma_pagamento" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {/* Condição vinda da cotação ("30/60 boleto") ou valor antigo: mostra o que será salvo. */}
                  {field.value && !FORMAS_PAGAMENTO.includes(field.value) && <SelectItem value={field.value}>{field.value}</SelectItem>}
                  {FORMAS_PAGAMENTO.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
          </div>
          <div className="space-y-1.5"><Label>Nº do pedido / NF</Label><Input {...form.register("numero_pedido")} /></div>
          <div className="space-y-1.5"><Label>Data da compra *</Label><Input type="date" {...form.register("data_compra")} /><Err m={e.data_compra?.message} /></div>
          <div className="space-y-1.5"><Label>Previsão de entrega</Label><Input type="date" {...form.register("previsao_entrega")} /></div>
          <div className="space-y-1.5">
            <Label>Local de entrega</Label>
            <Controller control={form.control} name="local_entrega" render={({ field }) => (
              <Select value={field.value} onValueChange={(v) => {
                field.onChange(v);
                if (v === "Obra" && enderecoObra) form.setValue("endereco_entrega", enderecoObra);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LOCAIS_ENTREGA.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label>Endereço de entrega</Label><Input {...form.register("endereco_entrega")} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Observação</Label><Textarea rows={2} {...form.register("observacao")} /></div>
          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecebimentoDialog({
  compra,
  onOpenChange,
  onSaved,
}: {
  compra: Compra | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const form = useForm<{ data: string; recebido_por: string }>();
  useEffect(() => {
    if (compra) form.reset({ data: compra.data_entrega_real ?? today(), recebido_por: compra.recebido_por ?? "" });
  }, [compra, form]);

  return (
    <Dialog open={!!compra} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Confirmar recebimento</DialogTitle></DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (v) => {
            if (!v.data) return toast.error("Informe a data de entrega");
            const { error } = await supabase
              .from("compras")
              .update({ data_entrega_real: v.data, recebido_por: v.recebido_por.trim().slice(0, 150) || null })
              .eq("id", compra!.id);
            if (error) return toast.error(error.message);
            toast.success("Recebimento confirmado");
            onOpenChange(false);
            onSaved();
          })}
        >
          <div className="space-y-1.5"><Label>Data da entrega</Label><Input type="date" {...form.register("data")} /></div>
          <div className="space-y-1.5"><Label>Recebido por</Label><Input {...form.register("recebido_por")} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>Confirmar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
