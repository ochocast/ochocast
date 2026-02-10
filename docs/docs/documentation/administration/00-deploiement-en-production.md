# Déployer en production

## Table des matières
1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
    - [Database (PostgreSQL)](#database-postgresql)
    - [Authentication (Keycloak)](#authentication-keycloak)
    - [Storage (Minio)](#storage-minio)
3. [Service Configuration](#service-configuration)
    - [Backend (NestJS)](#backend-nestjs)
    - [Frontend (React)](#frontend-react)
    - [SFU Server (Go)](#sfu-server-go)
    - [WebSocket Server](#websocket-server)
    - [RTMP Server](#rtmp-server)
4. [Deployment Steps](#deployment-steps)
    - [Local Deployment](#local-deployment)
    - [Production Deployment](#production-deployment)
5. [Troubleshooting](#troubleshooting)

---

## Mise en place de l'infrastructure

Pour fonctionner correctement, Ochocast à besoin de base de donnée, d'un serveur d'authentification et d'un stockage S3.

### Database (PostgreSQL)
- version requise : 13.3
- Lancer les migrations : `yarn run typeorm migration:run` //TODO verifier si les migration existent

### Authentication
Vous aurez besoin d'un client frontend et d'un client backend pour Keycloak.:
1. **Configuration pour le client frontend**:
    - Nom: `ochocast`
    - url de redirection: `<domain>/*`
    - Web Origins: `<domain>`
2. **Configuration pour le client backend ( pour la verification des jwt)**:
    - Nom: `nest-back`
    - Enable Client Auth: On
    - Authorization Enabled: On
    - Flow: Standard flow Off, Implicit Flow On (or as required by your setup)
3. **Création d'un utilisateur admin (pour ?)**: Add a user in the `Users` tab and set a password in the `Credentials` tab.

### Storage S3
Ochocast utilise un stockage S3.

4 buckets sont nécéssaire : 
- `media` *Stock l'ensemble des videos de la plateforme*
- `miniature` *Stock les miniatures des videos* 
- `picture` * ??? * 
- `branding` * ??? *

---

## Etapes de déployement

### Backend (NestJS)
1. pull image: docker pull swannbrunet/ochocast-backend:latest
2. Variable :
   - Base de donnée :
     - PG_PORT
     - PG_HOST 
     - PG_USERNAME 
     - PG_PASSWORD 
     - PG_DATABASE
   - Authentification :
     - AUTH_SERVER_URL
     - AUTH_REALM
     - AUTH_CLIENT_ID
     - AUTH_SECRET
   - Stockage :
     - STOCK_SERVER_URL
     - STOCK_CLIENT_ID
     - STOCK_SECRET
     - STOCK_MEDIA_BUCKET
     - STOCK_MINIATURE_BUCKET
     - STOCK_PROFILE_PICTURE_BUCKET
     - STOCK_BRANDING_BUCKET
     - STOCK_REGION
   - Global :
     - NODE_ENV=production
     - PORT=3001
     - WS_PORT=3001

### Frontend (React)
1. pull the latest image: docker pull swannbrunet/ochocast-frontend:latest
2. variable :
   - REACT_APP_API_URL=[url]
   - REACT_APP_API_PORT=[port]
   - REACT_APP_WS_URL=[url]:[port]
   - REACT_APP_STREAM_URL = [url]
   - REACT_APP_SERVER_IP =[url]
   - REACT_APP_SFU_URL = [url]:[port]
   - Authentification :
     - CLIENT_ID 
     - REDIRECT_URI
     - AUTHORIZATION_ENDPOINT

### SFU Server (Go)
Le serveur SFU nécessite toujours un Control Plane pour fonctionner.

**Control Plane**
1. pull image: docker pull swannbrunet/ochocast-controlplane:latest
2. variable :
   - CONTROL_PLANE_PORT=443
   - ENABLE_HTTPS=true
   - CERT_FILE=cert.pem
   - KEY_FILE=key.pem

**SFU Server(s)**
1. pull image: docker pull swannbrunet/ochocast-sfu:latest
2. variable :
   - SFU_ID=sfu-1 *Identifiant unique*
   - SERVER_PORT=443
   - SERVER_URL=https://sfu1.example.com
   - CONTROL_PLANE_URL=https://controlplane.example.com
   - ENABLE_HTTPS=true
   - CERT_FILE=cert.pem
   - KEY_FILE=key.pem
   - SFU_REGION=us-west-1 *Optionnel*
   - SFU_ZONE=zone-a *Optionnel*
   - PUBLIC_IP=203.0.113.42 *Pour NAT mapping*
   - STUN_SERVERS=stun:stun.l.google.com:19302 *Optionnel*
   - TURN_SERVER=turn:turnserver.example.com:3478 *Pour NAT traversal*
   - TURN_USERNAME=username *Si TURN configuré*
   - TURN_PASSWORD=password *Si TURN configuré*
   - ENABLE_ICE_TCP=false *Pour réseaux restrictifs*
   - ICE_RELAY_ONLY=false *Forcer TURN relay*

### Transcoder service (FFmpeg)
1. pull the latest image: //Registry container
2. variable :

---

## Troubleshooting

- **Login issues**: Ensure `REACT_APP_CLIENT_ID`, `REACT_APP_REDIRECT_URI`, and `REACT_APP_AUTHORIZATION_ENDPOINT` in the frontend `.env` match your Keycloak configuration.
- **Database Connection**: If the backend cannot connect to the database, verify that no local PostgreSQL service is using port 5432.
- **Minio Buckets**: Ensure all 4 buckets (`media`, `miniature`, `picture`, `branding`) are created before uploading media.
- **Port Conflicts**: Check that ports 3000 (Frontend), 3001 (Backend), 8080 (Keycloak/RTMP HTTP), 1935 (RTMP), and 8090 (SFU) are available.
