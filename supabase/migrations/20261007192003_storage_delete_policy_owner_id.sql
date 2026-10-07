drop policy if exists "dono ou compras apaga projeto" on storage.objects;
create policy "dono ou compras apaga projeto" on storage.objects for delete to authenticated
  using (bucket_id = 'projetos-executivos' and (owner_id = (auth.uid())::text or public.is_compras(auth.uid())));
