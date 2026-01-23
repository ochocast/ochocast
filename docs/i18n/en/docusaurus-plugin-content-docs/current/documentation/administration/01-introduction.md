# Administration

Welcome to the OchoCast administration guide! This section is intended for platform administrators.

## Scaleway Infrastructure

![](/img/infra_scaleway.png)

## Frontend

OchoCast is a static website stored in an Object Storage, allowing the front-end to be served via Scaleway's CDN (Content Delivery Network).

Learn more about this [here](./02-frontend.md).

## Backend

OchoCast is a Docker application in TypeScript that runs in serverless mode. The latest image is stored in the Scaleway registry and is overwritten with each deployment.

Learn more about this [here](./03-backend.md).

## Database

OchoCast uses a PostgreSQL DB managed by Scaleway, exposed on the Internet and protected only by password (due to the impossibility of connecting a serverless service and a managed database on a private network at Scaleway).

Learn more about this [here](./07-base-de-donnees.md).

## S3 Storage

Learn more about this [here](./04-stockage-s3.md).

## Video Streaming

Standard compute instances are required, as multiple ports are used (which is not possible in serverless mode).

Learn more about video streaming:
- Check the [file](./08-serveur-rtmp.md) for the RTMP server
- Check the [file](./09-serveur-websocket.md) for the WebSocket server
