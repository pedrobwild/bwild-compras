# Obra Connect

Crie o app "Bwild Compras" — sistema interno de solicitação e acompanhamento de compras de obras de reforma. Interface em português do Brasil, simples, limpa e responsiva (equipe usa muito no celular, na obra). React + TypeScript + Tailwind + shadcn/ui.

IMPORTANTE — BACKEND: NÃO habilite o Lovable Cloud e NÃO crie tabelas novas. O banco já está pronto em um Supabase externo. Crie o cliente em src/integrations/supabase/client.ts com @supabase/supabase-js usando:
- SUPABASE_URL = https://wrpqayrqaiekdycknhsp.supabase.co
- SUPABASE_PUBLISHABLE_KEY = sb_publishable_6G5ofSFjjQ31J0KsOv9RJg_qegO2L5D
(persistSession true, autoRefreshToken true)

ESQUEMA EXISTENTE (schema public — use exatamente estes nomes):
- profiles (id uuid = auth.users.id, nome, email, created_at)
- user_roles (user_id, role: 'solicitante' | 'compras' | 'admin')
- solicitacoes (id, numero, codigo texto tipo "SC-0001" gerado pelo banco — não enviar, cliente*, empreendimento, unidade, endereco_obra, titulo*, descricao, prioridade: 'baixa'|'normal'|'urgente', data_necessaria date, status: 'nova'|'em_cotacao'|'comprada'|'entregue_parcial'|'entregue'|'cancelada', solicitante_id (default auth.uid()), responsavel_compras_id, motivo_cancelamento, created_at, updated_at)
- solicitacao_itens (id, solicitacao_id, descricao*, quantidade numeric, unidade text default 'un', ambiente, referencia_projeto (ex.: "Folha 09 – Marcenaria cozinha"), observacao)
- solicitacao_anexos (id, solicitacao_id, nome_arquivo, storage_path, tamanho_bytes, tipo_mime, enviado_por default auth.uid(), created_at)
- compras (id, solicitacao_id, fornecedor*, fornecedor_contato, descricao_itens, valor_total numeric*, forma_pagamento, numero_pedido, data_compra date default hoje, previsao_entrega date, local_entrega text default 'Obra', endereco_entrega, data_entrega_real date, recebido_por, observacao, registrado_por default auth.uid())
- solicitacao_eventos (id, solicitacao_id, tipo: 'criada'|'status'|'compra'|'entrega'|'comentario', descricao, usuario_id, created_at) — linha do tempo; o banco grava automaticamente criação, mudança de status, compra e entrega. O app só insere tipo 'comentario' (com usuario_id = id do usuário logado).
- VIEW painel_solicitacoes (id, codigo, numero, cliente, empreendimento, unidade, titulo, prioridade, data_necessaria, status, created_at, updated_at, solicitante_id, solicitante_nome, responsavel_compras_id, responsavel_nome, qtd_itens, qtd_anexos, custo_total, fornecedores, proxima_entrega, locais_entrega, atrasada boolean) — use para listagens.
- Storage bucket privado "projetos-executivos" (até 50 MB). Caminho do arquivo: `{solicitacao_id}/{timestamp}-{nome_sanitizado}`. Para abrir/baixar use createSignedUrl (1 hora).
- Funções RPC disponíveis: is_compras(_user_id uuid) → boolean; has_role(_user_id, _role) → boolean.

REGRAS AUTOMÁTICAS DO BANCO (não replicar no front): ao registrar a primeira compra o status vira "comprada"; ao marcar data_entrega_real em parte das compras vira "entregue_parcial"; em todas, "entregue". Toda pessoa que se cadastra vira "solicitante"; só compras/admin registram compras e mudam status. O RLS já garante isso.

AUTENTICAÇÃO
- Tela de login/cadastro com e-mail e senha (campo "Nome" no cadastro, enviado em options.data.nome). Recuperação de senha.
- Rotas protegidas: sem sessão → /login.
- Após login, carregar papéis do usuário em user_roles e expor um hook useRole() com isCompras (compras ou admin) e isAdmin.

TELAS
1. /painel — "Painel de compras" (tela inicial, visível para TODOS os usuários logados)
   - Cards de resumo no topo: Novas, Em cotação, Compradas (aguardando entrega), Entregues no mês, Atrasadas, Custo total do mês (R$).
   - Tabela/lista de painel_solicitacoes: Código, Cliente / Empreendimento-Unidade, Título, Prioridade (badge; urgente em vermelho), Necessário até, Status (badge colorido), Fornecedor(es), Custo (R$), Previsão de entrega, Local de entrega. Linha com destaque vermelho quando atrasada = true.
   - Filtros: busca texto (código, cliente, título, fornecedor), status (multi), prioridade, cliente/obra, "somente minhas". Ordenar por mais recentes; urgentes e atrasadas primeiro.
   - No celular, virar cards empilhados.
   - Atualização em tempo real (Supabase Realtime nas tabelas solicitacoes e compras → recarregar a lista).
   - Botão principal "Nova solicitação".

