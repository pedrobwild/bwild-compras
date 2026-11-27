# Três ajustes no Bwild Compras

## O que o banco mostra hoje (verificado antes de mudar algo)

**Compra que "não apareceu" no painel.** As 51 compras registradas chegam todas ao painel: nenhuma fica sem linha, e custo e fornecedor batem com a soma das compras. O que confunde é outra coisa:

- **Previsão some depois da entrega.** A coluna Previsão mostra só entregas ainda não recebidas. Por isso 9 solicitações já entregues aparecem com "—", mesmo tendo previsão registrada.
- **Compras salvas sem previsão.** 7 compras foram gravadas sem previsão de entrega, então não há data para mostrar.
- **Compra duplicada.** A SC-0406 tem a mesma compra (UseReuse, R$ 2.469,90) registrada duas vezes, em 19/11 e hoje às 15h34. A de hoje está sem previsão e com local "Obra". O painel soma as duas (R$ 4.939,80), junta os locais ("Obra, Retirada no fornecedor") e mostra a previsão antiga, de 25/11. Provavelmente é o caso relatado. A SC-0432 também tem compra duplicada, mas foi cancelada.
- **Status voltou depois da compra.** Na SC-0413, a compra foi registrada e o card foi para Comprado. No mesmo minuto, voltou para Solicitação de pagamento. Por isso ela aparece em pagamento mesmo tendo compra. Ainda não sei o que causou essa volta.

**Dados para o prazo do fornecedor.** São 402 solicitações. Destas, 187 têm as duas datas, e em nenhuma o prazo de compra cai depois da data na obra. 215 não têm prazo de compra e 205 não têm data na obra. Das 74 cotações escolhidas, 8 estão sem prazo em dias.

## Proposta de correção dos defeitos (só depois do seu ok)

1. A coluna Previsão passa a mostrar a última previsão registrada também para itens já entregues.
2. Ao registrar uma compra, avisar quando já existe outra igual (mesmo fornecedor e valor) e pedir confirmação. Nenhuma compra existente é apagada; você decide o que fazer com as duplicadas da SC-0406 e da SC-0432.
3. Investigar a volta de status da SC-0413 sem mexer em `guard_aprovacao` nem em `sync_status_compras`, e trazer o resultado antes de corrigir.

## 1. Prazo do fornecedor no lugar do prazo de compra

- **Nova solicitação:** o campo de data "Prazo para efetivar a compra" vira **"Prazo do fornecedor (dias)"**, número inteiro obrigatório, de 0 a 365. Logo abaixo aparece **"Comprar até"**, só para leitura: data na obra menos o prazo, em dias corridos. Se essa data já passou, aparece um aviso, mas o envio não é bloqueado.
- **Tela da solicitação:** no cabeçalho, edita-se o prazo do fornecedor e a data na obra. "Comprar até" é recalculado sozinho.
- **Banco:** um gatilho novo recalcula o prazo de compra sempre que a data na obra ou o prazo do fornecedor mudar. Se não houver prazo do fornecedor, o prazo de compra atual fica como está. As regras de atraso continuam lendo o prazo de compra.
- **Solicitações antigas:** as 187 que têm as duas datas recebem o prazo do fornecedor pela diferença entre elas, e o prazo de compra não muda. As outras ficam como estão.
- **Cotações:** ao escolher uma cotação com prazo em dias diferente do informado, aparece a pergunta "Atualizar o prazo do fornecedor para N dias?". Escolher a cotação não depende da resposta.

## 2. Fornecedor, custo, previsão e local desde a solicitação

- **Nova solicitação:** campos opcionais de fornecedor previsto, valor estimado e local de entrega, com as mesmas opções do registro de compra.
- **Painel:** cada coluna mostra a melhor informação disponível, nesta ordem: compra registrada, depois cotação escolhida, depois dados da solicitação. A previsão vem da compra ou, se não houver compra, da data "Na obra até".
- **Etiqueta "previsto":** o que ainda não é compra recebe uma etiqueta discreta. Ela aparece na tabela e nos cartões do celular.

