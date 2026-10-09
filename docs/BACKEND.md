# Bwild Compras — Backend (Supabase)

Projeto Supabase: `wrpqayrqaiekdycknhsp` (https://wrpqayrqaiekdycknhsp.supabase.co). O app do Lovable usa este Supabase externo (não usa Lovable Cloud).

## Estrutura

| Objeto | Função |
|---|---|
| `solicitacoes` | Pedido de compra da obra (código SC-XXXX, status automático) |
| `solicitacao_itens` | Itens do pedido (categoria, especificação, link, origem manual/projeto_executivo) |
| `solicitacao_anexos` + bucket `projetos-executivos` | Projeto executivo e demais anexos (privado, 50 MB) |
| `compras` | Compras registradas por Compras (fornecedor, valor, previsão, local, recebimento) |
| `solicitacao_eventos` | Linha do tempo (criação, status, compra, entrega, comentários) |
| `extracoes_projeto` | Log de cada leitura automática do projeto executivo (modelo, tokens, resultado) |
| `painel_solicitacoes` (view) | Painel consolidado visível a todos os usuários |
| `user_roles` | Papéis: solicitante, compras, admin |

Regras automáticas (triggers): primeira compra → `comprada`; entrega parcial → `entregue_parcial`; todas entregues → `entregue`.

## Edge Function `extrair-projeto-executivo`

- O navegador extrai o texto do PDF por folha (pdf.js) e envia `{ nome_arquivo, paginas: [{ numero, texto }] }`.
- A função limpa cotas e carimbo, remove CPF, chama a OpenAI com saída estruturada (JSON Schema) e devolve `obra`, `itens`, `nao_comprar` e `avisos` para a tela de validação.
- Segredos necessários (Supabase → Edge Functions → Secrets): `OPENAI_API_KEY` (obrigatório), `EXTRACAO_MODEL` (opcional, padrão `gpt-4.1`).
- Deploy: `supabase functions deploy extrair-projeto-executivo --project-ref wrpqayrqaiekdycknhsp`

### Regras de negócio da leitura

O objetivo é a **lista do que precisa ser comprado**; detalhes técnicos são consultados no próprio projeto.

- **Descrição curta** por item (nome reconhecível, marca/modelo quando houver); especificação no máximo uma linha; referência só "Folha NN".
- **Marcenaria = 1 item** `Marcenaria`, 1 `vb`, sem lista de móveis (código: `consolidarMarcenaria`).
- **Kits:** peças que fazem parte de um kit listado não viram itens separados (código: `removerPecasDeKit`).
- **Fornecimento/Cortesia Bwild = a Bwild compra:** sempre na lista de compra (código: `recuperarFornecimentoBwild`).
- **"Não comprar":** lista curta de apoio, sem repetições (código: `revisarNaoComprar`). Até 5 avisos.

## Testes de API

Coleção Postman **Bwild Compras — API** + ambiente **Bwild Compras — Produção** (workspace "Pedro Alves's Workspace"): login, extração, criar solicitação/itens, assumir, registrar compra, confirmar recebimento, painel e histórico.

## Migrações

Em `supabase/migrations/`, na ordem aplicada no projeto.

O front verifica se o banco já tem `prazo_compra`, o status `cronograma_confirmado` e a tabela `cotacao_anexos` (`src/hooks/useRecursos.ts`) e esconde o que ainda não existe, em vez de dar erro ao salvar. Ao criar um recurso novo no banco, rode o script **antes** de publicar a tela que o usa.

## Clientes/obras, cotações e aprovação

- `clientes_obras`: cadastro unificado (cliente + empreendimento/unidade/endereço/contato). Todos os logados leem; compras/admin gravam.
- `cotacoes`: propostas por solicitação (fornecedor, valor, prazo em dias, pagamento, validade, comentário, `escolhida`). Só uma escolhida por solicitação (índice único). Escolher um fornecedor registra no histórico.
- `cotacao_anexos`: PDF/imagem de cada cotação (bucket `projetos-executivos`, caminho `{solicitacao_id}/cotacoes/{cotacao_id}/...`). Todos os logados leem; compras/admin gravam e excluem.
- `solicitacoes.prazo_compra`: prazo para efetivar a compra (obrigatório na Nova solicitação, junto com `data_necessaria`).
- Fluxo de status: Nova > **Cronograma confirmado** (`cronograma_confirmado`, exige `data_necessaria`) > Em cotação > **Aprovação** (`aguardando_aprovacao`) > **Aprovado** (`aprovada`) > Comprada > Entregue.
  - Só admin aprova ou tira da etapa Aprovação (trigger `guard_aprovacao`).
  - Compra só pode ser registrada depois de Aprovado.
  - Se todas as compras forem excluídas, a solicitação volta para Aprovado.

## Atraso automático (migração 20261009120000_atraso_automatico)

Calculado a cada consulta, no fuso de São Paulo (`public.hoje_sp()`); não depende de rotina agendada.

| Tipo | Regra | Campo em `painel_solicitacoes` |
|---|---|---|
| Compra | `prazo_compra` vencido e status entre Nova e Aprovada | `dias_atraso_compra` |
| Entrega | compra registrada, sem `data_entrega_real` e `previsao_entrega` vencida | `dias_atraso_entrega` |
| Chegada | `data_necessaria` vencida e item ainda não entregue | `dias_atraso_chegada` |

- `dias_atraso` = maior dos três; `tipo_atraso` = qual deles manda (`compra`, `entrega`, `chegada`).
- `atrasada` = `dias_atraso > 0` (antes considerava só a data necessária).
- `situacao_prazo`: `atrasada`, `vence_hoje`, `vence_em_breve` (1 a 3 dias), `no_prazo`, `sem_prazo`, `concluida`; `vence_em_dias` = dias até o prazo aberto mais próximo.
- Por compra: `GET /rest/v1/compras?select=*,dias_atraso_entrega` (função `dias_atraso_entrega(compras)`; entregue com atraso = entrega real − previsão).
