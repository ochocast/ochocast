---
slug: /
---
# Introduction au projet Open Source Ochocast
Ochocast est une application de streaming multicanal pour les événements. Elle est divisée en deux parties : le stockage vidéo et le streaming en direct.

La partie stockage est actuellement en cours de développement, tandis que la partie streaming est prévue pour plus tard.

Cette application est le fruit du travail d'Octo et des étudiants de la spécialité SIGL de l'EPITA.

## Installation
Veuillez consulter cette [page](./02-installation.md) pour faire vos premiers pas et contribuer au projet.

## Infrastructure Scaleway

![](./img/infra_scaleway.png)

## Frontend

OchoCast est un site web statique stocké dans un Object Storage, permettant de servir le front-end via le CDN (Content Delivery Network) de Scaleway.

En savoir plus à ce sujet [ici](./02-tools/01-Front-end.md).

## Backend

OchoCast est une application Docker en TypeScript qui fonctionne en mode serverless. La dernière image est stockée dans le registre Scaleway et est écrasée à chaque déploiement.

En savoir plus à ce sujet [ici](./02-tools/02-Backend-Architecture.md).

## Base de données

OchoCast utilise une DB PostgreSQL gérée par Scaleway, exposé sur Internet et protégé uniquement par mot de passe (en raison de l'impossibilité de connecter un service serverless et une base de données gérée sur un réseau privé chez Scaleway).

En savoir plus à ce sujet [ici](./02-tools/03-stockage-s3.md).

## Streaming vidéo & Authentification

Des instances de calcul standard sont nécessaires, car plusieurs ports sont utilisés (ce qui n'est pas possible en mode serverless).

En savoir plus sur l'authentification [ici](./02-tools/04-Authentification.md).

En savoir plus sur le streaming vidéo :
- Consultez le [fichier](./03-tutorial-extras/03-rtmpServer.md) pour le serveur RTMP
- Consultez le [fichier](./03-tutorial-extras/04-WebSocketServer.md) pour le serveur WebSocket

# Branches

![](./img/branch_flow.png)

Diagramme de notre flux Git basé sur le tronc (idéal).

Actuellement, il n'y a pas de branches de release. La branche principale est déployée à chaque commit.

![](./img/current_branch_flow.png)

# CI/CD

![](./img/CI_CD.png)
En savoir plus à ce sujet [ici](./02-tools/05-CI-CD.md).
