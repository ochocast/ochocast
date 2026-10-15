# FFmpeg déclenché par Scaleway Queues

Le chemin staging est `backend → Scaleway Queue → trigger HTTP → FFmpeg → S3 + callback backend`.
L'image FFmpeg démarre un serveur HTTP, sans polling. Une requête traite une vidéo.
La plateforme peut réduire à zéro le nombre d'instances inactives. Le serveur ne quitte pas le processus après chaque réponse : Scaleway gère son cycle de vie.

## Code et responsabilités

- `backend/src/videos/uploads/` : multipart direct S3, vidéo HLS en attente et job enregistrés ensemble ; reprise des publications après commit.
- `backend/src/queue/queue.service.ts` : choix du fournisseur (ou mode désactivé) et publication d'un message signé dans Scaleway Queues.
- `backend/src/queue/transcoding-plan.ts` : clés S3 et statut d'une nouvelle vidéo, avec ou sans transcodage.
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

Le backend publie uniquement vers Scaleway Queues (ou ElasticMQ avec `local` en développement). Une configuration de queue incomplète empêche le démarrage ; sans fournisseur, le transcodage est désactivé (voir ci-dessous).
Les credentials Queues sont distincts des credentials Object Storage.
Le client HTTP Scaleway publie un JSON `{ "job": VideoTranscodingJob, "signature": "..." }`.
Scaleway Queues expose le protocole SQS ; le code signe donc directement la requête HTTP avec les clés Scaleway, sans installer de SDK AWS.
La signature est un HMAC SHA-256 hexadécimal de `JSON.stringify(job)` avec `TRANSCODING_DISPATCH_SECRET`.
Le trigger doit transmettre le corps du message brut au container, sans format d'événement d'un autre fournisseur.
La queue Scaleway utilisée est une queue standard, sans priorité de message.

### Transcodage désactivé

`TRANSCODING_QUEUE_PROVIDER` est lu une fois au démarrage. Valeurs exactes, en minuscules, sans espaces :

| Valeur | Effet |
| --- | --- |
| absente ou vide | Désactivé, **sauf** si `TRANSCODING_QUEUE_URL`, `TRANSCODING_QUEUE_ENDPOINT`, `TRANSCODING_QUEUE_REGION`, `TRANSCODING_QUEUE_ACCESS_KEY`, `TRANSCODING_QUEUE_SECRET_KEY` ou `TRANSCODING_DISPATCH_SECRET` est renseignée : le démarrage échoue (`must be scaleway, local or disabled`). Un Secret staging qui perd sa clé de fournisseur ne coupe donc pas FFmpeg silencieusement. |
| `disabled` | Désactivé explicitement. Les autres variables de queue sont ignorées et listées dans l'unique WARN de démarrage. |
| `scaleway` | Activé, avec les contrôles ci-dessus : variables obligatoires, secrets d'au moins 32 caractères, endpoint HTTPS. |
| `local` | Activé avec ElasticMQ ; exige en plus `NODE_ENV=development`. |
| autre (`Scaleway`, `none`, `false`…) | Le démarrage échoue. |

Un environnement sans aucune variable `TRANSCODING_*` démarre donc en mode désactivé. Un environnement qui transcode doit garder `TRANSCODING_QUEUE_PROVIDER=scaleway` explicite.

En mode désactivé :

