-- Extração de itens a partir do projeto executivo
alter table public.solicitacao_itens
  add column if not exists categoria text,
  add column if not exists especificacao text,
  add column if not exists link_referencia text,
  add column if not exists origem text not null default 'manual' check (origem in ('manual','projeto_executivo'));

alter table public.solicitacoes
  add column if not exists area_m2 numeric(8,2),
  add column if not exists prazo_obra text,
  add column if not exists extracao_id uuid;

-- Log de cada leitura automática (auditoria, custo e melhoria do prompt)
create table if not exists public.extracoes_projeto (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome_arquivo text,
  paginas int,
  caracteres int,
  modelo text,
  status text not null default 'processando' check (status in ('processando','concluida','erro')),
  resultado jsonb,
  erro text,
  tokens_entrada int,
  tokens_saida int,
  duracao_ms int,
  solicitacao_id uuid references public.solicitacoes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists extracoes_usuario_idx on public.extracoes_projeto(usuario_id, created_at desc);

alter table public.solicitacoes
  drop constraint if exists solicitacoes_extracao_fk,
  add constraint solicitacoes_extracao_fk foreign key (extracao_id) references public.extracoes_projeto(id) on delete set null;

alter table public.extracoes_projeto enable row level security;

create policy "usuario ve suas extracoes ou compras ve todas" on public.extracoes_projeto
  for select to authenticated using (usuario_id = auth.uid() or public.is_compras(auth.uid()));
create policy "usuario cria extracao" on public.extracoes_projeto
  for insert to authenticated with check (usuario_id = auth.uid());
create policy "usuario atualiza sua extracao" on public.extracoes_projeto
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Recria a view do painel incluindo as novas colunas
drop view if exists public.painel_solicitacoes;
create view public.painel_solicitacoes
with (security_invoker = on) as
select
  s.id, s.codigo, s.numero, s.cliente, s.empreendimento, s.unidade, s.titulo,
  s.prioridade, s.data_necessaria, s.status, s.created_at, s.updated_at,
  s.solicitante_id, ps.nome as solicitante_nome,
  s.responsavel_compras_id, pr.nome as responsavel_nome,
  (select count(*) from public.solicitacao_itens i where i.solicitacao_id = s.id) as qtd_itens,
  (select count(*) from public.solicitacao_anexos a where a.solicitacao_id = s.id) as qtd_anexos,
  coalesce((select sum(c.valor_total) from public.compras c where c.solicitacao_id = s.id), 0) as custo_total,
  (select string_agg(distinct c.fornecedor, ', ') from public.compras c where c.solicitacao_id = s.id) as fornecedores,
  (select min(c.previsao_entrega) from public.compras c where c.solicitacao_id = s.id and c.data_entrega_real is null) as proxima_entrega,
  (select string_agg(distinct c.local_entrega, ', ') from public.compras c where c.solicitacao_id = s.id) as locais_entrega,
  (s.data_necessaria is not null and s.data_necessaria < current_date
     and s.status not in ('entregue','cancelada')) as atrasada,
  (s.extracao_id is not null) as via_projeto_executivo
from public.solicitacoes s
left join public.profiles ps on ps.id = s.solicitante_id
left join public.profiles pr on pr.id = s.responsavel_compras_id;
