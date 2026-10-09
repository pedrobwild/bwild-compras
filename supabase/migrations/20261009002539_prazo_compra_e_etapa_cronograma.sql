-- Prazo para efetivar a compra (Nova solicitação e detalhe)
alter table public.solicitacoes add column if not exists prazo_compra date;

-- Etapa "Cronograma confirmado", entre Nova e Em cotação
alter type public.status_solicitacao add value if not exists 'cronograma_confirmado' after 'nova';
