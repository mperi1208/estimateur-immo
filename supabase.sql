-- Comptes de l'estimateur : une ligne par compte, avec ses crédits.
-- À coller une fois dans Supabase → SQL Editor → Run.

create table if not exists public.immo_profils (
  user_id uuid primary key references auth.users (id) on delete cascade,
  credits jsonb not null default '[]'::jsonb,
  maj timestamptz not null default now()
);

-- Sécurité : sans ces règles, la clé publique du site donnerait accès à toutes les lignes.
-- Avec elles, chaque compte ne peut lire, créer, modifier ou supprimer que sa propre ligne.
alter table public.immo_profils enable row level security;

create policy "immo : lecture par son titulaire" on public.immo_profils
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "immo : création par son titulaire" on public.immo_profils
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "immo : modification par son titulaire" on public.immo_profils
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "immo : suppression par son titulaire" on public.immo_profils
  for delete to authenticated using ((select auth.uid()) = user_id);