- le backend démarre sans aucune variable `TRANSCODING_*` et l'indique par un WARN ;
- un upload finalisé est lu depuis sa source (`<id>/source/original.<ext>`, URL présignée) : statut `ready` immédiat, aucun job ni message de queue. Les sous-titres normalisés sont écrits directement à leur clé finale `subtitle-<id>.vtt`. La miniature fournie est réencodée par le backend comme le ferait le worker (JPEG 1280x720) puis écrite à `miniature-<id>.jpg` ; un fichier qui n'est pas une image est ignoré (vidéo sans miniature). Il n'y a ni HLS, ni miniature générée, ni durée, et la lecture dépend des codecs supportés par le navigateur ;
- seuls les conteneurs lisibles tels quels par les navigateurs (`mp4`, `webm`, `mov`, `m4v`) sont publiés, car la source est servie telle quelle ; `mkv`, `avi` et `ogg` sont refusés. L'extension est vérifiée à la création de l'upload et de nouveau à sa finalisation (une session ouverte quand le transcodage était actif reçoit `400 Unsupported video format`). La source est stockée et servie avec le type MIME de son extension, jamais celui envoyé par le client ;
- la publication d'un enregistrement (`POST /api/recordings/publish`) applique les mêmes règles : extension vérifiée avant tout stockage, type MIME déduit de l'extension, aucun job. Cette route n'exige qu'un utilisateur authentifié ;
- le proxy public `/api/videos/media-content` ne sert que les vidéos HLS (`media_id` terminé par `/master.m3u8`), jamais une source ;
- la maintenance expire toujours les sessions abandonnées, mais ne publie plus rien.

Ces vidéos n'ont pas de job : si le transcodage est réactivé plus tard, elles restent lues depuis leur source et ne sont pas transcodées a posteriori.

**Passage de activé à désactivé (rollback).** Les jobs déjà enregistrés (`pending` ou `processing`) ne sont plus publiés et leurs vidéos restent `pending`. Au démarrage, le backend journalise un WARN avec leur nombre et l'âge du plus ancien. Remédiation :

1. Pendant le drain, conserver `TRANSCODING_CALLBACK_SECRET` (au moins 32 caractères). Ce secret reste accepté sans fournisseur : les workers peuvent encore terminer les jobs déjà en file (sessions `queued`). Sans lui, toutes les routes `/api/internal/transcoding/jobs/*` répondent `401`.
2. Pour les jobs jamais publiés (sessions `uploaded`), réactiver `TRANSCODING_QUEUE_PROVIDER=scaleway` avec sa configuration complète : la maintenance les publie de nouveau.
3. Repasser à `disabled` une fois le WARN de démarrage disparu, ou quand `SELECT count(*) FROM transcoding_job WHERE status IN ('pending', 'processing')` renvoie 0.

Aucun basculement automatique de ces jobs vers `ready` n'est effectué.

## Configuration du container FFmpeg

