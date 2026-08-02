# Marées Tarnos — V3

Application personnelle pour iPhone, publiée directement avec GitHub Pages.

## Installation

1. Envoyer tous les fichiers à la racine du dépôt GitHub `Marees`.
2. Dans **Settings → Pages**, choisir `main` et `/ (root)`.
3. Ouvrir le site dans Safari puis choisir **Partager → Sur l’écran d’accueil**.

Aucune clé API, aucun secret, aucun script Python et aucune GitHub Action ne sont nécessaires.

## Actualisation

L’application récupère les prévisions marines Open-Meteo et les horaires solaires SunriseSunset.io à chaque ouverture. La dernière réponse valide est conservée localement sur l’iPhone et sert de secours si le réseau est temporairement indisponible.

## Important

Les marées sont estimées à partir du niveau marin du modèle Open-Meteo. Les hauteurs sont adaptées à une lecture locale et les coefficients français ne sont pas disponibles. Ces données ne remplacent pas les prédictions officielles du SHOM et ne doivent pas être utilisées pour la navigation.
