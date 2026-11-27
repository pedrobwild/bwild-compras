# Vários pagamentos por solicitação
- [x] Plano aprovado; estrutura aplicada no Supabase conectado, sem dados antigos para transferir e com colunas antigas preservadas.
- [x] Diálogo com vários pagamentos, fila expansível, detalhe e filtro Na obra até; 126 testes automáticos e testes de banco revertidos passaram.
- [x] Conferência visual com dados simulados em 320, 414, 1280 e 1536 px, sem transbordamento.
- [ ] Validar o fluxo com sessão real: o Supabase externo não permite emitir sessão de teste por aqui.
- [ ] Publicar: aguardando autorização.

# Pagamentos
- [x] Implementar dados de pagamento, diálogo compartilhado, fila Pagamentos, migração aplicada, documentação e testes; 116 testes automáticos passaram e testes transacionais de banco não deixaram alterações.
- [x] Conferir fila e diálogo com dados simulados em 320, 414, 1280 e 1536 px, copiar link, abrir boleto e bloquear passagem vazia, sem transbordamento.
- [ ] Validar solicitação aprovada → pagamento → fila → edição → histórico com sessão real: o Supabase externo não permite emitir sessão de teste por aqui.
- [ ] Publicar: aguardando autorização; não publicar automaticamente.

# Acesso ao Bwild Compras
- [x] Remover cadastro público e validar os dois domínios no Novo usuário; 89 testes passaram, incluindo login existente e recuperação.
- [x] Preparar a migração de restrição de novos cadastros em docs/sql, sem alterar usuários existentes, tabelas ou RLS; gatilho testado em PostgreSQL isolado, incluindo reexecução e preservação do gatilho de perfis.
- [x] Consultar contagens de usuários e aplicar a migração: concluído em 24/11/2026 após conectar o Supabase; 12 usuários e nenhum fora dos domínios permitidos, conforme docs/BACKEND.md e conferência registrada na conversa.
- [x] Documentar a regra e conferir login e recuperação de senha em 320, 414 e 1280 px; sem erros ou transbordamento. Tela Admin testada com banco simulado, sem criar usuários reais.

# Ordenação de compras
- [x] Acrescentar filtro por período de criação na Fila de Compras, combinado com cliente, compra e entrega, com limpeza conjunta.
- [x] Estabilizar linhas e colunas ao filtrar: conferência com registros simulados manteve altura de 72px e larguras constantes; 29 testes passaram.
- [x] Padronizar espaçamento, alinhamento e cabeçalhos das linhas nas tabelas e históricos, preservando os formatos móveis.
- [x] Conferir estilos com dados simulados em 320, 414 e 1280 px, sem transbordamento; 30 testes passaram.
- [x] Acrescentar necessário até e previsão, em ambas as direções, nas seleções de ordenação; 29 testes passaram.
- [x] Adicionar seleção por data da solicitação e nome no Painel, Fila e checklist.
- [x] Testar ordenação: 26 testes passaram; prévia sem erros de compilação.
- [ ] Conferir com dados reais: bloqueado pela ausência de sessão no serviço externo; /compras redireciona para /login.