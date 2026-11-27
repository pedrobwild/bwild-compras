# Bwild Compras — Backend (Supabase)

Projeto Supabase: `wrpqayrqaiekdycknhsp` (https://wrpqayrqaiekdycknhsp.supabase.co). O app do Lovable usa este Supabase externo (não usa Lovable Cloud).

## Acesso

- Sem cadastro público na tela de login; usuários são criados pelo admin em **Usuários → Novo usuário**.
- Novos cadastros aceitam somente e-mails `@bwild.com.br` ou `@bewild.com.br`, sem distinguir maiúsculas de minúsculas.
- Todo usuário novo entra como solicitante. Usuários existentes permanecem inalterados, inclusive os de outros domínios.
- A proteção no banco depende do gatilho `enforce_signup_domain`, antes de inserir em `auth.users`; `handle_new_user` e `on_auth_user_created` permanecem intactos.
- Aplicado no banco `wrpqayrqaiekdycknhsp` em 24/11/2026, pelo chat do Lovable após a conexão do Supabase ao projeto. Gatilho `enforce_signup_domain` confirmado em `auth.users`. O SQL de referência fica em `docs/sql/20261124154349_cadastro_so_dominio_bwild.sql`.

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

## Etapa "Solicitação de pagamento" (migrações 20261011085900 e 20261011090000)

- Novo valor `solicitacao_pagamento` no enum `status_solicitacao`, entre `aprovada` e `comprada`.
- `label_status`: "Solicitação de pagamento"; `comprada` passa a aparecer como "Comprado" no histórico.
- `guard_aprovacao`: voltar de Solicitação de pagamento para Aprovado não conta como nova aprovação.
- `painel_solicitacoes`: Solicitação de pagamento conta como "antes da compra" no atraso de compra.
- Registrar uma compra nessa etapa leva a solicitação para Comprado (regra de `sync_status_compras`, sem mudança).

## Dados e fila de pagamentos (27/11/2026)

### Atualização: vários pagamentos por solicitação

- Aplicada pelo chat em 27/11/2026 no Supabase externo `wrpqayrqaiekdycknhsp`, sem publicação do app. SQL completo em `docs/sql/20261127_pagamentos_multiplos.sql` e migrações registradas em `supabase/migrations/`.
- Fonte de verdade: `solicitacao_pagamentos`, com `onde_comprado` obrigatório (até 200 caracteres), valor opcional não negativo, link HTTP/HTTPS até 1.000 caracteres, código até 1.000 e observação até 300. O app não lê mais as colunas antigas para pagamentos.
- `solicitacao_itens.pagamento_id` permite vincular cada item a um único pagamento; a chave composta impede vincular item de outra solicitação. `solicitacao_anexos.pagamento_id` identifica o pagamento de cada boleto e mantém `finalidade = pagamento`.
- Todos os logados consultam; Compras/Admin gerenciam em Aprovado ou Solicitação de pagamento. A função `salvar_pagamentos` salva pagamentos, vínculos, boletos e passagem numa transação, conferindo a versão da solicitação para recusar sobrescrita concorrente. Cada pagamento precisa de link, código ou boleto existente; não se pode retirar o último pagamento durante a etapa.
- A transferência preserva conteúdo e referências antigas, sem atribuir valores ou itens. Usa o fornecedor escolhido, ou “Não informado (migrado)”. A conferência antes/depois encontrou zero solicitações com dados antigos e zero boletos de pagamento. Colunas antigas não foram apagadas.
- O diálogo permite adicionar, editar e remover pagamentos e avisa sem bloquear quando há itens sem vínculo. Histórico registra autor e inclusão/alteração/remoção sem reproduzir link ou código.
- A fila mantém uma linha por solicitação, com quantidade e soma dos valores informados; sem valor informado mostra “—”. Os pagamentos são expansíveis e a mesma lista aparece no detalhe. Calendário Na obra até inclui os dias inicial e final; ausência de data fica no final sem filtro.
- `useRecursosBanco` detecta a tabela e os dois vínculos novos, escondendo o recurso enquanto faltarem. Boletos ficam no card original durante divisão; anexos gerais continuam sendo copiados.
- Testes transacionais de pagamentos, boletos e migração passaram com reversão de todas as alterações: `testes_pagamentos.sql`, `testes_boletos_pagamento.sql`, `testes_migracao_pagamentos.sql`. Interface conferida com dados simulados em 320, 414, 1280 e 1536 px: calendário, expansão, dois pagamentos, bloqueio de item já vinculado, cópia e abertura de boleto; sem transbordamento. A sessão real não pôde ser emitida pelo Supabase externo; validação autenticada integral permanece pendente.

### Modelo anterior (mantido apenas como registro histórico)

- Migrações aplicadas pelo chat no Supabase conectado `wrpqayrqaiekdycknhsp`; cópia do SQL em `docs/sql/20261127_pagamentos.sql`.
- `solicitacoes.pagamento_link`: HTTP/HTTPS, até 1.000 caracteres. `pagamento_instrucoes`: até 500 caracteres. Não substituem o link de produto do item.
- `solicitacao_anexos.finalidade`: `geral` para anexos existentes ou `pagamento` para boletos. Mesmo bucket privado, PDF/PNG/JPG/JPEG até 50 MB. O arquivo deve existir no armazenamento antes de registrar o boleto.
- Ao passar de Aprovado para Solicitação de pagamento, o diálogo exige link, instruções ou boleto enviado. Cancelar não muda a etapa. A cotação escolhida aparece apenas para conferência.
- Compras/Admin informa os dados ao solicitar pagamento e pode editá-los durante essa etapa; todos os logados consultam na solicitação e em **Pagamentos** (`/pagamentos`). Solicitações antigas sem dados não são alteradas retroativamente.
- A função `salvar_pagamento` grava os campos, a passagem e as remoções de metadados numa transação, com RLS. Gatilhos específicos validam permissões, limites e impedem retirar o último meio de pagamento. Adições de boletos ocorrem após upload; falhas não avançam a etapa.
- Histórico automático registra autor e alteração, sem reproduzir links, chaves ou instruções no texto. Funções de gatilho não são executáveis diretamente pelos papéis público ou autenticado.
- Boletos referenciados não podem ser apagados diretamente do armazenamento. Remover o boleto pela edição elimina a referência, sem apagar arquivos que possam ser compartilhados por cards divididos.
- Fila ordenada por `data_necessaria`, sem data no final. Atrasos continuam vindo da view existente: `guard_aprovacao`, `sync_status_compras` e `painel_solicitacoes` não foram alterados.
- `useRecursosBanco` esconde o recurso quando faltam os campos. Leitura complementar paginada; ações de abrir/copiar disponíveis na fila e no detalhe.
- Testes transacionais de banco em `docs/sql/testes_pagamentos.sql`, sem dados persistidos; testes de validação e diálogo junto aos arquivos do recurso.

## Prazo do fornecedor e valores previstos (27/11/2026)

Script: `docs/sql/20261127_prazo_fornecedor_previstos.sql` (aplicado no Supabase conectado). Teste revertido: `docs/sql/testes_prazo_previstos.sql`.

- `solicitacoes` ganhou `prazo_fornecedor_dias` (0–365), `fornecedor_previsto`, `valor_estimado` e `local_entrega_previsto`, validados pelo gatilho `solicitacoes_calcular_prazo`.
- O mesmo gatilho calcula `prazo_compra = data_necessaria − prazo_fornecedor_dias` (dias corridos) sempre que uma das duas muda. Sem prazo do fornecedor, o `prazo_compra` existente é mantido. As regras de atraso continuam lendo `prazo_compra`.
- Solicitações antigas com as duas datas receberam o prazo do fornecedor pela diferença entre elas (187 linhas), sem mudar `prazo_compra` nem `updated_at`.
- `painel_solicitacoes` manteve todas as colunas e acrescentou `fornecedor_exibicao`, `valor_exibicao`, `local_exibicao` e `previsao_exibicao`, cada um com a coluna `*_origem` (`compra`, `cotacao` ou `solicitacao`). A ordem é: compra registrada, cotação escolhida, dados da solicitação. A previsão usa a compra (inclusive já entregue) e, sem ela, a data na obra. Também traz `qtd_compras`, `data_compra_min` e `cotacao_prazo_dias`.
- `guard_aprovacao`, `sync_status_compras` e RLS não foram alterados.
- O bloco "Gasto por semana" do painel é calculado na tela a partir da view e das compras desde a segunda-feira atual (semanas de segunda a domingo, fuso de São Paulo).
