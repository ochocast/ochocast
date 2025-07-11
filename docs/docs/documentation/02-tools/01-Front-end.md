# Front-End

## Description

Le frontend de la plateforme de streaming.

Le frontend d’une application fait référence aux composants de l'interface utilisateur (UI) et de l'expérience utilisateur (UX) avec lesquels les utilisateurs interagissent directement. C'est la partie du logiciel qui s'exécute du côté client, ce qui signifie qu'elle est exécutée dans le navigateur web ou l'appareil de l'utilisateur.

## Installation et Pré-requis

Une fois que vous avez configuré la base de données et Keycloak, n'oubliez pas de configurer les variables d'environnement dans un fichier `.env`. Vous pouvez copier le fichier `frontend/.env.example` dans un nouveau fichier `.env` dans le dossier frontend.

Vous pouvez maintenant procéder à l'exécution du frontend et du backend (vous pouvez exécuter les deux en même temps depuis la racine du projet).

Depuis le dossier `frontend`, si vous n'avez pas encore installé les dépendances nécessaires, exécutez :


```bash
npm install
```

Pour déployer localement :

```
cd ./frontend
cp .env.example .env
npm run start
```

## Structure du Front

Dans frontend/src, vous trouverez plusieurs dossiers ayant des objectifs différents.

Public : Ce dossier contient des fichiers statiques qui sont servis directement par le serveur web. Ces fichiers ne sont pas traités par le système de build et sont accessibles via l'URL racine de votre application. Les fichiers courants dans ce dossier incluent index.html, favicon et d'autres ressources devant être accessibles publiquement.

Assets : Ce dossier contient tous les fichiers statiques tels que des images, des icônes, des médias et d'autres ressources qui ne sont pas censés changer pendant l'exécution de l'application. Ces fichiers sont essentiels pour l'interface et le design de l'application.

Components : Dans ce dossier, vous trouverez différents agencements et éléments utilisés dans les différentes pages de l'application. Ils sont réutilisables, peuvent s'adapter aux différentes propriétés et sont souvent séparés en petits éléments.

Pages : Les pages sont également des composants. Cependant, elles ne sont pas destinées à être réutilisées et représentent des vues entières de l'application. Chaque fichier ou sous-dossier dans le dossier pages correspond généralement à une route spécifique de votre application. Cette structure permet de maintenir une séparation claire entre les différentes sections de votre interface utilisateur.

Utils : Ce dossier contient généralement des interfaces, des fonctions utilitaires ou des modules d'aide qui fournissent des fonctionnalités couramment utilisées dans toute l'application. Le but de ce dossier est de centraliser et organiser les fonctions qui ne sont pas liées à un composant ou à un module spécifique. Par exemple, une fonction de formatage de date ou une interface.

## Design UX / UI

Le design de l'application frontend doit respecter le système de design d'OchoCast établi dans Figma.
