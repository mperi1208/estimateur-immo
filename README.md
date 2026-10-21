# Estimateur m²

Estimation du prix de vente et du loyer d'un logement, partout en France (Paris et Corse recalés en priorité).

- **Prix** : ventes réelles DVF autour de l'adresse (API Cerema), actualisées dans le temps, puis ajustées selon les caractéristiques du bien (DPE, étage, extérieur, état…), avec des coefficients sourcés.
- **Loyer** : carte officielle des loyers par commune (ANIL), recalée sur les annonces récentes à Paris (Hestia) et en Corse (SeLoger), plus le rendement brut.
- **Cash-flow** (onglet de la même page) : simulation de crédit (différé, frais de notaire inclus ou non, taux du marché + surprime SCI), charges et fiscalité (nom propre, SCI à l'IR, SCI à l'IS), et comparaison de crédits en cours avec les taux actuels.
- **Projet travaux** : budget de rénovation (dont énergie), valeur et loyer après travaux, puis simulation travaux + location ou travaux + revente (portage, frais, impôt sur la plus-value, marge nette).

Tout tourne dans le navigateur : ouvrir `app/index.html`, ou la version en ligne.
