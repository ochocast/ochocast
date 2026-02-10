# Managing S3 Buckets

This guide explains how to configure and manage object storage locally and in the cloud.

---

## Storing objects locally with MinIO

MinIO allows emulating S3 storage locally.

### Start MinIO

If the MinIO container is not running, execute from the `localMinio` folder:

```bash
cd localMinio
docker-compose up -d
```

### Prerequisites

Set the following variables in `backend/.env` (or equivalent):

```bash
STOCK_MEDIA_BUCKET=media
STOCK_MINIATURE_BUCKET=miniature
STOCK_PROFILE_PICTURE_BUCKET=picture
STOCK_BRANDING_BUCKET=branding
```

### Create local buckets

Create the following folders under `localMinio/run_env` to emulate buckets:

- `media`
- `miniature`
- `picture`
- `branding`

### Access the MinIO console

- **URL**: http://localhost:9000
- **Username**: `minioadmin`
- **Password**: `minioadmin`
