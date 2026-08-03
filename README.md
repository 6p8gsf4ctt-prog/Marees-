# Marées Tarnos — V4.1

Correction graphique : les libellés PM/BM, horaires et hauteurs sont maintenant placés dans des zones réservées au-dessus des sommets et sous les creux de la courbe.

Ce dépôt contient une application complète hébergée par **Cloudflare Workers Static Assets** et une API privée exécutée dans le même Worker.

## Ce qui est déjà prêt

- interface mobile/PWA ;
- horaires, hauteurs et coefficients de marée ;
- courbe de marée ;
- horaires solaires ;
- 30 jours de données ;
- cache Cloudflare de 6 heures ;
- aucune clé visible dans le navigateur ;
- déploiement automatique à chaque modification du dépôt GitHub.

## Installation — deux opérations personnelles indispensables

### 1. Obtenir la clé de marée

Créez un compte sur `api-maree.fr`, connectez-vous et copiez votre clé API.

### 2. Importer ce dépôt dans Cloudflare

1. Téléversez tous les fichiers de ce dossier dans un dépôt GitHub nommé, par exemple, `Marees`.
2. Dans Cloudflare : **Workers & Pages → Create application → Import a repository**.
3. Sélectionnez le dépôt GitHub.
4. Vérifiez les paramètres :
   - nom du Worker : `marees-tarnos` ;
   - commande de déploiement : `npm run deploy` ;
   - aucune commande de build nécessaire.
5. Cliquez sur **Save and Deploy**.
6. Dans le Worker : **Settings → Variables and Secrets → Add → Secret**.
7. Nom : `API_MAREE_KEY`.
8. Valeur : votre clé `api-maree.fr`.
9. Redéployez le Worker depuis **Deployments** ou poussez un nouveau commit GitHub.

L’application sera disponible sur une adresse de type :

`https://marees-tarnos.<votre-sous-domaine>.workers.dev`

## Vérifications

- `/api/health` doit répondre avec `{ "ok": true }`.
- `/api/tides?days=30` doit retourner un JSON contenant `days`.
- La page d’accueil doit charger les données automatiquement.

## Mise à jour

Après l’installation initiale, aucune intervention quotidienne n’est nécessaire. Le Worker renouvelle les données automatiquement au premier appel après expiration du cache de six heures. Chaque modification poussée sur GitHub est redéployée automatiquement par Cloudflare.

## Développement local facultatif

```bash
npm install
cp .dev.vars.example .dev.vars
# Remplacer la valeur dans .dev.vars
npm run dev
```


## Version interface V4

Cette version améliore uniquement l’interface : courbe animée avec repères PM/BM et hauteurs, frise de jours affinée, et transitions discrètes. L’API et le secret Cloudflare restent inchangés.