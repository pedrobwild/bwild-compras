-- Rótulo da nova etapa no histórico. Sem ele, label_status devolve null e a
-- mudança para "Cronograma confirmado" falharia ao gravar o evento (descricao not null).
create or replace function public.label_status(s public.status_solicitacao)
returns text language sql immutable set search_path = public as $$
  select case s
    when 'nova' then 'Nova'
    when 'cronograma_confirmado' then 'Cronograma confirmado'
    when 'em_cotacao' then 'Em cotação'
    when 'aguardando_aprovacao' then 'Aprovação'
    when 'aprovada' then 'Aprovado'
    when 'comprada' then 'Comprada'
    when 'entregue_parcial' then 'Entregue parcialmente'
    when 'entregue' then 'Entregue'
    when 'cancelada' then 'Cancelada'
  end $$;

-- Anexos das cotações (PDF/imagem da proposta do fornecedor), no bucket projetos-executivos
create table if not exists public.cotacao_anexos (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.cotacoes(id) on delete cascade,
  nome_arquivo text not null,
  storage_path text not null,
  tamanho_bytes bigint,
  tipo_mime text,
  enviado_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists cotacao_anexos_cotacao_idx on public.cotacao_anexos (cotacao_id);

alter table public.cotacao_anexos enable row level security;
create policy "logados veem anexos de cotacao" on public.cotacao_anexos
  for select to authenticated using (true);
create policy "compras grava anexos de cotacao" on public.cotacao_anexos
  for all to authenticated
  using (public.is_compras(auth.uid())) with check (public.is_compras(auth.uid()));

alter publication supabase_realtime add table public.cotacao_anexos;
