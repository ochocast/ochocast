# FFmpeg Transcoding Container

Le backend publie les jobs dans Scaleway Queues. En staging, le trigger appelle
ce conteneur en HTTP uniquement quand un message arrive ; aucune instance
permanente ni connexion à la queue n'est nécessaire dans le conteneur.
Voir [SERVERLESS.md](./SERVERLESS.md) pour le contrat complet.

Le conteneur lit les sources dans Object Storage, crée les rendus HLS 360p,
480p et 720p, puis transmet le résultat au backend par callback HTTP.

## Local workflow

Pour les dépendances locales (MinIO, PostgreSQL, Keycloak, queue Docker),
depuis la racine :

```bash
cd dev-tools
docker compose up -d
```

Le mode local utilise ElasticMQ sans identifiants Scaleway. Les fichiers `.env`
locaux sont déjà préparés dans ce checkout. La base de ce checkout possède déjà
les tables requises ; ne lance pas toutes les migrations sur cette base dont
l'historique de migrations est vide. Pour démarrer le backend :

```bash
cd backend
npm run start:dev
```

Pour démarrer seulement le conteneur HTTP en local, définir les deux secrets
dans `ffmpegServer/.env`, puis lancer `docker compose up --build` depuis ce
dossier. `GET http://localhost:8081/health` vérifie son démarrage. Ce Compose
ne reproduit pas le trigger Scaleway ; les tests du contrat HTTP sont dans
`tests/serverless.test.ts`.

Pour un test entièrement local, suivre
[LOCAL_FFMPEG_QUEUE.md](../dev-tools/LOCAL_FFMPEG_QUEUE.md). Pour tester une
vraie queue Scaleway depuis le local, voir
[LOCAL_QUEUE_TEST.md](./LOCAL_QUEUE_TEST.md).
Ce second parcours utilise le Terraform dédié
`ops-architecture-lab/terraform/ffmpeg-local-queue`, puis
`npm run local:queue-config` dans `backend` pour importer les accès et activer
le pont automatique. Une fois les services démarrés, un simple upload suffit.

## Processing lifecycle

1. The backend uploads source objects under `<videoId>/source/`.
2. It saves the video with `transcoding_status=pending`.
3. Le backend enregistre le job et publie un message signé dans Scaleway Queues.
4. Le trigger démarre le conteneur HTTP ; FFmpeg crée et stocke les playlists,
   segments HLS, miniature et éventuel sous-titre WebVTT.
5. Le conteneur confirme le résultat au backend via un callback HTTP.
6. Le backend met la vidéo à `ready` ou `failed` et stocke sa durée.

HLS objects remain private. The backend's public media-content route proxies
playlist and segment requests after resolving the public video ID.

## Configuration

Voir `.env.example`. Les noms de buckets Object Storage doivent être identiques
dans le backend et le conteneur. Le backend doit exposer les routes de callback
`/api/internal/transcoding/jobs/` au conteneur.

The worker accepts either the `MINIO_*` variables used by local development or
the backend-compatible `STOCK_SERVER_URL`, `STOCK_CLIENT_ID`, `STOCK_SECRET`
and `STOCK_REGION` variables.

## Commands

```bash
npm run build
npm run dev
npm test
npm run test:connection
```

L'image contient FFmpeg sur Alpine. Chaque instance traite un job HTTP à la
fois ; la montée en charge est configurée côté Scaleway Serverless Containers.
