# Gestion des Buckets S3

Ce guide explique comment configurer et gérer le stockage des objets en local et sur le cloud.

---

## Stocker des objets en local avec MinIO

MinIO permet d'émuler un stockage S3 en local.

### Démarrer MinIO

Si le conteneur MinIO n'est pas lancé, exécutez depuis le dossier `localMinio` :

```bash
cd localMinio
docker-compose up -d
```

### Prérequis

Définissez les variables suivantes dans `backend/.env` (ou équivalent) :

```bash
STOCK_MEDIA_BUCKET=media
STOCK_MINIATURE_BUCKET=miniature
STOCK_PROFILE_PICTURE_BUCKET=picture
STOCK_BRANDING_BUCKET=branding
```

### Créer les buckets locaux

Créez les dossiers suivants dans `localMinio/run_env` pour émuler les buckets :

- `media`
- `miniature`
- `picture`
- `branding`

### Accéder à la console MinIO

- **URL** : http://localhost:9000
- **Username** : `minioadmin`
- **Password** : `minioadmin`