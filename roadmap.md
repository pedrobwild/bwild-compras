# Acesso ao Bwild Compras
- [x] Remover cadastro público e validar os dois domínios no Novo usuário; 89 testes passaram, incluindo login existente e recuperação.
- [x] Preparar a migração de restrição de novos cadastros em docs/sql, sem alterar usuários existentes, tabelas ou RLS; gatilho testado em PostgreSQL isolado, incluindo reexecução e preservação do gatilho de perfis.
- [ ] Consultar contagens de usuários e aplicar a migração: bloqueado pela ausência de acesso ao banco externo; a plataforma também impede gravar diretamente em supabase/migrations sem conexão.
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