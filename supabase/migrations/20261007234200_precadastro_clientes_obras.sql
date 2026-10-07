-- Pré-cadastro com os clientes que já tinham solicitação (aplicado em 07/10/2026)
-- Pré-cadastro com os clientes que já têm solicitação
insert into public.clientes_obras (nome, empreendimento, unidade, endereco, criado_por)
select distinct on (lower(trim(s.cliente))) trim(s.cliente), s.empreendimento, s.unidade, s.endereco_obra, null::uuid
from public.solicitacoes s
where char_length(trim(coalesce(s.cliente, ''))) >= 2
  and not exists (select 1 from public.clientes_obras c where lower(c.nome) = lower(trim(s.cliente)))
order by lower(trim(s.cliente)), s.created_at desc;
