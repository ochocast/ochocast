# Gestion des Buckets S3

Ce guide explique comment configurer et gérer le stockage des objets en local et sur le cloud.

---

## 1. Stocker des objets en local avec MinIO

MinIO permet d'émuler un stockage S3 en local.

### Démarrer MinIO

Si le conteneur MinIO n'est pas lancé, exécutez la commande suivante depuis le dossier `localMinio` :

```bash
cd localMinio
docker-compose up -d
```

### Prérequis

Assurez-vous que les variables d’environnement suivantes sont définies dans le fichier **`/backend/.env`** :

```bash
STOCK_MEDIA_BUCKET=media
STOCK_MINIATURE_BUCKET=miniature
STOCK_PROFILE_PICTURE_BUCKET=picture
```

### Création des Buckets Locaux

Pour stocker les fichiers de médias et d'images (miniatures, photos de profil), créez **trois dossiers** dans **`/localMinio/run_env`** :

- `media`
- `miniature`
- `picture`

### Accéder à la Console MinIO

Vous pouvez visualiser et gérer les fichiers stockés en accédant à l'interface MinIO :

- **URL d'accès** : [http://localhost:9000](http://localhost:9000)
- **Identifiants de connexion** :
  - **Username** : `minioadmin`
  - **Password** : `minioadmin`
