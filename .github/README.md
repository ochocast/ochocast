# Ochocast Opensource project
Ochocast is a multitrack streaming application for events. It is divided into two: video storage and live streaming. 

The storage part is currently a work in progress.


This application is the work of Octo and Epita students in the SIGL specialty.
  
If you want the detailed step of installation, you can see this [page](../README.md).

## Scaleway infrastructure

![Scaleway Infrastructure](images/infra_scaleway.png)

## Frontend

Static website in Object Storage, to serve the front end via the Scaleway CDN (Content Delivery Network).

See more on this [page](../frontend/README.md).

## Backend

TypeScript Docker application in serverless mode. The last image is stored in the Scaleway registry and overwritten with every deployment.

See more on this [page](../backend/README.md).

## Database

Postgresql managed by scaleway, exposed on the Internet and password-protected only (thanks to the impossibility of putting serverless and a managed DB on a private network in Scaleway).
See more on this [page](../database/README.md).

## Stream video & Authentification

Standard compute instances required because multiple ports are used (not available in serverless).

See more about authentification on this [page](../localKeycloak/README.md).

See more about stream video on this [page](../rtmpServer/README.md) for RTMP Server, \
Or on this [page](../webSocketServer/README.md) for websocket Server.

# Branches

![Branches](images/branch_flow.png)

Diagram of our trunk-based gitflow (ideal)

Currently, there are no release branches. The main branch is deployed with each commit.

![Branches](images/current_branch_flow.png)

# CI/CD

![CI/CD](images/CI_CD.png)
See more on this [page](./workflows/README.md).
