# Front-End

## Description

Le frontend de la plateforme de streaming.

Le frontend d'une application fait référence aux composants de l'interface utilisateur (UI) et de l'expérience utilisateur (UX) avec lesquels les utilisateurs interagissent directement. C'est la partie du logiciel qui s'exécute du côté client, ce qui signifie qu'elle est exécutée dans le navigateur web ou l'appareil de l'utilisateur.

## Installation et Pré-requis

Une fois que vous avez configuré la base de données et Keycloak, n'oubliez pas de configurer les variables d'environnement dans un fichier `.env`. Vous pouvez copier le fichier `frontend/.env.example` dans un nouveau fichier `.env` dans le dossier frontend.

Vous pouvez maintenant procéder à l'exécution du frontend et du backend (vous pouvez exécuter les deux en même temps depuis la racine du projet).

Depuis le dossier `frontend`, si vous n'avez pas encore installé les dépendances nécessaires, exécutez :


```bash
npm install
```

Pour déployer localement :

```bash
cd frontend
cp .env.example .env
npm run start
```

Exécuter le backend et le frontend simultanément depuis la racine du projet est possible et pratique pour le développement.

## Organisation du code

- `public/` : fichiers statiques (index.html, favicon, etc.).
- `src/assets/` : images, icônes et médias fixes.
- `src/components/` : composants réutilisables.
- `src/pages/` : vues correspondant aux routes.
- `src/utils/` : utilitaires et interfaces partagées.

## Design

Respectez le système de design OchoCast disponible dans Figma pour l'UI/UX.
```
