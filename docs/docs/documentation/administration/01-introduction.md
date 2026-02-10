# Administration

Bienvenue dans le guide d'administration d'OchoCast — destiné aux opérateurs et administrateurs de la plateforme.

![](/img/infra_scaleway.png)

## Vue d'ensemble

Cette section regroupe les éléments d'infrastructure et d'exploitation : frontend, backend, base de données, stockage et streaming.

- Frontend : site statique servi via un Object Storage + CDN. Voir [Front-End](./02-frontend.md).
- Backend : application TypeScript packagée en conteneur Docker. Voir [Backend](./03-backend.md).
- Base de données : PostgreSQL (gérée). Voir [Base de données](./07-base-de-donnees.md).
- Stockage : buckets S3/MinIO pour médias et miniatures. Voir [Stockage S3](./04-stockage-s3.md).
- Streaming vidéo : services nécessitant instances (RTMP/HLS/DASH, WebSocket). Voir [Serveur RTMP](./08-serveur-rtmp.md) et [Serveur WebSocket](./09-serveur-websocket.md).
