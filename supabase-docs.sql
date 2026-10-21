-- Plans, photos et documents de « Mes investissements ».
-- À coller une fois dans Supabase → SQL Editor → Run.
-- Stockage privé : chaque fichier est rangé dans un dossier au nom du compte (<id du compte>/<bien>/<fichier>),
-- et chaque compte ne peut lire, ajouter ou supprimer que les fichiers de son propre dossier.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('immo-docs', 'immo-docs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

create policy "immo-docs : lecture par son titulaire" on storage.objects
  for select to authenticated
  using (bucket_id = 'immo-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "immo-docs : ajout par son titulaire" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'immo-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "immo-docs : suppression par son titulaire" on storage.objects
  for delete to authenticated
  using (bucket_id = 'immo-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
