# Vários pagamentos por solicitação

## Objetivo
Permitir que Mariana registre pagamentos em fornecedores diferentes para uma mesma solicitação e que Dani veja os itens cobertos por cada pagamento, sem mudar o fluxo de compras.

## Situação conferida
- O recurso atual guarda um link e instruções na solicitação, com boletos ligados diretamente a ela.
- A tabela `solicitacao_pagamentos` ainda não existe no Supabase conectado `wrpqayrqaiekdycknhsp`.
- Na consulta atual, não há solicitações com dados de pagamento antigos nem boletos marcados como pagamento. Ainda assim, a migração contemplará esses dados e será conferida novamente ao executar.

## 1. Pagamentos e proteção no banco
- Criar `solicitacao_pagamentos`, com identificação da solicitação, onde foi comprado (obrigatório), valor opcional, link HTTP/HTTPS até **1.000 caracteres**, código até **1.000 caracteres** e observação até **300 caracteres**.
- Permitir associar um pagamento a vários itens, sem obrigar o vínculo. Garantir no banco que os itens pertencem à mesma solicitação e que nenhum item aparece em dois pagamentos.
- Vincular cada boleto a um pagamento específico, mantendo `finalidade = pagamento`, o armazenamento privado e os formatos PDF/PNG/JPG/JPEG até 50 MB.
- Cada pagamento salvo precisa de link válido, código não vazio ou boleto efetivamente enviado. Arquivo apenas selecionado não conta.
- Todos os logados leem; somente Compras/Admin gravam. Proteger também alterações diretas no banco e remoções de boletos.
- Na etapa Solicitação de pagamento, impedir remover o último pagamento ou deixar qualquer pagamento sem meio válido.
- Registrar adição, alteração e remoção no histórico, com autor, sem reproduzir links ou códigos.

## 2. Migração sem perda
- Reconsultar os dados antigos antes da execução e migrar cada solicitação que tenha link, instruções ou boletos para um pagamento novo.
- Preservar o link e todo o conteúdo de `pagamento_instrucoes` no campo de código, sem truncar ou interpretar como Pix válido. Manter os arquivos e associar seus anexos ao pagamento migrado.
- Usar o fornecedor da cotação escolhida quando disponível; sem fornecedor identificado, usar **“Não informado (migrado)”**, para posterior correção. Não inventar valores nem vínculos com itens.
- Não apagar as colunas antigas. Conferir contagens, conteúdo preservado e vínculos dos boletos antes de retirar as leituras antigas do app.
- Tornar a transferência reexecutável sem duplicar pagamentos. Se aparecer dado incompatível com os novos limites, interromper a troca para evitar perda silenciosa.

## 3. Diálogo Solicitar pagamento
- Substituir o formulário único por uma lista com **Adicionar pagamento**, edição e remoção.
- Em cada pagamento: onde foi comprado, valor, link, **Código Pix ou linha digitável**, observação, boletos e seleção dos itens cobertos.
- Mostrar quais itens já estão vinculados a outro pagamento e impedir selecioná-los novamente.
- Exigir pelo menos um pagamento válido para passar de Aprovado a Solicitação de pagamento, em todas as entradas existentes: detalhe, Kanban e Aprovações.
- Avisar sobre itens sem pagamento vinculado, mas permitir continuar.
- Salvar inclusões, alterações, remoções, vínculos e eventual passagem de etapa numa transação. Cancelar não avança o card; falhas no envio de boletos não deixam pagamentos inválidos salvos.

## 4. Fila e detalhe
- Manter uma linha por solicitação na tela Pagamentos, ordenada por **Na obra até**, com datas ausentes no final e atraso em vermelho conforme os dados atuais do painel.
- Mostrar **quantidade de pagamentos** e **soma dos valores informados**. Valores não informados não serão tratados como valores conhecidos; se nenhum tiver valor, mostrar “—”.
- Expandir a linha para mostrar onde foi comprado, itens cobertos, valor e ações **Abrir link**, **Copiar link**, **Copiar código** e **Ver boleto**, conforme os meios disponíveis.
- Reutilizar essa mesma lista no detalhe da solicitação e nos cartões de celular.
- Adicionar calendário de **Na obra até** para um dia ou intervalo, incluindo as duas datas escolhidas, com opção de limpar e estado vazio quando não houver resultados.
- Preservar larguras e alturas das linhas principais ao filtrar, com datas e valores em uma linha; a expansão abre os detalhes abaixo.

## 5. Testes e entrega
- Atualizar os testes existentes e incluir: vários pagamentos na mesma solicitação; item em dois pagamentos recusado; item de outra solicitação recusado; migração e reexecução sem perda; remoção do último pagamento recusada; ausência de meio válido; limites de 1.000/300 caracteres; permissões; histórico sem conteúdo sensível; soma de valores opcionais; filtro inclusivo por dia e intervalo.
- Executar testes de banco com reversão, sem manter dados fictícios, e testes automatizados do app.
- Conferir a fila, o diálogo, a expansão e as ações no computador e no celular. Tentar validar o fluxo completo com sessão real; informar explicitamente se o acesso necessário não estiver disponível.
- Aplicar a migração no Supabase conectado após seu ok, antes de qualquer publicação; guardar cópia em `docs/sql/` e atualizar `docs/BACKEND.md`.
- **Não publicar automaticamente.** A publicação depende de autorização separada.

## Detalhes técnicos
- Usar `solicitacao_pagamentos` como fonte de verdade; adicionar vínculo opcional de pagamento em `solicitacao_itens` e referência em `solicitacao_anexos`, com chaves que assegurem a mesma solicitação.
- Toda tabela nova terá GRANTs explícitos e RLS; validações e histórico ficam em funções/gatilhos dedicados. Escritas compostas usam RPC transacional com bloqueio da solicitação para evitar conflitos simultâneos.
- Adaptar as funções autenticadas existentes de pagamentos e manter leituras paginadas em lotes, sem cliente privilegiado para consultas comuns.
- Atualizar apenas as proteções específicas do recurso antigo que precisem passar a validar o novo modelo. Preservar **`guard_aprovacao`**, **`sync_status_compras`** e os cálculos de **`painel_solicitacoes`**.
- Estender `useRecursosBanco` para detectar o novo modelo e esconder suas telas/ações enquanto não estiver disponível. Após a migração conferida, o app deixa de ler `pagamento_link` e `pagamento_instrucoes`.
- Revisar a compatibilidade da cópia de anexos ao dividir cards para não criar boletos sem pagamento correspondente, sem mudar solicitante, status ou regras de divisão.
- Manter Supabase externo, componentes e estilos atuais; não habilitar Lovable Cloud.

## Aprovação
Neste momento, somente o plano está sendo apresentado. Código, SQL e publicação aguardam seu ok, com publicação sujeita a autorização própria.