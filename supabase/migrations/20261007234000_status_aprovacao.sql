-- Etapas de aprovação: Nova > Em cotação > Aprovação > Aprovado > Comprada > Entregue
alter type public.status_solicitacao add value if not exists 'aguardando_aprovacao' after 'em_cotacao';
alter type public.status_solicitacao add value if not exists 'aprovada' after 'aguardando_aprovacao';
