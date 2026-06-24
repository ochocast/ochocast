# FFmpeg Transcoding Worker

This service consumes video jobs from RabbitMQ, reads source files from S3,
creates 360p, 480p and 720p HLS renditions, then publishes a result event. The
NestJS backend consumes that result to update the video duration and status.

## Local workflow

Start MinIO, PostgreSQL, RabbitMQ and the worker from the repository root:

```bash
cd dev-tools
docker compose up -d
```

The backend still runs on the host during development. Its default RabbitMQ URL
is `amqp://admin:admin@localhost:5672`. Apply the database migration before
uploading a video:

```bash
cd backend
npm run migration:run
npm run start:dev
```

The RabbitMQ management UI is available at `http://localhost:15672` with
`admin` / `admin`.

## Processing lifecycle

1. The backend uploads source objects under `<videoId>/source/`.
2. It saves the video with `transcoding_status=pending`.
3. A persistent job is published to `VIDEO_QUEUE_NAME`.
4. A worker creates and uploads the HLS playlists, segments, thumbnail and
   optional WebVTT subtitle.
5. The worker publishes a persistent result to `VIDEO_RESULT_QUEUE_NAME`.
6. The backend sets the video to `ready` or `failed` and stores its duration.

HLS objects remain private. The backend's public media-content route proxies
playlist and segment requests after resolving the public video ID.

## Configuration

See `.env.example`. For production, configure the same S3 bucket names and
RabbitMQ queue names on the backend and worker. Set backend `PUBLIC_API_URL` to
the externally reachable API base URL including `/api`, for example
`https://api.example.org/api`.

The worker accepts either the `MINIO_*` variables used by local development or
the backend-compatible `STOCK_SERVER_URL`, `STOCK_CLIENT_ID`, `STOCK_SECRET`
and `STOCK_REGION` variables.

## Commands

```bash
npm run build
npm run dev
npm run test:connection
```

The production image uses the FFmpeg package installed in Alpine. Worker
parallelism is controlled by `WORKER_CONCURRENCY`; each job currently starts
three FFmpeg encoders in parallel.
