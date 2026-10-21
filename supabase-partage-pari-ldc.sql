-- Seulement si l'estimateur partage le projet Supabase de pari-ldc.
-- pari-ldc crée une fiche joueur à chaque nouveau compte (déclencheur on_auth_user_created).
-- Les comptes créés depuis l'estimateur portent app = 'estimateur-immo' : ils ne deviennent pas joueurs.
-- Reprend la fonction de pari-ldc (supabase/01b_corrections.sql, section 7) avec ce seul test en plus :
-- vérifier qu'elle n'a pas été modifiée depuis avant de lancer ce script.

create or replace function public.creer_fiche_joueur() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if coalesce(new.raw_user_meta_data->>'app', '') = 'estimateur-immo' then
        return new;   -- compte de l'estimateur immo : pas de fiche joueur
    end if;
    insert into public.joueurs (user_id, pseudo)
    values (new.id, coalesce(new.raw_user_meta_data->>'pseudo', split_part(new.email, '@', 1)))
    on conflict (user_id) do nothing;
    return new;
end;
$$;
