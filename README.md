# Estimateur m²

Estimation du prix de vente et du loyer d'un logement, partout en France (Paris et Corse recalés en priorité). Trois onglets dans la même page :

- **Estimer** : adresse, type et surface suffisent pour obtenir le prix, le loyer et le rendement. Les ventes réelles DVF autour de l'adresse (API Cerema) sont actualisées dans le temps, puis ajustées selon les caractéristiques du bien, à régler avant l'estimation dans « Détails du bien » (état, DPE, étage, extérieur…), avec des coefficients sourcés. Le loyer vient de la carte officielle des loyers par commune (ANIL), recalée sur les annonces récentes à Paris (Hestia) et en Corse (SeLoger), en vide ou en meublé. La question « Travaux prévus ? » donne le budget de rénovation (dont énergie) et la valeur et le loyer après travaux.
- **Financer** : l'essentiel d'abord (prix, apport, durée, nom propre ou SCI, loyer), puis deux scénarios, « Garder et louer » ou « Revendre ». Les sections Travaux, Impôts et Évolutions ne sont comptées que si elles sont ouvertes. Les réglages détaillés (taux du marché + surprime SCI, assurance, différé, frais, charges) ont des valeurs par défaut réalistes.
- **Mes investissements** : tous les biens en liste (type, valeur, restant dû, cash-flow, rendement) ; chaque fiche regroupe le bien, l'achat, les crédits (restant dû mis à jour chaque mois, renégociation aux taux actuels), la location, les charges, la rentabilité avant impôts, les plans et documents, et des notes.
- **Compte** (en haut à droite) : invité par défaut, les biens et fichiers restent sur l'appareil. Avec un compte (e-mail + mot de passe), ils sont enregistrés en ligne et se retrouvent sur tous les appareils.

Tout tourne dans le navigateur : ouvrir `app/index.html`, ou la version en ligne.

## Comptes

Les comptes passent par [Supabase](https://supabase.com), dans le même projet que [pari-ldc](https://github.com/mperi1208/pari-ldc) : un compte du pari sert aussi ici. L'adresse du projet et sa clé publique sont dans `const SUPABASE` (`app/index.html`) ; cette clé est faite pour être publique, ce sont les règles de la base qui protègent les données.

Mise en place, une fois, dans le projet Supabase :

1. **SQL Editor** : lancer [`supabase.sql`](supabase.sql) (table `immo_profils`, chaque compte limité à sa propre ligne).
2. **SQL Editor** : lancer [`supabase-partage-pari-ldc.sql`](supabase-partage-pari-ldc.sql), pour que les comptes créés depuis l'estimateur ne deviennent pas joueurs du pari.
3. **Authentication → URL Configuration → Redirect URLs** : ajouter `https://mperi1208.github.io/estimateur-immo/**` (liens de confirmation et de mot de passe oublié).
4. **SQL Editor** : lancer [`supabase-docs.sql`](supabase-docs.sql) (stockage privé `immo-docs` pour les plans et documents, chaque compte limité à son dossier).
