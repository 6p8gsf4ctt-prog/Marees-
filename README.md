# Marées Tarnos — version connectée

Application PWA personnelle, conçue pour l’iPhone en mode portrait.

## 1. Obtenir la clé de données

1. Créer un compte sur **api-maree.fr**.
2. Copier la clé API affichée dans le compte.

## 2. Ajouter la clé dans GitHub

Dans le dépôt **Marees** :

1. Ouvrir **Settings**.
2. Ouvrir **Secrets and variables → Actions**.
3. Cliquer sur **New repository secret**.
4. Nom : `API_MAREE_KEY`
5. Valeur : la clé copiée sur api-maree.fr.

La clé reste protégée dans GitHub et n’est jamais intégrée au site public.

## 3. Lancer la première actualisation

1. Ouvrir l’onglet **Actions** du dépôt.
2. Choisir **Actualiser les marées**.
3. Cliquer sur **Run workflow**.

Le fichier `data/tides.json` sera ensuite renouvelé automatiquement chaque jour. La tâche récupère huit jours de données pour **Boucau-Bayonne / Biarritz**, port de référence de Tarnos, ainsi que l’aube civile, le lever, le coucher et le crépuscule civil à Tarnos.

## 4. Publier sur GitHub Pages

Dans **Settings → Pages** :

- Source : **Deploy from a branch**
- Branche : `main`
- Dossier : `/ (root)`

Adresse prévue :

`https://6p8gsf4ctt-prog.github.io/Marees/`

## Installation sur iPhone

Dans Safari : **Partager → Sur l’écran d’accueil → Ajouter**.

## Fonctionnement hors connexion

L’application conserve la dernière version téléchargée des données. En cas de panne temporaire de la source, les dernières données disponibles restent visibles.


## Correction 2.1 — Soleil

Les heures solaires sont désormais chargées directement par l’application lorsqu’elles ne sont pas encore présentes dans `data/tides.json`. Elles sont ensuite conservées localement. Cette récupération ne nécessite aucune clé.

## Amélioration 2.2 — Date des marées

Chaque horaire de marée affiche désormais une date courte discrète, y compris la prochaine marée mise en avant. Cela évite toute ambiguïté pour les événements proches de minuit.
