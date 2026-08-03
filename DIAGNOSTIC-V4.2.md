# Diagnostic conservatoire — Marées V4.2

## Architecture constatée

- Deux écrans principaux : **Aujourd’hui** et **14 jours**.
- Navigation inférieure à deux onglets, ordre conservé.
- Navigation quotidienne par flèches et frise horizontale.
- API privée Cloudflare Worker : `/api/tides?days=30`.
- Sources : `api-maree.fr` et `SunriseSunset.io`.
- Station : `boucau-bayonne-biarritz`, affichage Tarnos.
- Données : extrema, hauteurs, coefficients, niveaux toutes les 30 minutes et données solaires.
- Cache Cloudflare : six heures.
- Cache PWA : Cache Storage via service worker.
- Stockage local existant avant intervention : caches solaires `marees-solar-AAAA-MM-JJ`.
- Aucun système de favoris, de multi-station, d’IndexedDB ou de préférences n’était présent.

## Risques corrigés

- L’URL API comportait auparavant une valeur temporelle variable, ce qui empêchait un repli hors ligne fiable.
- Le changement de version du service worker supprimait la dernière réponse API mise en cache.
- Une erreur réseau sans réponse du service worker remplaçait toute l’application par un écran d’erreur.

## Éléments laissés intacts

- `src/index.js` : API, sources, station, calculs, fréquence et normalisation inchangés.
- `wrangler.jsonc` : déploiement Cloudflare inchangé.
- Structure et fonctionnement des écrans Aujourd’hui et 14 jours.
- Courbe, échelle, événements, coefficients et données solaires.
- Ordre, noms et fonction des onglets.
