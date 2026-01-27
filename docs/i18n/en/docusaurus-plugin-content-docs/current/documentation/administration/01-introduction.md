# Administration

Welcome to the OchoCast administration guide — intended for platform operators and administrators.

![](/img/infra_scaleway.png)

## Overview

This section groups infrastructure and operational components: frontend, backend, database, storage and streaming.

- Frontend: static site served via an Object Storage + CDN. See [Front-End](./02-frontend.md).
- Backend: TypeScript application packaged as a Docker container. See [Backend](./03-backend.md).
- Database: PostgreSQL (managed). See [Database](./07-base-de-donnees.md).
- Storage: S3/MinIO buckets for media and thumbnails. See [S3 Storage](./04-stockage-s3.md).
- Video streaming: services requiring instances (RTMP/HLS/DASH, WebSocket). See [RTMP Server](./08-serveur-rtmp.md) and [WebSocket Server](./09-serveur-websocket.md).
