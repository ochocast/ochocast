# Tester FFmpeg avec une queue Docker locale

Scaleway Queues ne s'exécute pas dans Docker : c'est un service cloud. Ici,
ElasticMQ fournit **une queue locale compatible avec le protocole SQS** utilisé
par Scaleway. Cela valide le parcours OchoCast → queue → FFmpeg → vidéo prête,
sans compte Scaleway ni infrastructure staging. Cela ne valide pas le trigger
serverless ni l'autoscaling Scaleway.

Pour remplacer l'émulateur Docker par une **vraie queue Scaleway**, créée avec
un Terraform dédié sans infrastructure staging, suivre
[LOCAL_QUEUE_TEST.md](../ffmpegServer/LOCAL_QUEUE_TEST.md). La commande
`npm run local:queue-config` bascule le backend et conserve sa configuration
précédente dans une sauvegarde locale privée.

## Configuration déjà préparée

- `dev-tools/docker-compose.yml` démarre ElasticMQ sur `127.0.0.1:9324`.
- `dev-tools/elasticmq/elasticmq.conf` crée la queue
  `ochocast-local-ffmpeg` au démarrage.
- `backend/.env` pointe sur cette queue avec le provider `local`. Les clés
  `local/local` sont factices et ne servent qu'à former la requête signée.
- `ffmpegServer/.env` contient les mêmes secrets de signature que le backend,
  uniquement pour le développement local.

N'utilise pas ces valeurs de développement en staging. Les fichiers `.env`
locaux sont ignorés par Git.

## Démarrage

Depuis la racine du dépôt, démarre les services locaux :

```bash
cd dev-tools
docker compose up -d
```

Le backend doit avoir ses dépendances installées et sa base locale prête :

```bash
cd backend
npm run start:dev
```

Dans ce checkout, la base locale possède déjà les tables vidéo et
`transcoding_job`. Son historique de migrations est vide ; **ne lance pas
`migration:run` sur cette base existante** sans vérifier l'état du schéma.

Dans un autre terminal, démarre le conteneur FFmpeg HTTP :

```bash
cd ffmpegServer
docker compose up --build -d
```

Vérifie que `http://localhost:8081/health` répond `{"status":"ok"}`. Le
backend local doit pouvoir utiliser PostgreSQL et les buckets MinIO `media` et
`miniature`, présents dans ce checkout (voir [MinIO](./localMinio/README.md)).
Le frontend pointe déjà vers `http://localhost:3001` dans ce checkout. Dans un
autre terminal, démarre-le avec :

```bash
cd frontend
npm start
```

## Test

Publie une vidéo de 5 à 10 secondes dans OchoCast. **Aucune commande de queue
n'est nécessaire après l'upload** : le backend publie le message, le lit
automatiquement dans ElasticMQ, appelle FFmpeg local, puis le supprime après
confirmation. Le statut de la vidéo doit passer à `ready` et ses rendus HLS
360p, 480p et 720p doivent être présents dans MinIO.

Si le traitement échoue, le message reste dans la queue et redevient visible
après le délai configuré. Consulte les logs du backend et de FFmpeg ; pour
reprendre un message visible sans refaire un upload, lance
`npm run local:queue-bridge` dans `backend`. La queue est en mémoire : ses
messages sont perdus si le conteneur ElasticMQ est recréé.
