# Pagamentos no Bwild Compras

## Objetivo
Mariana informa os dados de pagamento no sistema e Dani consulta uma fila própria, sem depender de links enviados pelo WhatsApp.

**Conferência feita:** o Supabase conectado possui as tabelas e a etapa existentes, mas ainda não possui `pagamento_link`, `pagamento_instrucoes` nem a marcação de anexos de pagamento. Nada foi alterado no banco ou no app nesta preparação.

## 1. Dados e segurança
- Acrescentar à solicitação os campos `pagamento_link` e `pagamento_instrucoes`, opcionais individualmente. Link: HTTP/HTTPS, até 1.000 caracteres, com a mesma validação do link de referência. Instruções: até 500 caracteres.
- Acrescentar uma marcação de finalidade em `solicitacao_anexos`, diferenciando boletos dos anexos comuns. Os arquivos existentes continuam como anexos comuns.
- Reutilizar o bucket privado atual e a abertura por links temporários. Aceitar boletos PDF, PNG, JPG e JPEG, mantendo o limite atual de 50 MB por arquivo.
- Todos os logados podem consultar; apenas Compras/Admin podem gravar os dados e gerenciar os anexos de pagamento. Proteger isso no banco, inclusive contra alterações diretas pela API, sem ampliar as permissões dos demais anexos.
- Manter `solicitacao_itens.link_referencia` exclusivamente como link do produto.

## 2. Pedir e editar pagamento
- Ao passar de **Aprovado → Solicitação de pagamento**, abrir o mesmo diálogo na tela da solicitação e no Kanban. Conferir também outros controles de mudança de etapa para que não contornem essa exigência.
- Mostrar fornecedor, valor e condição de pagamento da cotação escolhida, sem editá-los nesse diálogo. Se não houver cotação escolhida, indicar a ausência, sem inventar valores nem acrescentar uma exigência nova.
- Exigir pelo menos um dado válido: link, instruções não vazias ou boleto enviado e registrado. Cancelar o diálogo não muda a etapa.
- Só confirmar a passagem depois de persistir os dados necessários. Falha no envio ou no salvamento mantém a solicitação na etapa anterior e permite tentar novamente.
- Permitir a Compras/Admin editar os dados enquanto estiver em Solicitação de pagamento; nas demais etapas, manter a consulta dos dados já informados.
- Registrar no histórico quem informou ou alterou os dados, incluindo adição/remoção de boleto, sem copiar links ou instruções financeiras para o texto do histórico.
- Solicitações que já estão em Solicitação de pagamento permanecem lá, sem preenchimento retroativo obrigatório; a fila identifica as que ainda não têm dados.

## 3. Fila Pagamentos
- Criar **Pagamentos**, com atalho no menu e acesso para todos os logados, incluindo Dani, sem criar papel novo.
- Listar apenas solicitações em `solicitacao_pagamento`.
- Colunas: código, cliente/obra, título, fornecedor escolhido, valor, condição de pagamento, **Na obra até** e dias de atraso quando houver.
- Ações na própria linha: **Abrir link**, **Copiar link**, **Copiar instruções** e **Ver boleto**, disponíveis conforme os dados existentes. Havendo vários boletos, permitir escolher qual abrir.
- Ordenar por `data_necessaria` crescente, com datas ausentes no final e desempate estável. Usar os atrasos já calculados pelo banco e o destaque vermelho existente.
- Manter dimensões estáveis das linhas e colunas; datas e valores inteiros numa única linha. No celular, usar cartões com as mesmas informações e ações.
- Incluir carregamento, fila vazia, erro com nova tentativa e confirmação ao copiar. Mostrar os mesmos dados e boletos no detalhe da solicitação.

## 4. Implementação técnica
- Aplicar a migração pelo acesso conectado ao Supabase `wrpqayrqaiekdycknhsp`, somente depois da aprovação deste plano. A ferramenta registra em `supabase/migrations`; guardar também o SQL aplicado em `docs/sql/` e atualizar `docs/BACKEND.md`.
- Não criar tabelas nem habilitar Lovable Cloud. Não alterar `guard_aprovacao` ou `sync_status_compras`.
- Adicionar validações específicas no banco para limites, permissões e passagem sem dados, com gravação consistente e histórico sem duplicação. Não permitir retirar o último meio de pagamento durante a etapa, nem via edição nem via exclusão de boleto.
- Usar marcação explícita nos anexos, nunca inferir boleto pelo nome do arquivo. Preservar essa finalidade nos fluxos existentes de cópia/divisão de cards, sem transformar boletos em projetos executivos.
- Manter `painel_solicitacoes` e seus cálculos de atraso intactos: a fila reaproveita `usePainel` e complementa as informações com leituras paginadas das solicitações, cotações escolhidas e anexos, em lotes de IDs.
- Estender `useRecursosBanco` para detectar os novos campos e esconder o recurso enquanto faltar qualquer parte do esquema; falha de rede continua sendo tratada como erro, não como ausência definitiva.
- Compartilhar validação, diálogo e ações entre as telas para evitar regras diferentes. Atualizar as listas e o detalhe após salvar e preservar o padrão de atualização em tempo real.

## 5. Verificação e entrega
- Testes de link HTTP/HTTPS, protocolo inválido e limite de 1.000 caracteres; instruções de até 500 caracteres.
- Testar passagem recusada sem dados e aceita com cada alternativa válida; boleto só conta depois de enviado e registrado.
- Testar edição por Compras/Admin, recusa para solicitante, histórico e proteção contra remoção do último meio de pagamento.
- Testar ordenação concreta por Na obra até, com datas ausentes no final, e filtro exclusivo da etapa de pagamento.
- Rodar os testes relevantes e conferir a prévia sem erros. Validar em desktop e celular.
- Se houver sessão autenticada disponível, testar o fluxo completo: solicitação aprovada → informar pagamento → consultar na fila → abrir/copiar → editar → conferir histórico. Se não houver, indicar explicitamente o que não foi validado com dados reais.
- Não publicar automaticamente: concluir a implementação e a conferência da migração primeiro; a publicação fica para sua autorização.

**Aguardando seu ok para começar.**