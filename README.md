# Estimateur m²

Estimation du prix de vente et du loyer d'un logement, partout en France (Paris et Corse recalés en priorité). Trois onglets dans la même page :

- **Estimer** : adresse, type et surface suffisent pour obtenir le prix, le loyer et le rendement. Les ventes réelles DVF autour de l'adresse (API Cerema) sont actualisées dans le temps, puis ajustées selon les caractéristiques du bien, à préciser dans « Affiner » (DPE, étage, extérieur, état…), avec des coefficients sourcés. Le loyer vient de la carte officielle des loyers par commune (ANIL), recalée sur les annonces récentes à Paris (Hestia) et en Corse (SeLoger), en vide ou en meublé. La question « Travaux prévus ? » donne le budget de rénovation (dont énergie) et la valeur et le loyer après travaux.
- **Financer** : l'essentiel d'abord (prix, apport, durée, nom propre ou SCI, loyer), puis deux scénarios, « Garder et louer » ou « Revendre ». Les sections Travaux, Impôts et Évolutions ne sont comptées que si elles sont ouvertes. Les réglages détaillés (taux du marché + surprime SCI, assurance, différé, frais, charges) ont des valeurs par défaut réalistes.
- **Mes crédits** : comparaison de crédits en cours avec les taux actuels (renégociation ou rachat).

Tout tourne dans le navigateur : ouvrir `app/index.html`, ou la version en ligne.
