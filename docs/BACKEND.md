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

## Testes de API

Coleção Postman **Bwild Compras — API** + ambiente **Bwild Compras — Produção** (workspace "Pedro Alves's Workspace"): login, extração, criar solicitação/itens, assumir, registrar compra, confirmar recebimento, painel e histórico.

## Migrações

Em `supabase/migrations/`, na ordem aplicada no projeto.
