<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Bwild Compras — regras técnicas

- Backend é um Supabase externo já pronto; cliente em `src/integrations/supabase/client.ts`. Não habilitar Lovable Cloud nem criar tabelas — o esquema e o RLS vivem fora deste projeto.
- `src/integrations/supabase/client.ts` is platform-generated: public Supabase constants, the bucket name and the untyped `supabaseLivre` client (for runtime-detected optional columns/functions) live in `src/lib/supabase-config.ts`, so reconnecting the backend never breaks imports.
- Rotas logadas ficam em `src/routes/_authenticated/` (ssr: false), porque a sessão fica no localStorage.
- Status, compras e eventos automáticos são calculados por triggers do banco — o front nunca os replica.
- Listagens leem a view `painel_solicitacoes` via `usePainel` (paginado + Realtime).
- Buyer assignment uses the existing user_roles and profiles tables and updates only responsavel_compras_id; database RLS remains authoritative and assigning a buyer must not move the card.
- Title editing uses TituloSolicitacao and writes only solicitacoes.titulo so renaming never changes status, deadlines, or ownership.
- Kanban card presentation uses browser-safe helpers in src/lib/kanban-card.ts; delivery forecasts reuse existing panel and purchase reads without changing database delay rules.
- The worksite item checklist reads existing request items in paginated ID chunks and derives purchased indicators from the parent request status; it never writes purchase status or adds independent item completion state.
- Post-creation item link editing updates only solicitacao_itens.link_referencia, scoped by item and request IDs; keep it separate from full item editing so buyers can add links without changing quantities, ownership, or status.
- Request and checklist ordering share the browser-safe ordenarRegistros helper and OrdenacaoSelect; date ordering uses creation, required-by, or delivery forecast fields, keeps missing dates last, and overrides urgency only in presentation.
- Data tables and history rows opt into data-table, data-list-row, and data-list-header styles; desktop request sheets use fixed colgroups and spreadsheet styles to keep geometry stable under filtering, while smaller screens retain stacked views.
- Purchase queue date filters use the browser-safe noPeriodo helper with inclusive local calendar days; creation filtering reads created_at and never changes request records.
- Admin signup validation and error mapping share the browser-safe cadastro module; database enforcement belongs in an auth.users BEFORE INSERT trigger, preserving existing users and the profile-creation trigger.
- Payment fields and explicitly marked attachments are protected by dedicated database triggers and the transactional salvar_pagamento RPC; shared payment dialogs/actions keep every status-entry surface consistent without modifying existing approval or delay triggers.
- Payment server functions use requireSupabaseAuth and the client bearer middleware in src/start.ts; related reads are paginated in bounded ID batches so RLS remains authoritative and no service-role client is needed.