## 3. Gasto por semana no topo do painel

- **Bloco "Gasto por semana":** fica acima da lista, com as colunas Atrasado, Esta semana, Próxima semana, Em 2 semanas, Em 3 semanas e Depois. A semana vai de segunda a domingo, no fuso de São Paulo.
- **Linhas:**
  - Já comprado: compra registrada, pela data da compra.
  - Em pagamento: status Solicitação de pagamento.
  - A comprar: demais etapas antes da compra, sem as canceladas.
  - Total.
- **Atrasado:** só o que ainda não foi comprado e tem o prazo de compra vencido.
- **Valores:** seguem a mesma ordem do item 2, sem somar compra e cotação da mesma solicitação. Cada semana mostra quantas solicitações estão sem valor nenhum.
- **Filtro:** tocar numa semana filtra a lista do painel, com um botão para limpar.
- **Cards de resumo:** "Custo do mês" vira **"Comprado no mês"**, calculado como hoje, e **"Previsto para o mês"**, que soma o que falta comprar com prazo de compra no mês.
- **No celular:** o bloco vira uma lista de semanas com o total; tocar numa semana mostra o detalhe.
- **Compras de semanas passadas:** não entram no bloco, porque não há coluna de passado. O mês corrente continua coberto pelo card "Comprado no mês".

## Detalhes técnicos

- **Migração** (salva em `docs/sql/` e aplicada no Supabase conectado antes das telas):
  - `solicitacoes`: colunas novas `prazo_fornecedor_dias int`, `fornecedor_previsto text`, `valor_estimado numeric`, `local_entrega_previsto text`, com validação por gatilho (0–365, valor ≥ 0, limites de texto).
  - Gatilho BEFORE INSERT/UPDATE `calcular_prazo_compra()` e o backfill das 187 solicitações.
  - `painel_solicitacoes`: recriada mantendo todas as colunas e cálculos de atraso iguais, e acrescentando no fim:
    - `prazo_fornecedor_dias`;
    - `fornecedor_exibicao` e `valor_exibicao`, ambos com origem `compra|cotacao|solicitacao`;
    - `local_exibicao`;
    - `previsao_exibicao`, que inclui entregues;
    - `data_compra_min`.
  - Grants iguais aos atuais e `security_invoker` mantido.
- **Sem mudanças em** `guard_aprovacao`, `sync_status_compras`, RLS ou tabelas existentes além dessas colunas.
- **Detecção de colunas:** `useRecursosBanco` ganha as flags `prazoFornecedor` e `previstos`. A tela esconde o que depender de coluna inexistente e volta ao comportamento atual.
- **Helpers puros**, sem dependência do navegador:
  - `src/lib/prazos.ts`: `calcularComprarAte`, `prazoVencido`, `diferencaDias`.
  - `src/lib/gasto-semanal.ts`: `valorPrioritario`, `semanaDe` com segunda-feira e fuso America/Sao_Paulo, `agruparPorSemana`.
- **Gasto semanal:** "Já comprado" vem das compras (`valor_total`, `data_compra`), lidas paginadas; o restante vem das linhas do painel que já são carregadas.
- **Arquivos alterados:** `solicitacoes.nova.tsx`, `solicitacoes.$id.tsx` (cabeçalho de prazos), `CotacoesTab.tsx` (confirmação), `CompraDialogs.tsx` (aviso de duplicada), `painel.tsx` e um componente novo `GastoSemanal.tsx`.
- **Testes:** atualizar os que citam "Prazo para efetivar compra" e criar testes para o cálculo do prazo, a ordem de prioridade dos valores e o agrupamento por semana (virada de domingo para segunda, fuso e coluna Depois). Rodar o vitest e conferir o painel em 320, 414 e 1280 px.
- **Documentação:** atualizar `docs/BACKEND.md`, `AGENTS.md` e `roadmap.md`. Sem publicação automática.
