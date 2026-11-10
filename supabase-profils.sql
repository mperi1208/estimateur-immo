-- Profils d'un même compte (comme Netflix) : le titulaire garde sa ligne dans immo_profils,
-- chaque autre profil (famille) a la sienne ici. Les biens et projets sont à toute la famille : ils sont tous dans la
-- ligne du titulaire (immo_profils.credits), chacun avec son auteur ; la colonne credits d'ici ne sert plus.
-- À coller une fois dans Supabase → SQL Editor → Run, après supabase.sql.
alter table public.immo_profils add column if not exists nom text;
create table if not exists public.immo_membres (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9]{4,24}$'),
  nom text not null check (length(nom) between 1 and 40),
  couleur text,
  credits jsonb,
  cree timestamptz not null default now(),
  maj timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.immo_membres enable row level security;
create policy "membres : lecture par son titulaire" on public.immo_membres
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "membres : création par son titulaire" on public.immo_membres
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "membres : modification par son titulaire" on public.immo_membres
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "membres : suppression par son titulaire" on public.immo_membres
  for delete to authenticated using ((select auth.uid()) = user_id);
