# FFmpeg déclenché par Scaleway Queues

Le chemin staging est `backend → Scaleway Queue → trigger HTTP → FFmpeg → S3 + callback backend`.
L'image FFmpeg démarre un serveur HTTP, sans polling. Une requête traite une vidéo.
La plateforme peut réduire à zéro le nombre d'instances inactives. Le serveur ne quitte pas le processus après chaque réponse : Scaleway gère son cycle de vie.

## Code et responsabilités

- `backend/src/videos/uploads/` : multipart direct S3, vidéo HLS en attente et job enregistrés ensemble ; reprise des publications après commit.
- `backend/src/queue/queue.service.ts` : publication d'un message signé dans Scaleway Queues.
- `backend/src/queue/scaleway-queues.client.ts` : client HTTP natif Scaleway Queues ; aucune dépendance AWS n'est utilisée pour la file.
- `backend/src/transcoding-jobs/` : authentification des callbacks, acquisition atomique d'un verrou par job, statut persistant et réception du résultat.
- `ffmpegServer/src/http-worker.ts` : `GET /health`, `POST /` (trigger Scaleway), `POST /transcode` (alias local).
- `ffmpegServer/src/serverless/` : vérification des messages, client backend et orchestration.
- `ffmpegServer/src/services/job-processor.service.ts` : téléchargement en flux vers le disque, transcodage et checkpoint S3.
- `.github/workflows/ffmpeg-serverless.yml` : tests, construction `linux/amd64` et publication de l'image.

Les ressources Scaleway, secrets d'environnement et déploiements restent dans `ops-architecture-lab`.
Le workflow existant de promotion frontend/backend n'est pas un déploiement de FFmpeg. L'image FFmpeg est publiée séparément ; son digest doit être renseigné dans le staging ops.

## Configuration du backend

Appliquer la migration `1789574400000-AddTranscodingJobs` avant d'activer les uploads vidéo avec Scaleway Queues.
Elle ajoute une table `transcoding_job`, liée aux vidéos et supprimée en cascade avec elles.

```dotenv
TRANSCODING_QUEUE_PROVIDER=scaleway
TRANSCODING_QUEUE_ENDPOINT=https://sqs.mnq.fr-par.scaleway.com
TRANSCODING_QUEUE_REGION=fr-par
TRANSCODING_QUEUE_URL=<URL de la queue créée par ops>
TRANSCODING_QUEUE_ACCESS_KEY=<clé de publication de la queue>
TRANSCODING_QUEUE_SECRET_KEY=<secret de publication de la queue>
TRANSCODING_DISPATCH_SECRET=<secret aléatoire de 32 caractères minimum>
TRANSCODING_CALLBACK_SECRET=<autre secret aléatoire de 32 caractères minimum>
TRANSCODING_LEASE_SECONDS=3600
UPLOAD_MAX_BYTES=1073741824
```

Le backend publie uniquement vers Scaleway Queues. Sans cette configuration, il refuse de démarrer.
Les credentials Queues sont distincts des credentials Object Storage.
Le client HTTP Scaleway publie un JSON `{ "job": VideoTranscodingJob, "signature": "..." }`.
Scaleway Queues expose le protocole SQS ; le code signe donc directement la requête HTTP avec les clés Scaleway, sans installer de SDK AWS.
La signature est un HMAC SHA-256 hexadécimal de `JSON.stringify(job)` avec `TRANSCODING_DISPATCH_SECRET`.
Le trigger doit transmettre le corps du message brut au container, sans format d'événement d'un autre fournisseur.
La queue Scaleway utilisée est une queue standard, sans priorité de message.

## Configuration du container FFmpeg

```dotenv
NODE_ENV=production
PORT=8080
TRANSCODING_BACKEND_URL=https://<backend-de-cet-environnement>/api
TRANSCODING_DISPATCH_SECRET=<même secret dispatch que le backend>
TRANSCODING_CALLBACK_SECRET=<même secret callback que le backend>
TRANSCODING_JOB_TIMEOUT_MS=3000000
TRANSCODING_MAX_SOURCE_BYTES=1073741824
TRANSCODING_WORK_DIR=/work/transcoding
FFMPEG_THREADS=2
STOCK_SERVER_URL=https://s3.fr-par.scw.cloud
STOCK_REGION=fr-par
STOCK_CLIENT_ID=<clé S3>
STOCK_SECRET=<secret S3>
STOCK_MEDIA_BUCKET=<bucket media de cet environnement>
STOCK_MINIATURE_BUCKET=<bucket miniatures de cet environnement>
```

