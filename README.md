# Estimateur m²

Estimation du prix de vente et du loyer d'un logement, partout en France (Paris et Corse recalés en priorité).

- **Prix** : ventes réelles DVF autour de l'adresse (API Cerema), actualisées dans le temps, puis ajustées selon les caractéristiques du bien (DPE, étage, extérieur, état…), avec des coefficients sourcés.
- **Loyer** : carte officielle des loyers par commune (ANIL), recalée sur les annonces récentes à Paris (Hestia) et en Corse (SeLoger), plus le rendement brut.

Tout tourne dans le navigateur : ouvrir `app/index.html`, ou la version en ligne.