```dotenv
NODE_ENV=production
PORT=8080
TRANSCODING_BACKEND_URL=https://<backend-de-cet-environnement>/api
TRANSCODING_DISPATCH_SECRET=<même secret dispatch que le backend>
TRANSCODING_CALLBACK_SECRET=<même secret callback que le backend>
TRANSCODING_JOB_TIMEOUT_MS=3000000
TRANSCODING_MAX_SOURCE_BYTES=1073741824
TRANSCODING_MAX_DURATION_SECONDS=1200
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

Les fichiers vidéo et l'audio FLAC sont téléchargés/uploadés en flux. Les pièces jointes sont limitées à 8 MiB pour la miniature et 4 MiB pour les sous-titres ; le message de queue est limité à 64 KiB. Le staging configure une limite source de 1 GiB, identique à `UPLOAD_MAX_BYTES` du backend. Le worker conserve un défaut de 5 GiB si cette variable est absente ; fournir la valeur explicitement et ajuster les deux limites ensemble après mesure du disque, de la RAM et du temps de traitement. Les trois encodages HLS restent parallèles.

`/work/transcoding` doit disposer de suffisamment de disque pour la source, les trois rendus HLS et l'audio FLAC. Ne pas le remplacer par `/tmp` sur le sandbox Scaleway v2 : ce dernier est en RAM. Les fichiers temporaires sont isolés par invocation et nettoyés après traitement.

## Échecs définitifs et vidéos trop longues

Le worker distingue deux catégories d'échec :

| Catégorie | Cas | Résultat envoyé au backend | Réponse au trigger |
| --- | --- | --- | --- |
| Transitoire | S3 ou backend indisponible, arrêt du container (SIGTERM), erreur FFmpeg pendant l'encodage, configuration invalide, binaire absent ; `TRANSCODING_JOB_TIMEOUT_MS` atteint **avant** l'encodage (lecture S3 bloquée, probe lente, upload de la miniature ou des sous-titres) | `success: false` | `503` : le message est rejoué |
| Définitif | `source_too_large` : source au-delà de `TRANSCODING_MAX_SOURCE_BYTES` (ou miniature/sous-titres au-delà de 8/4 MiB) ; `invalid_source` : FFprobe refuse la source, ou elle n'a aucun flux vidéo ; `duration_exceeded` : durée au-delà de `TRANSCODING_MAX_DURATION_SECONDS` ; `deadline_exceeded` : `TRANSCODING_JOB_TIMEOUT_MS` atteint **pendant** l'encodage (miniature et sous-titres finaux déjà écrits) | `success: false`, `permanent: true`, `reason` | `200` une fois le résultat enregistré : pas de rejeu |

Côté backend :

- le callback `result` accepte `permanent` (booléen) et `reason` (64 caractères maximum) ; le job passe `failed` et conserve le résultat ;
- `claim` répond `{ "status": "completed" }` pour un job `failed` définitif : chaque redélivrance est acquittée sans relancer FFmpeg ;
- `claim` refuse aussi un job déjà acquis `TRANSCODING_MAX_ATTEMPTS` fois (10 par défaut) : job et vidéo passent `failed` (`Transcoding abandoned after N attempts`, `reason: max_attempts`) et la réponse est `completed`. Cela borne les exécutions d'un job défectueux, quelle que soit la source des redélivrances (retries du trigger, redrive, réconciliation) ;
- `duration_exceeded` et `deadline_exceeded` déclenchent la **lecture depuis la source** quand son extension est lisible telle quelle (`mp4`, `m4v`, `webm`, `mov`) : `media_id` devient `<id>/source/original.<ext>` (URL présignée, comme en mode désactivé), statut `ready`, `transcoding_error` vidé, durée renseignée si FFprobe la connaît. Le worker écrit la miniature finale (fournie ou extraite de la vidéo) et les sous-titres finaux **avant** l'encodage : ils sont donc déjà en place. Le job reste `failed` définitif et le backend journalise un WARN. Pour une autre extension (`mkv`, `avi`, `ogg`), la vidéo passe `failed` avec un message explicite ;
- `source_too_large` et `invalid_source` marquent la vidéo `failed` avec le message du worker.

Une vidéo lue depuis sa source n'a ni HLS ni qualités multiples ; sa lecture dépend des codecs du navigateur. Le navigateur la lit par plages d'octets depuis une seule URL présignée pendant toute la lecture : `GET /videos/media/:id` la signe donc pour deux fois la durée de la vidéo plus une heure (24 h si la durée est inconnue, comme pour un enregistrement publié sans transcodage ; 7 jours au plus, limite SigV4). La suppression définitive retire tout le préfixe `<id>/` (source, HLS partiel éventuel, audio, checkpoints), la miniature et les sous-titres, comme pour une vidéo transcodée.

Pour rejouer un job définitif après correction : `UPDATE transcoding_job SET status = 'pending', attempts = 0, result = NULL WHERE id = '<jobId>'` (et, pour une vidéo passée en lecture source, remettre `media_id` à `<id>/master.m3u8`) ; la réconciliation le republie une fois `TRANSCODING_REDISPATCH_AFTER_SECONDS` écoulé depuis sa dernière publication.

### Enregistrements live longs

Avec la queue active, `POST /api/recordings/publish` publie directement depuis la source un enregistrement plus lourd que `UPLOAD_MAX_BYTES` (que le worker refuserait) : statut `ready` immédiat, aucun job, comme en mode désactivé (pas de miniature générée). L'extension doit être lisible telle quelle. Les uploads multipart sont déjà refusés au-delà de `UPLOAD_MAX_BYTES` à leur création. Un enregistrement sous cette taille mais plus long que `TRANSCODING_MAX_DURATION_SECONDS` suit le repli ci-dessus. Cette route charge toujours le fichier entier en mémoire du backend (comportement existant).

### Choix de `TRANSCODING_MAX_DURATION_SECONDS` (1200 s par défaut)

Mesure locale du 2026-10-15 (Apple M5 Pro, FFmpeg Homebrew 9.0.2) de la commande exacte du worker (trois rendus en parallèle, `-preset fast`, `-threads 2`) sur des clips synthétiques de 120 s :

| Source (H.264 + AAC) | Temps CPU total | CPU·s par seconde de vidéo |
| --- | --- | --- |
| 1080p30, 8 Mbit/s, image bruitée (pire cas) | 148,9 s | 1,24 |
| 1080p30, 6 Mbit/s, mire nette | 109,0 s | 0,91 |
| 720p30, 2,5 Mbit/s, image bruitée (proche d'un enregistrement live) | 92,2 s | 0,77 |

Extrapolation prudente vers 2 vCPU : un vCPU Scaleway compté **3 fois** plus lent qu'un cœur du Mac (la mesure mêle cœurs performance et efficacité). Pire cas : 1,24 × 3 / 2 ≈ 1,9 s d'encodage par seconde de vidéo. 1200 s de vidéo ≈ 2230 s d'encodage + ~150 s de téléchargement et d'uploads (≤ 1 GiB de source, ~730 segments HLS, FLAC), soit ≈ 2400 s : 80 % du budget de 3000 s. Un enregistrement 720p typique demande ≈ 1,2 s par seconde, soit ≈ 1550 s. Au-delà, ou si le budget est malgré tout dépassé (`deadline_exceeded`), la vidéo est lue depuis sa source. Ne relever la valeur qu'après mesure en staging (écart entre `Starting transcoding job` et `Job completed successfully` dans les logs) ou avec plus de vCPU ; la garder sous ~40 % de `TRANSCODING_JOB_TIMEOUT_MS` sur 2 vCPU.

### Audio extrait

Quand la source a une piste audio, le worker écrit `<id>/audio.flac` (FLAC 16 bits, 44,1 kHz, stéréo, `audio/flac`), destiné à la future génération de sous-titres Whisper. FLAC est sans perte : les échantillons décodés sont identiques bit à bit à l'ancien `<id>/audio.wav` (PCM s16le, ~635 Mo/h), vérifié par `ffmpeg.test.ts` (MD5 du PCM décodé), pour environ la moitié de la taille sur de la parole. Les vidéos traitées avant ce changement gardent leur `audio.wav` ; le consommateur Whisper doit lire `audio.flac` (FFmpeg et Whisper décodent FLAC).

### Ordre de déploiement

1. **Backend d'abord** (Argo). Il accepte les champs `permanent`/`reason`, acquitte les jobs définitifs et applique `TRANSCODING_MAX_ATTEMPTS` dans `claim`. Le worker actuel n'envoie pas ces champs et traite déjà la réponse `completed` : il reste compatible. Les enregistrements au-delà de `UPLOAD_MAX_BYTES` sont publiés depuis leur source dès ce déploiement.
2. **Puis l'image du worker** (digest dans le module Terraform `ffmpeg-serverless`). `TRANSCODING_MAX_DURATION_SECONDS` vaut 1200 s si le module ne la fournit pas.

Si le worker est déployé avant le backend, l'ancien backend refuse les nouveaux champs (`400`, `forbidNonWhitelisted`) : le worker renvoie alors un échec simple, puis acquitte le message. Les échecs définitifs ne sont donc pas rejoués, mais une vidéo trop longue passe `failed` au lieu d'être lue depuis sa source. Le même comportement s'applique après un rollback du backend seul.

## Contrat pour ops-architecture-lab

Pour le staging, prévoir :

1. Queue standard et stratégie de rétention/rejeu, credentials et file d'échec avec alerte.
2. Container depuis l'image FFmpeg validée, port `8080`, probe `GET /health`.
3. Trigger Queues transmettant le message en `POST /`. Pas de consumer à démarrer dans le container.
4. Autoscaling par requêtes, concurrence **1**, minimum **0**, maximum initial **2** en staging, à mesurer.
5. Timeout HTTP de **3300 s**, timeout applicatif de **3000 s**, verrou backend de **3600 s**. Vérifier également le timeout du proxy placé devant le backend et celui du trigger. Régler la visibilité de la queue pour éviter une redélivrance pendant un encodage (3900 s dans le module staging), et sa rétention pour absorber le backlog.
6. Secrets et permissions minimales : publication Scaleway Queues pour le backend, consommation pour le trigger, lecture/écriture Object Storage pour le worker.
7. Logs et alertes sur erreurs, jobs bloqués, âge des messages, saturation disque/RAM et file d'échec.

Une requête ne renvoie `200` qu'après confirmation du résultat en base (ou si le job est déjà terminé/supprimé). Une instance occupée ou un incident transitoire renvoie `503`. Une erreur transitoire est enregistrée comme `failed`, puis le message reste rejouable : une prochaine tentative peut repasser en `pending`, puis `ready`. Un échec définitif (voir « Échecs définitifs et vidéos trop longues ») est enregistré, puis acquitté par `200`.

Callbacks `claim`/`result` : un job supprimé (vidéo supprimée, job en cascade) répond `410 Gone` ; le worker journalise le `jobId` et acquitte le message. Un `404` (route, ingress, version du backend) ou une redirection `3xx` n'est jamais un succès : le worker renvoie `503`, le trigger rejoue puis le message part en file d'échec.

Scaleway documente un nombre limité de retries du trigger ; un `503` ne garantit pas des retries illimités. Vérifier le comportement réel d'épuisement/redrive en staging et prévoir une procédure de rejeu des jobs en échec. La file d'échec et les alertes sont à configurer dans ops, elles ne sont pas créées par le code applicatif.

## Doublons, panne et reprise

- L'acquisition du job utilise un verrou PostgreSQL, donc plusieurs instances ne peuvent pas acquérir simultanément le même job.
- Chaque tentative reçoit un `leaseToken`. Un callback obsolète ne peut pas finaliser une nouvelle tentative.
- Après réussite, les doublons sont acquittés sans refaire FFmpeg. Une erreur tardive ne remplace pas un succès en base.
- Après upload complet, le résultat est conservé dans `<videoId>/_transcoding/<jobId>/result.json`. Si le callback échoue, ce checkpoint permet de réessayer le callback sans réencoder.
- Si le processus est tué ou le backend inaccessible, le verrou expire. Un rejeu doit intervenir après son expiration ; des retries immédiats peuvent être épuisés avant cette date.
- Réconciliation (maintenance toutes les 5 secondes, queue active) : un job encore `pending` `TRANSCODING_REDISPATCH_AFTER_SECONDS` (7200 par défaut) après sa dernière publication, ou encore `processing` 10 minutes après l'expiration de son verrou, est republié avec le même jobId (message perdu, trigger à court de retries, file d'échec). Au-delà de `TRANSCODING_MAX_ATTEMPTS` acquisitions (10 par défaut), le job et sa vidéo passent `failed` (`Transcoding abandoned after N attempts`) ; `claim` applique la même limite à toute redélivrance. Le délai doit dépasser l'attente maximale prévue dans la queue, pas seulement sa visibilité : un message simplement en retard est sinon republié, et son doublon finit en file d'échec.
- Les sources S3 sont conservées en mode HTTP. Le worker ne supprime pas une source avant que le résultat soit confirmé. Ne jamais expirer `<id>/source/original.*` par une règle de cycle de vie : une vidéo lue depuis sa source (transcodage désactivé, vidéo trop longue, échéance dépassée) a ce fichier pour `media_id`. Toute rétention doit être applicative et ne viser que les vidéos dont le `media_id` est le `master.m3u8`.
- La finalisation multipart enregistre la vidéo `pending`, le master HLS et son job dans une même transaction PostgreSQL. La publication intervient après commit. La session reste `uploaded` tant que l'envoi n'est pas confirmé, puis passe à `queued`. La maintenance multipart existante reprend toutes les 5 secondes jusqu'à 10 publications en attente avec le même jobId, y compris après redémarrage ; les sources et métadonnées restent conservées. Les verrous de session sérialisent les publications entre réplicas. Un arrêt après l'envoi mais avant `queued` peut provoquer un doublon, pris en charge par les verrous/checkpoints du worker. Aucune table d'outbox supplémentaire n'est ajoutée.
- Les vidéos multipart déjà finalisées avant cette évolution gardent leur clé source et leur statut ; la maintenance ignore les sessions sans job FFmpeg. `POST /api/videos` reste fermé (410), tous les nouveaux uploads passent par `/api/video-uploads`.
- Si S3 est finalisé mais que la transaction métier échoue, le statut expose les parties vérifiées en restant `uploading`, afin que le navigateur réessaie `/complete` et enregistre bien métadonnées et job.

Les conversions doivent rester sous la limite HTTP et sous le disque disponible. Les vidéos qui dépassent ces bornes sont lues depuis leur source (voir plus haut) ; pour les transcoder malgré tout en HLS, prévoir un traitement par Serverless Jobs dans l'infrastructure ; ce mode n'est pas implémenté ici.

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
docker compose -f dev-tools/docker-compose.upload-test.yml -p ochocast-upload-test up --build -d --wait
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

Ces identifiants sont factices et les ports sont limités au loopback. La recette efface la base `upload_test` fournie : réserver cette base aux tests. Sans `UPLOAD_TEST_DATABASE_URL`, les tests d'intégration sont ignorés, y compris ceux du mode désactivé ; sans `UPLOAD_TEST_QUEUE_URL`, seule la recette avec FFmpeg est ignorée. FFmpeg/FFprobe doivent être installés. Le workflow exécute cette recette et les cas de reprise/limites/nettoyage avant le build de l'image.

En staging, valider un upload complet, la lecture HLS depuis le frontend, un message dupliqué, une panne temporaire du callback et le redrive après épuisement des retries.

## CI et image

Configurer la variable GitHub `FFMPEG_IMAGE_REPOSITORY` avec le chemin complet du registre, par exemple `rg.fr-par.scw.cloud/<namespace>/ochocast-ffmpeg-worker`, et les secrets existants `SCW_REG_USER` / `SCW_SECRET_KEY`.
Les PR exécutent les tests et construisent l'image sans la publier. Un push sur `main`, ou un lancement manuel avec `publish=true`, publie `sha-<commit-complet>` et affiche le digest dans le résumé du workflow. Un lancement manuel sans publication permet de vérifier le build.
Ops déploie ce digest en staging. Le nom d'image et les fichiers d'infrastructure ne sont pas devinés par le workflow Ochocast.

Références : [trigger Scaleway Queues](https://www.scaleway.com/en/docs/serverless-containers/how-to/add-trigger-to-a-container/), [API Queues](https://www.scaleway.com/en/docs/queues/api-cli/python-node-queues/), [limites HTTP](https://www.scaleway.com/en/docs/serverless-containers/reference-content/containers-limitations/), [stockage temporaire et RAM](https://www.scaleway.com/en/docs/serverless-containers/troubleshooting/container-oom/).