Le backend doit être joignable par le worker et autoriser les callbacks via son ingress. Les routes applicatives vérifient le secret dans `X-Transcoding-Token`, sans le faire passer par la validation JWT Keycloak. Si le container backend est lui-même privé au niveau Scaleway IAM, configurer également l'accès réseau/IAM correspondant dans ops (l'en-tête applicatif seul ne remplace pas l'authentification de la plateforme).

Les fichiers vidéo et WAV sont téléchargés/uploadés en flux. Les pièces jointes sont limitées à 8 MiB pour la miniature et 4 MiB pour les sous-titres ; le message de queue est limité à 64 KiB. Le staging configure une limite source de 1 GiB, identique à `UPLOAD_MAX_BYTES` du backend. Le worker conserve un défaut de 5 GiB si cette variable est absente ; fournir la valeur explicitement et ajuster les deux limites ensemble après mesure du disque, de la RAM et du temps de traitement. Les trois encodages HLS restent parallèles.

`/work/transcoding` doit disposer de suffisamment de disque pour la source, les trois rendus HLS et le WAV. Ne pas le remplacer par `/tmp` sur le sandbox Scaleway v2 : ce dernier est en RAM. Les fichiers temporaires sont isolés par invocation et nettoyés après traitement.

## Contrat pour ops-architecture-lab

Pour le staging, prévoir :

1. Queue standard et stratégie de rétention/rejeu, credentials et file d'échec avec alerte.
2. Container depuis l'image FFmpeg validée, port `8080`, probe `GET /health`.
3. Trigger Queues transmettant le message en `POST /`. Pas de consumer à démarrer dans le container.
4. Autoscaling par requêtes, concurrence **1**, minimum **0**, maximum initial **2** en staging, à mesurer.
5. Timeout HTTP de **3300 s**, timeout applicatif de **3000 s**, verrou backend de **3600 s**. Vérifier également le timeout du proxy placé devant le backend et celui du trigger. Régler la visibilité de la queue pour éviter une redélivrance pendant un encodage (3900 s dans le module staging), et sa rétention pour absorber le backlog.
6. Secrets et permissions minimales : publication Scaleway Queues pour le backend, consommation pour le trigger, lecture/écriture Object Storage pour le worker.
7. Logs et alertes sur erreurs, jobs bloqués, âge des messages, saturation disque/RAM et file d'échec.

Une requête ne renvoie `200` qu'après confirmation du résultat en base (ou si le job est déjà terminé/supprimé). Une instance occupée ou un incident transitoire renvoie `503`. Une erreur FFmpeg est enregistrée comme `failed`, puis le message reste rejouable : une prochaine tentative peut repasser en `pending`, puis `ready`.

Scaleway documente un nombre limité de retries du trigger ; un `503` ne garantit pas des retries illimités. Vérifier le comportement réel d'épuisement/redrive en staging et prévoir une procédure de rejeu des jobs en échec. La file d'échec et les alertes sont à configurer dans ops, elles ne sont pas créées par le code applicatif.

## Doublons, panne et reprise

- L'acquisition du job utilise un verrou PostgreSQL, donc plusieurs instances ne peuvent pas acquérir simultanément le même job.
- Chaque tentative reçoit un `leaseToken`. Un callback obsolète ne peut pas finaliser une nouvelle tentative.
- Après réussite, les doublons sont acquittés sans refaire FFmpeg. Une erreur tardive ne remplace pas un succès en base.
- Après upload complet, le résultat est conservé dans `<videoId>/_transcoding/<jobId>/result.json`. Si le callback échoue, ce checkpoint permet de réessayer le callback sans réencoder.
- Si le processus est tué ou le backend inaccessible, le verrou expire. Un rejeu doit intervenir après son expiration ; des retries immédiats peuvent être épuisés avant cette date. Inspecter/redriver les messages restants depuis ops.
- Les sources S3 sont conservées en mode HTTP. Définir une rétention adaptée après succès et laisser assez de temps pour les retries/redrives. Le worker ne supprime pas une source avant que le résultat soit confirmé.
- La finalisation multipart enregistre la vidéo `pending`, le master HLS et son job dans une même transaction PostgreSQL. La publication intervient après commit. La session reste `uploaded` tant que l'envoi n'est pas confirmé, puis passe à `queued`. La maintenance multipart existante reprend toutes les 5 secondes jusqu'à 10 publications en attente avec le même jobId, y compris après redémarrage ; les sources et métadonnées restent conservées. Les verrous de session sérialisent les publications entre réplicas. Un arrêt après l'envoi mais avant `queued` peut provoquer un doublon, pris en charge par les verrous/checkpoints du worker. Aucune table d'outbox supplémentaire n'est ajoutée.
- Les vidéos multipart déjà finalisées avant cette évolution gardent leur clé source et leur statut ; la maintenance ignore les sessions sans job FFmpeg. `POST /api/videos` reste fermé (410), tous les nouveaux uploads passent par `/api/video-uploads`.
- Si S3 est finalisé mais que la transaction métier échoue, le statut expose les parties vérifiées en restant `uploading`, afin que le navigateur réessaie `/complete` et enregistre bien métadonnées et job.

