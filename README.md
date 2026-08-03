# Marées Tarnos — V4.2 conservatoire

Cette version améliore l’application existante sans modifier son architecture, ses calculs, ses sources, sa station ni sa navigation.

## Nouveautés ciblées

- état compact de dernière mise à jour ;
- états actualisation, données anciennes, erreur et hors ligne ;
- conservation locale de la dernière réponse valide ;
- migration du cache API lors d’une mise à jour du service worker ;
- feuille Réglages accessible depuis l’en-tête ;
- préférences 24 h, informations solaires et animations ;
- export et import validé des préférences au format JSON ;
- copie locale précédente restaurable ;
- messages intégrés non intrusifs ;
- icônes SVG cohérentes pour les onglets et commandes ;
- amélioration des zones tactiles, du focus clavier et de la réduction des animations ;
- manifeste PWA harmonisé avec le fond noir.

## Éléments inchangés

- API Cloudflare et secret `API_MAREE_KEY` ;
- `api-maree.fr` et `SunriseSunset.io` ;
- station Boucau-Bayonne / Biarritz et affichage Tarnos ;
- calculs et valeurs ;
- graphique de marée ;
- écran Aujourd’hui ;
- vue 14 jours ;
- ordre et noms des onglets ;
- période de 30 jours ;
- cache Cloudflare de six heures.

## Mise à jour

Remplacez les fichiers de votre dépôt GitHub par ceux de cette archive et validez sur la branche connectée à Cloudflare. Cloudflare redéploiera automatiquement le projet. Le secret existant reste enregistré dans Cloudflare.

## Vérifications techniques effectuées

- syntaxe de `public/app.js`, `public/service-worker.js` et `src/index.js` ;
- validité de `package.json` et `manifest.webmanifest` ;
- présence et unicité des identifiants HTML utilisés par JavaScript ;
- comparaison confirmant que `src/index.js` et `wrangler.jsonc` sont inchangés ;
- exclusion de tout secret et de tout dossier parasite.

Consultez `DIAGNOSTIC-V4.2.md` pour le diagnostic avant intervention.
