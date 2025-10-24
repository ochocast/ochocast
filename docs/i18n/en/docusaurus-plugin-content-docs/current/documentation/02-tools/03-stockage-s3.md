# S3 Bucket Management

This guide explains how to configure and manage object storage locally and in the cloud.

---

## 1. Store objects locally with MinIO

MinIO allows you to emulate S3 storage locally.

### Start MinIO

If the MinIO container is not running, execute the following command from the `localMinio` folder:

```bash
cd localMinio
docker-compose up -d
```

### Prerequisites

Make sure the following environment variables are defined in the **`/backend/.env`** file:

```bash
STOCK_MEDIA_BUCKET=media
STOCK_MINIATURE_BUCKET=miniature
STOCK_PROFILE_PICTURE_BUCKET=picture
```

### Creating Local Buckets

To store media and image files (thumbnails, profile pictures), create **three folders** in **`/localMinio/run_env`** :

- `media`
- `miniature`
- `picture`

### Access the MinIO Console

You can view and manage stored files by accessing the MinIO interface:

- **Access URL**: [http://localhost:9000](http://localhost:9000)
- **Login credentials**:
  - **Username** : `minioadmin`
  - **Password** : `minioadmin`
