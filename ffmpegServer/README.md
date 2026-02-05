# FFmpeg Transcoding Service

Service de transcodage vidéo avec architecture distribuée et scalable utilisant RabbitMQ et FFmpeg.

## Architecture

- **Backend (NestJS)** : API qui reçoit les uploads vidéo et publie des jobs dans RabbitMQ
- **RabbitMQ Queue** : Queue de messages pour découpler l'upload du traitement
- **FFmpeg Workers** : Workers qui consomment les jobs et transcodent les vidéos en HLS
- **Minio S3** : Stockage des vidéos, miniatures et sous-titres

## Caractéristiques

- ✅ Transcodage HLS multi-qualité (360p, 480p, 720p)
- ✅ Scaling horizontal des workers
- ✅ Gestion des priorités dans la queue
- ✅ Génération automatique de miniatures
- ✅ Support des sous-titres
- ✅ Graceful shutdown
- ✅ Monitoring et métriques

## Installation

```bash
cd ffmpegServer
npm install
```

## Configuration

Copier `.env.example` vers `.env` :

```bash
cp .env.example .env
```

Variables importantes :
- `WORKER_ID` : Identifiant unique du worker (auto-généré si non défini)
- `WORKER_CONCURRENCY` : Nombre de jobs traités en parallèle (défaut: 1)
- `RABBITMQ_URL` : URL de connexion RabbitMQ
- `MINIO_ENDPOINT` : Endpoint Minio S3

## Utilisation

### Mode Développement

```bash
npm run dev
```

### Mode Production

```bash
npm run build
npm start
```

### Docker

```bash
docker build -t ffmpeg-worker .
docker run -d --env-file .env ffmpeg-worker
```

### Scaling

Pour scaler horizontalement, lancer plusieurs workers :

```bash
# Worker 1
WORKER_ID=worker-1 WORKER_CONCURRENCY=2 npm start &

# Worker 2
WORKER_ID=worker-2 WORKER_CONCURRENCY=2 npm start &

# Worker 3
WORKER_ID=worker-3 WORKER_CONCURRENCY=1 npm start &
```

Avec Docker Compose :

```bash
docker-compose up -d --scale ffmpeg-worker=3
```

## Format de Job

```typescript
{
  "jobId": "uuid",
  "videoId": "uuid",
  "media_id": "video.mp4",
  "miniature_id": "miniature.jpg",
  "subtitle_id": "subtitle.vtt",
  "title": "Ma vidéo",
  "description": "Description",
  "tags": ["tag1", "tag2"],
  "creator": "user-id",
  "timestamp": 1234567890
}
```

## Output HLS

Le worker génère une structure HLS :

```
videoId/
├── master.m3u8           # Playlist maître
├── 360p.m3u8            # Playlist 360p
├── 360p0.ts             # Segments 360p
├── 360p1.ts
├── ...
├── 480p.m3u8            # Playlist 480p
├── 480p0.ts             # Segments 480p
├── ...
├── 720p.m3u8            # Playlist 720p
├── 720p0.ts             # Segments 720p
└── ...
```

## Monitoring

Les workers logguent :
- Jobs reçus et traités
- Progression du transcodage
- Erreurs et échecs
- Métriques de performance

## Troubleshooting

### Worker ne démarre pas

Vérifier les connexions :
```bash
npm run test:connection
```

### Jobs restent dans la queue

- Vérifier que les workers sont actifs
- Vérifier les logs des workers
- Vérifier les permissions S3

### Transcodage échoue

- Vérifier que FFmpeg est installé
- Vérifier le format de la vidéo source
- Augmenter la mémoire disponible

## Licence

MIT
