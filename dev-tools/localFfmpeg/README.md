# Appliquer la queue FFmpeg et lancer le test local

Les deux dépôts doivent être sur `feat/queue-ffmpeg`. Ce lanceur crée une queue
Scaleway de développement et ses trois accès, importe la configuration dans les
`.env`, puis démarre le backend, FFmpeg et le frontend sur cet ordinateur.

## Prérequis

- Node.js 20 ou supérieur, Terraform >= 1.7, CLI `scw`, Docker démarré,
  `ffmpeg` et `ffprobe` disponibles.
- Dépendances installées dans `backend`, `frontend` et `ffmpegServer` ; lancer
  `npm run build` dans `ffmpegServer`.
- PostgreSQL, Keycloak et MinIO locaux démarrés ; buckets `media` et `miniature`
  existants. La base possède déjà les tables vidéo et `transcoding_job`.
- `.env` privés configurés dans les trois services. Backend sur le port 3001,
  FFmpeg sur 8081, frontend sur 3000. Pour FFmpeg exécuté directement avec Node,
  utiliser MinIO à `http://localhost:9000` et le callback à
  `http://127.0.0.1:3001/api`, plutôt que les adresses internes Docker.
- Identifiants opérateur Scaleway configurés dans `scw` et pour Terraform
  (`SCW_ACCESS_KEY` / `SCW_SECRET_KEY`, ou configuration locale du provider).
- Fichier privé `local.tfvars` préparé à partir de `local.tfvars.example` dans
  `ops-architecture-lab/terraform/ffmpeg-local-queue`, avec le projet de
  développement, la région et un nom `ochocast-local-ffmpeg-<suffixe>`.

Les `.env`, leurs sauvegardes, les états et les plans Terraform ne sont jamais
à ajouter à Git. Les secrets applicatifs backend et FFmpeg doivent correspondre.
Le lanceur utilise le schéma local existant : il désactive la synchronisation
TypeORM et l'exécution automatique des migrations.

## Lancer depuis la racine OchoCast

Vérification des fichiers et de Docker, sans appel à Scaleway :

```bash
node dev-tools/localFfmpeg/apply-local-ffmpeg.mjs --check
```

Appliquer et démarrer :

```bash
node dev-tools/localFfmpeg/apply-local-ffmpeg.mjs
```

Les dépôts sont voisins par défaut. Pour un autre emplacement, ajouter le
chemin du module à l'une des commandes :

```bash
node dev-tools/localFfmpeg/apply-local-ffmpeg.mjs /chemin/ops-architecture-lab/terraform/ffmpeg-local-queue
```

Sur macOS, `apply-local-ffmpeg.command` permet également de lancer la commande.
La cible est lue dans `local.tfvars` par Terraform ; aucun projet ni chemin
personnel n'est inclus dans les scripts. Le lanceur active Queues si nécessaire,
prépare un plan dans le workspace `default` et refuse toute ressource hors du
module local, toute modification, suppression ou remplacement. Il applique
ensuite le plan validé. Cette commande crée réellement les ressources chez
Scaleway ; l'utilisation de la queue peut être facturée.

Après l'apply, les clés sont importées sans être affichées. Le backend redémarre
et les trois services sont lancés. Ouvrir http://localhost:3000 et publier une
vidéo de 5 à 10 secondes pour vérifier les rendus HLS. La queue est distante,
les vidéos et leur traitement restent locaux.

Les journaux, caches et identifiants des processus sont privés dans
`.local-test/runner`. Le lanceur refuse un port occupé par un autre processus.
Arrêter les services précédemment lancés dans d'autres terminaux avant de
l'utiliser. Il n'arrête que les processus qu'il a lui-même démarrés.

```bash
node dev-tools/localFfmpeg/start-local.mjs
node dev-tools/localFfmpeg/start-local.mjs stop
node --test dev-tools/localFfmpeg/plan.test.mjs
```

Le guide [LOCAL_QUEUE_TEST.md](../../ffmpegServer/LOCAL_QUEUE_TEST.md) détaille
le fonctionnement du pont, les délais de reprise et le nettoyage de la queue.
