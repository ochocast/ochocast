# Sous-titres automatiques

La première version en staging cible les nouvelles vidéos qui passent par le
worker FFmpeg et pour lesquelles il extrait un fichier audio, y compris celles
trop longues pour être transcodées et lues depuis leur source. Les vidéos publiées
sans worker FFmpeg (transcodage désactivé) et les anciennes vidéos sans audio
extrait ne sont pas prises en charge automatiquement dans ce périmètre.

La partie applicative est regroupée sur `feat/transcription-sous-titres`, avec
la version actuelle de main intégrée. La partie infrastructure est regroupée
sur `feat/ffmpeg-serverless` dans ops-architecture-lab. Une PR par dépôt suffit.

FFmpeg produit un FLAC mono 16 kHz et le callback enregistre `audio_key`,
`has_audio` et l'état de transcription. Le backend sélectionne les vidéos prêtes,
non archivées et sans sous-titres. Par défaut, à 2 h Europe/Paris, il traite au
plus 20 vidéos, démarre Whisper, attend `/health`, génère le WebVTT dans S3 puis
arrête la VM. Le verrou PostgreSQL empêche deux réplicas de traiter le même lot.
Un CronJob indépendant peut utiliser `dist/transcription/recover-worker.js` pour
arrêter une VM orpheline si le backend n'est plus disponible, avec ce même verrou.
Les sous-titres fournis manuellement restent prioritaires.

`TRANSCRIPTION_ENABLED=false` par défaut. Les statuts incluent `waiting_audio`,
`pending`, `processing`, `ready`, `failed`, `no_audio` et `no_speech`.
Chaque échec compte parmi les trois tentatives de la vidéo concernée : elle
redevient `pending`, éligible une heure plus tard et reprise au prochain
lancement (le lendemain avec le cron par défaut), puis `failed`, définitif, une
fois ses tentatives épuisées. Une vidéo interrompue par un déploiement suit la
même règle ; après un crash, elle est reprise dès le lancement suivant. Après un
audio trop volumineux (413), introuvable (422) ou illisible (500), le lot
continue. Un refus qui toucherait toutes les vidéos (requête invalide,
authentification, hôte audio non autorisé, worker occupé, en échec ou
injoignable, téléchargement interrompu) ou un dépassement de
`TRANSCRIPTION_TIMEOUT_MS` arrête le lot : une seule tentative est consommée par
lancement. Les vidéos jamais essayées passent avant les reprises. Si
`TRANSCRIPT_MAX_AUDIO_BYTES` n'est pas un entier positif, le worker ne charge
pas son modèle et son `/health` répond 500 avec la cause : le lot échoue aussitôt
sans consommer de tentative.

## Validation locale

Depuis `backend`, `npm run test:transcription` exécute les tests unitaires et les
tests HTTP du callback. Les tests d'intégration restent ignorés tant que
`TRANSCRIPTION_TEST_DATABASE_URL` n'est pas défini.

Pour vérifier avec PostgreSQL, S3 compatible et Whisper réels, depuis la racine :

```sh
docker compose -f dev-tools/transcription-tests/docker-compose.yml up --build -d
```

Le stockage MinIO de test est construit depuis la révision source figée dans
`dev-tools/localMinio/Dockerfile.test`, comme les tests multipart de main.
L'ancien tag public MinIO n'est plus téléchargeable. Le premier build peut donc
prendre quelques minutes.

Attendre que `http://127.0.0.1:28082/health` réponde 200 (le modèle est téléchargé
au premier démarrage), puis depuis `backend` avec FFmpeg installé :

```sh
TRANSCRIPTION_TEST_DATABASE_URL=postgresql://transcription:transcription@127.0.0.1:25439/transcription_test npm run test:transcription
```

Les cas d'intégration couvrent parole française, absence de piste audio,
silence, préservation des sous-titres manuels et récupération d'une VM
orpheline sans interrompre un lot actif. Ils utilisent un schéma et un
bucket dédiés ; aucune VM Scaleway n'est démarrée.

Les tests navigateur sont dans `e2e/tests/subtitles.spec.ts` : SRT, VTT et cas
automatique activé avec `E2E_AUTOMATIC_SUBTITLES=1`. Le dernier nécessite une
application locale configurée avec un cron court et les services de transcription.

## Images et staging

Le workflow `.github/workflows/transcription.yml` construit les variantes CPU et
GPU. Le contexte Docker est `ffmpegServer`, le fichier `Dockerfile.transcript`.
L4 utilise la cible `gpu` et une image système avec pilote NVIDIA et Container
Toolkit ; PRO2-S utilise `cpu`. Le modèle est chargé une fois par démarrage.

La migration `1791540000000-AddAutomaticTranscription` est exécutée par le
démarrage de l'image backend. Déployer backend, frontend et FFmpeg compatibles
avant d'activer le cron. La procédure de staging, les secrets et le réseau sont
décrits dans `ops-architecture-lab/docs/runbooks/transcription-staging.md`.

Pour les vidéos historiques, `npm run transcription:backfill` est en lecture
seule. Avec `-- --enqueue`, il réutilise le FLAC existant (ou un ancien WAV)
sous la limite de téléchargement du worker (`TRANSCRIPT_MAX_AUDIO_BYTES`,
512 MiB par défaut : un ancien WAV la dépasse vers 50 min, il est alors signalé
et laissé tel quel). Les vidéos dont seule la source
est conservée sont signalées et laissées en ligne : leur traitement nécessite
un futur worker audio-only. Sans audio extrait ni source, un nouvel upload est
nécessaire.
Les scripts TypeScript de `backend/scripts` s'exécutent depuis un checkout avec
les dépendances de développement et un `.env` ciblant explicitement staging ;
ils ne sont pas inclus dans l'image backend de production.

## Regroupement vérifié le 23 octobre 2026

La branche `feat/transcription-sous-titres` contient main et cette implémentation,
sans réintroduire l'ancien worker de queue ni l'ancien prototype de transcription.

- Backend : vérification TypeScript et 310 tests réussis ; 30 tests dépendant de
  services externes sont ignorés dans cette passe générale.
- FFmpeg : build et 19 tests réussis.
- Frontend : TypeScript, lint sans erreur et compilation de production réussis.
- Recette ciblée : 25 tests réussis, dont les quatre scénarios avec PostgreSQL,
  S3 compatible et Whisper réels. Le premier téléchargement du modèle est attendu
  avant les scénarios ; les vidéos de test sont isolées entre chaque cas.

L'inférence réelle sur une L4, le contrôle de la VM Scaleway et l'affichage dans
le navigateur staging restent à valider lors du déploiement. Les contrôles VM
sont simulés dans la recette locale. La transcription est désactivée par défaut.