Les conversions doivent rester sous la limite HTTP et sous le disque disponible. Pour des vidéos qui dépassent ces bornes, prévoir un traitement par Serverless Jobs dans l'infrastructure ; ce mode n'est pas implémenté ici.

## Développement et vérification

Le Docker Compose local expose uniquement le serveur HTTP, sans trigger cloud. L'image de staging démarre `node dist/http-worker.js` par défaut. L'API Whisper reste une image distincte.

Tests sans cloud (FFmpeg et FFprobe doivent être installés) :

```bash
cd ffmpegServer
npm ci
npm run build
npm test
```

Dans le backend :

```bash
cd backend
npm ci
npm run build
npm run test:unit -- --runInBand
```

Le test PostgreSQL utilise `TRANSCODING_TEST_DATABASE_URL` vers une **base vide réservée aux tests**. Il vérifie la migration et deux acquisitions concurrentes. Le workflow CI fournit sa propre base éphémère ; en local, ce test est ignoré si la variable n'est pas définie.

Pour tester le worker HTTP manuellement, lancer `npm run dev:http` avec sa configuration, puis `curl http://localhost:8080/health`. Un vrai job doit d'abord être enregistré par le backend et signé comme décrit ci-dessus ; un JSON arbitraire non signé est rejeté. Le test `serverless.test.ts` illustre la création du message.

Recette locale du multipart jusqu'aux rendus HLS (PostgreSQL, MinIO, queue, serveur HTTP et callbacks réels) :

```bash
# À la racine du dépôt ; ports locaux dédiés 25432, 29000, 29324.
docker compose -f dev-tools/docker-compose.upload-test.yml -p ochocast-upload-test up -d --wait
npm ci --prefix backend
npm ci --prefix ffmpegServer
npm run build --prefix ffmpegServer
cd backend
NODE_OPTIONS=--experimental-vm-modules \
UPLOAD_TEST_DATABASE_URL=postgresql://postgres:uploadtest@127.0.0.1:25432/upload_test \
UPLOAD_TEST_QUEUE_URL=http://127.0.0.1:29324/000000000000/ochocast-local-ffmpeg \
npm run test:unit -- --runInBand tests/videos/uploads/uploads.integration.spec.ts
cd ..
docker compose -f dev-tools/docker-compose.upload-test.yml -p ochocast-upload-test down -v
```

Ces identifiants sont factices et les ports sont limités au loopback. La recette efface la base `upload_test` fournie : réserver cette base aux tests. Sans `UPLOAD_TEST_DATABASE_URL`, les tests d'intégration sont ignorés ; sans `UPLOAD_TEST_QUEUE_URL`, seule la recette avec FFmpeg est ignorée. FFmpeg/FFprobe doivent être installés. Le workflow exécute cette recette et les cas de reprise/limites/nettoyage avant le build de l'image.

En staging, valider un upload complet, la lecture HLS depuis le frontend, un message dupliqué, une panne temporaire du callback et le redrive après épuisement des retries.

## CI et image

Configurer la variable GitHub `FFMPEG_IMAGE_REPOSITORY` avec le chemin complet du registre, par exemple `rg.fr-par.scw.cloud/<namespace>/ochocast-ffmpeg-worker`, et les secrets existants `SCW_REG_USER` / `SCW_SECRET_KEY`.
Les PR exécutent les tests et construisent l'image sans la publier. Un push sur `main`, ou un lancement manuel avec `publish=true`, publie `sha-<commit-complet>` et affiche le digest dans le résumé du workflow. Un lancement manuel sans publication permet de vérifier le build.
Ops déploie ce digest en staging. Le nom d'image et les fichiers d'infrastructure ne sont pas devinés par le workflow Ochocast.

Références : [trigger Scaleway Queues](https://www.scaleway.com/en/docs/serverless-containers/how-to/add-trigger-to-a-container/), [API Queues](https://www.scaleway.com/en/docs/queues/api-cli/python-node-queues/), [limites HTTP](https://www.scaleway.com/en/docs/serverless-containers/reference-content/containers-limitations/), [stockage temporaire et RAM](https://www.scaleway.com/en/docs/serverless-containers/troubleshooting/container-oom/).
