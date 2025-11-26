# Administration

Bienvenue dans le guide d'administration d'OchoCast ! Cette section est destinée aux administrateurs de la plateforme.

## Infrastructure Scaleway

![](/img/infra_scaleway.png)

## Frontend

OchoCast est un site web statique stocké dans un Object Storage, permettant de servir le front-end via le CDN (Content Delivery Network) de Scaleway.

En savoir plus à ce sujet [ici](./02-frontend.md).

## Backend

OchoCast est une application Docker en TypeScript qui fonctionne en mode serverless. La dernière image est stockée dans le registre Scaleway et est écrasée à chaque déploiement.

En savoir plus à ce sujet [ici](./03-backend.md).

## Base de données

OchoCast utilise une DB PostgreSQL gérée par Scaleway, exposé sur Internet et protégé uniquement par mot de passe (en raison de l'impossibilité de connecter un service serverless et une base de données gérée sur un réseau privé chez Scaleway).

En savoir plus à ce sujet [ici](./07-base-de-donnees.md).

## Stockage S3

En savoir plus à ce sujet [ici](./04-stockage-s3.md).

## Streaming vidéo

Des instances de calcul standard sont nécessaires, car plusieurs ports sont utilisés (ce qui n'est pas possible en mode serverless).

En savoir plus sur le streaming vidéo :
- Consultez le [fichier](./08-serveur-rtmp.md) pour le serveur RTMP
- Consultez le [fichier](./09-serveur-websocket.md) pour le serveur WebSocket