2. /solicitacoes/nova — Formulário de requisição (qualquer usuário)
   - Seção "Obra": Cliente*, Empreendimento, Unidade, Endereço da obra. Autocomplete com clientes/empreendimentos já usados em solicitacoes.
   - Seção "Pedido": Título*, Descrição, Prioridade (padrão normal), Data necessária na obra.
   - Seção "Itens": lista dinâmica (adicionar/remover linhas) com Descrição*, Qtd, Unidade (un, m², m, m³, kg, cx, pç, rolo, galão, saco, jogo), Ambiente (Cozinha, Banho, Dormitório/Estar, Terraço, Área de serviço, Geral), Referência no projeto (folha), Observação. Pelo menos 1 item.
   - Seção "Projeto executivo": upload com arrastar-e-soltar, vários arquivos (PDF, DWG, JPG, PNG, XLSX), barra de progresso, mostrar nome e tamanho. Recomendar anexar o projeto executivo do cliente.
   - Ao salvar: insert em solicitacoes (retornar id e codigo) → insert dos itens → upload dos arquivos no bucket e insert em solicitacao_anexos → toast "Solicitação SC-XXXX enviada para Compras" → redirecionar para o detalhe.

3. /solicitacoes/:id — Detalhe (todos veem)
   - Cabeçalho: código, título, badge de status, prioridade, cliente/empreendimento/unidade, solicitante, data necessária, responsável de compras.
   - Barra de progresso do status: Nova → Em cotação → Comprada → Entregue.
   - Abas ou seções: Itens (tabela), Anexos (lista com botão Abrir/Baixar via signed URL; permitir anexar mais), Compras registradas (cards com fornecedor, valor R$, nº pedido/NF, data da compra, previsão de entrega, local e endereço de entrega, entregue em/recebido por), Linha do tempo (solicitacao_eventos em ordem cronológica com nome do usuário via profiles + caixa "Adicionar comentário").
   - Totais: custo total das compras.
   - Se o usuário é o solicitante e status = 'nova': pode editar itens e cancelar.

4. Ações exclusivas de Compras (mostrar só se isCompras) no detalhe:
   - "Assumir demanda" → update responsavel_compras_id = usuário atual e status = 'em_cotacao'.
   - "Registrar compra" → modal com: Fornecedor*, Contato do fornecedor, Itens comprados (texto), Valor total R$* (máscara BRL), Forma de pagamento (Pix, Boleto, Cartão, Transferência, Faturado), Nº do pedido / NF, Data da compra* (padrão hoje), Previsão de entrega, Local de entrega (Obra | Depósito Bwild | Retirada no fornecedor | Outro), Endereço de entrega (pré-preencher com endereco_obra quando local = Obra), Observação. Uma solicitação pode ter várias compras (fornecedores diferentes).
   - Em cada compra: "Editar" e "Confirmar recebimento" (modal: data de entrega real, recebido por).
   - "Alterar status" manual (select) e "Cancelar solicitação" (exige motivo → motivo_cancelamento).

5. /compras — "Fila de Compras" (menu visível só para isCompras)
   - Kanban por status: Nova | Em cotação | Comprada | Entregue parcial | Entregue (últimos 30 dias). Cards com código, cliente, título, prioridade, data necessária, dias em aberto. Clique abre o detalhe.
   - Destaque para "Sem responsável" e "Atrasadas".

6. /admin/usuarios (só isAdmin): lista de profiles com papéis; permitir adicionar/remover papel 'compras' e 'admin' (insert/delete em user_roles).

LAYOUT E ESTILO
- Barra lateral (desktop) / barra inferior (mobile): Painel, Nova solicitação, Fila de Compras (compras), Usuários (admin), Sair. Mostrar nome e papel do usuário.
- Identidade Bwild: fundo claro neutro, texto grafite (#2B2B2B), cor de destaque grafite escuro com detalhes em verde-oliva suave; tipografia Inter; cantos arredondados médios; sem gradientes chamativos.
- Cores de status: Nova = azul; Em cotação = âmbar; Comprada = roxo; Entregue parcial = ciano; Entregue = verde; Cancelada = cinza. Urgente = vermelho.
- Datas no formato dd/MM/yyyy (date-fns, locale ptBR) e valores em R$ (Intl.NumberFormat pt-BR, BRL).
- Estados de carregamento (skeleton), vazio ("Nenhuma solicitação ainda — crie a primeira") e erro com mensagens claras em português.
- Validação de formulários com react-hook-form + zod.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bwild-compras.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3c74f60c-dec8-4f78-8bb2-15fc8baae0c5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
