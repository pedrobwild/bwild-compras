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
- Rotas logadas ficam em `src/routes/_authenticated/` (ssr: false), porque a sessão fica no localStorage.
- Status, compras e eventos automáticos são calculados por triggers do banco — o front nunca os replica.
- Listagens leem a view `painel_solicitacoes` via `usePainel` (paginado + Realtime).
