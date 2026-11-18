# Montage vidéo : passation

État au 18 novembre 2026. Ce document résume ce qui est fait, ce qui a été décidé et ce qui reste à faire pour reprendre le montage vidéo d'OchoCast.

## Branches

| Branche | Base | Contenu |
|---------|------|---------|
| `feat/video-editing-foundation` | `main` | Modèle de données, règles, API du montage (6 commits) |
| `feat/video-edit-render` | `feat/video-editing-foundation` | Rendu FFmpeg, lecture de la version montée, CI, environnement local, documentation, maquette (15 commits, 21 depuis `main`) |

Les deux branches sont poussées sur `origin`. Aucune pull request n'est ouverte et rien n'est fusionné. Le push d'une branche ne lance aucun workflow : `ffmpeg-serverless.yml`, qui couvre ce code, tourne à l'ouverture d'une PR vers `main`.

`main` a avancé depuis le départ des branches (4 commits). Un seul conflit, trivial : `backend/src/app.module.ts`, où `main` ajoute `SearchModule` et la branche `VideoEditsModule` au même endroit. Il faut garder les deux. La migration `1794470400000-AddContentSearch` de `main` est postérieure aux nôtres et ne touche pas les mêmes tables.

## Documentation de référence

- `docs/docs/documentation/utilisation/04-montage-video.md` : principe, règles, modèle de données, API, erreurs, rendu, reprise sur erreur, tests.
- `ffmpegServer/SERVERLESS.md`, section « Rendu des montages » : fonctionnement du worker, liste de ce qu'il faut créer dans ops-architecture-lab, variables, dimensionnement, environnement local.
- `backend/.env.example` et `ffmpegServer/.env.example` : variables du rendu.
- `docs/montage-video/maquette/` : maquette HTML (à ouvrir dans un navigateur) et captures des 4 écrans.

## État d'avancement

Terminé, testé et documenté :

- **Socle** : tables `video_edit`, `video_edit_segment`, `video_edit_text_layer` (migration `1793638092000-CreateVideoEdits`). API sous `/api/videos/:videoId/edit` : `POST` (créer), `GET` (lire), `PUT` (tout enregistrer et lancer le rendu), `GET render-status`, `POST revert`.
- **Rendu FFmpeg** : table `video_edit_render_job` et colonne `rendered_duration` (migration `1793891216000-AddVideoEditRenderJobs`). File dédiée, mode `render` de l'image FFmpeg (`FFMPEG_WORKER_MODE=render`), police DejaVu dans l'image, sortie HLS 360p, 480p et 720p dans `<videoId>/edits/<jobId>/`.
- **Lecture** : `GET /api/videos/media/:id` renvoie la version montée quand elle est prête. `GET /api/videos` ajoute `edited` et `renderedDuration` à chaque vidéo.
- **Plafond** de 45 minutes de vidéo montée (`VIDEO_EDIT_MAX_DURATION_SECONDS=2700`).
- **Nettoyage** : les fichiers d'un rendu que plus personne ne lit sont supprimés 24 h après la fin du job. La suppression définitive d'une vidéo par un admin supprime aussi ses rendus.
- **Test de bout en bout en local** réussi : montage de 3 passages avec 2 textes rendu en 36 s, lecture de la version montée, retour à l'original (l'ancienne adresse répond `404`), échec volontaire sur original absent (`failed`, `invalid_source`, une seule tentative), puis nouveau rendu réussi après restauration de l'original.

Interface ajoutée sur `feat/video-edit-ui` (voir mise à jour ci-dessous). Déploiement non effectué.

## Décisions produit

- **Un seul montage par vidéo.** Le montage est non destructif : l'original n'est jamais modifié et on peut toujours revenir à l'original.
- **Édition côté client, enregistrement global.** Tout s'édite dans l'interface, puis un seul `PUT` enregistre tout le montage en une transaction, avec un numéro de version (verrou optimiste : `409` si quelqu'un a modifié le montage entre-temps), et déclenche le rendu. Pas de brouillon enregistré. Pas d'annulation d'un traitement en cours dans cette version.
- **Textes.** Un texte est rattaché à un passage et le suit quand on déplace le passage. Position : `top`, `center` ou `bottom`. Couleur : `white`, `black` ou `green`. Pas de taille ni de fond. 3 lignes de 40 caractères au maximum.
- **Limites.** 100 passages, 10 textes par passage, vidéo montée de 45 minutes au maximum (provisoire, à mesurer en préproduction). Découpe : 5 s minimum de chaque côté dans l'interface, 1 s minimum côté serveur.
- **Droits.** Le créateur de la vidéo et les admins. Refus en `403`.
- **Spectateurs.** Ils voient la version montée une fois prête, et gardent la précédente (ou l'original) pendant un nouveau rendu. Les sous-titres sont masqués sur la version montée ; le recalage sur la version montée est à faire plus tard.
- **Vidéos sans original.** Les anciennes vidéos dont le fichier original n'a pas été conservé ne sont pas montables (`409`). Le nombre de vidéos concernées n'est pas encore connu en production.

## Points ouverts

1. **Interface** : à construire d'après la maquette. L'API est prête. Elle doit appliquer la règle des 5 s, que le serveur ne vérifie pas (il impose 1 s).
2. **Déploiement dans ops-architecture-lab** (équipe infra) : file de rendu et sa file d'échec, clés, conteneur en mode `render`, déclencheur, autoscaling, alertes. La liste précise est dans `ffmpegServer/SERVERLESS.md`, section « À créer dans ops-architecture-lab ». Le backend et sa migration doivent être déployés avant que des messages arrivent dans la file.
3. **Mesure en préproduction** : vérifier que deux encodages d'une vidéo montée de 45 minutes tiennent dans le délai du worker (55 minutes), puis confirmer ou baisser `VIDEO_EDIT_MAX_DURATION_SECONDS`.
4. **Réglages infra à trancher** : nombre maximal de conteneurs de rendu (2 proposés en préproduction pour commencer), nombre de relivraisons avant la file d'échec (aligné pour l'instant sur la fusion), clés dédiées à la file de rendu ou réutilisation de `TRANSCODING_QUEUE_*`.
5. **Vidéos sans original** : compter les vidéos concernées en production avec la requête SQL de la doc (section « Vidéos sans original »), puis décider s'il faut prévenir les créateurs.
6. **Sous-titres** : spécifier puis faire le recalage sur la version montée.
7. **Revue et fusion** : ouvrir les PR (la fondation vers `main`, puis le rendu), résoudre le conflit de `app.module.ts`.

## Pièges connus

- **Le statut `draft` n'est pas un brouillon.** C'est l'état d'un montage tout juste créé (toute la vidéo, sans texte) ou remis à zéro par un retour à l'original. Rien n'est enregistré entre deux `PUT`.
- **Vidéo de plus de 45 minutes** : `POST` crée un montage qui couvre toute la vidéo, donc au-delà du plafond. L'interface doit le faire raccourcir avant le premier `PUT`, sinon `400`.
- **Identifiants instables** : chaque `PUT` remplace tous les passages et textes, avec de nouveaux identifiants. L'interface ne doit pas s'y fier d'un enregistrement à l'autre.
- **`409` a plusieurs sens** : montage déjà créé, vidéo pas encore prête, vidéo sans original, version périmée, rendu en cours. Le `message` de la réponse les distingue.
- **`503` au `PUT`** : sans `VIDEO_EDIT_RENDER_QUEUE_URL`, le rendu est désactivé et rien n'est enregistré.
- **Port 8084 occupé** : le worker de rendu local écoute par défaut sur 8084, qui peut être pris par un autre logiciel. Voir `ffmpegServer/SERVERLESS.md` : changer le port dans `docker-compose.yml` et `LOCAL_RENDER_BRIDGE_WORKER_URL`.
- **Base locale** : avec `NODE_ENV=development`, TypeORM crée les tables à partir des entités (`synchronize`), sans les contraintes `CHECK` des migrations. Les tests PostgreSQL (voir plus bas) passent, eux, par les vraies migrations. La chaîne complète des migrations échoue sur une base vide (`chat_messages`), problème antérieur au montage. Ne pas lancer `migration:run` sur la base locale existante sans vérifier son schéma (voir `dev-tools/LOCAL_FFMPEG_QUEUE.md`).
- **Comptes Keycloak locaux** : les mots de passe des utilisateurs de `dev-tools/localKeycloak/config/realm-export.json` peuvent ne pas fonctionner. Créer un utilisateur de test dans `local-realm` depuis la console d'administration (`http://localhost:8080`) et le supprimer après.
- **Disque plein** : MinIO répond `507` quand le disque du Mac est plein. Le build de l'image FFmpeg et le cache Docker prennent beaucoup de place ; libérer de l'espace avant le test.
- **Tests qui échouent sans rapport avec le montage** : `src/transcription/transcription.spec.ts` (module `undici` absent), les tests FFmpeg du worker sans FFmpeg installé (`spawn ffmpeg ENOENT`), et un test de débit d'envoi HLS (`hls-upload.test.ts`) instable sur une machine chargée.

## Lancer les tests

Sans Docker :

```bash
cd backend && npx tsc --noEmit -p tsconfig.json && npx jest tests/video-edits
cd ffmpegServer && npx tsc --noEmit && npm test
```

Les tests du worker qui encodent vraiment demandent FFmpeg et la police DejaVu (`apt install ffmpeg fonts-dejavu-core`, ou dans l'image Docker). Les tests PostgreSQL du montage demandent une base dédiée : voir la section « Tests » de `04-montage-video.md`. En CI, le job `backend-contract` leur donne leur propre base (`VIDEO_EDIT_TEST_DATABASE_URL`).

## Environnement local

Prérequis : Docker démarré, une dizaine de Go libres, `backend/.env` et `ffmpegServer/.env` remplis d'après les `.env.example` (mêmes `TRANSCODING_DISPATCH_SECRET` et `TRANSCODING_CALLBACK_SECRET` des deux côtés).

1. Services (Keycloak, MinIO, PostgreSQL, ElasticMQ avec les files `ochocast-local-ffmpeg` et `ochocast-local-render`) :
   ```bash
   cd dev-tools && docker compose up -d
   ```
2. Workers FFmpeg (transcodage sur 8081, rendu sur 8084) :
   ```bash
   cd ffmpegServer && docker compose up --build -d
   curl http://localhost:8081/health && curl http://localhost:8084/health
   ```
3. Backend, avec le provider `local` et la file de rendu dans `backend/.env` :
   ```dotenv
   TRANSCODING_QUEUE_PROVIDER=local
   VIDEO_EDIT_RENDER_QUEUE_URL=http://127.0.0.1:9324/000000000000/ochocast-local-render
   # Seulement si le worker de rendu n'est pas sur 8084 :
   # LOCAL_RENDER_BRIDGE_WORKER_URL=http://127.0.0.1:8085/
   ```
   ```bash
   cd backend && npm run start:dev
   ```
4. Frontend, si besoin : `cd frontend && npm start`.

Le détail de la file locale (transcodage) est dans `dev-tools/LOCAL_FFMPEG_QUEUE.md`.

## Test de bout en bout

Avec l'environnement local lancé et un jeton Keycloak d'un utilisateur créateur de la vidéo (`Authorization: Bearer …`). Toutes les routes sont préfixées par `http://localhost:3001/api`.

1. **Vidéo** : publier une vidéo de 20 à 30 s depuis l'interface. Attendre `transcoding_status: "ready"` dans `GET /videos?id=<videoId>`.
2. **Montage** : `POST /videos/<videoId>/edit` (statut `draft`, `version: 1`).
3. **Rendu** : `PUT /videos/<videoId>/edit` avec `version: 1` et 2 ou 3 passages dans le désordre, dont certains avec un texte (exemple de corps dans `04-montage-video.md`). Suivre `GET /videos/<videoId>/edit/render-status` : `pending`, `processing`, puis `ready`.
4. **Lecture** : `GET /videos?id=<videoId>` renvoie `edited: true` et `renderedDuration` proche de la somme des passages (à quelques centièmes de seconde près). `GET /videos/media/<videoId>` renvoie une adresse `.../e-<jobId>/master.m3u8` lisible ; vérifier dans le lecteur l'ordre des passages et les textes. `GET /videos/subtitle/<videoId>` renvoie `null`.
5. **Retour à l'original** : `POST /videos/<videoId>/edit/revert`. `edited` repasse à `false`, l'original est servi, et l'ancienne adresse `e-<jobId>` répond `404`.
6. **Échec volontaire** : dans MinIO (bucket `media`), déplacer l'original `<videoId>/source/original.*` hors de son chemin, puis faire un `PUT`. Le rendu passe `failed` dès la première tentative, avec l'erreur `invalid_source`.
7. **Reprise** : remettre l'original en place et refaire un `PUT` avec la version renvoyée par `GET /videos/<videoId>/edit`. Le rendu repasse `ready`.
8. **Nettoyage** : supprimer la vidéo de test, ses objets MinIO (`<videoId>/`) et l'utilisateur Keycloak de test, puis arrêter les conteneurs.

## Reprise interface : lecture de l’original

La route protégée `GET /api/videos/:videoId/edit/source` permet au créateur et aux administrateurs de lire l’original même après un rendu, sans exiger de montage existant. L’éditeur doit l’utiliser plutôt que la route de lecture des spectateurs.

**Décision produit à valider avec le client, hors de cette implémentation :** pour une vidéo HLS, l’original reste publiquement lisible par son chemin même lorsqu’un montage est actif. Un créateur qui coupe un passage sensible peut croire que ce passage est caché. La nouvelle route ne change pas cette accessibilité.

## Interface livrée sur feat/video-edit-ui

- Découpage : `VideoEditPage` (chargement, enregistrement, suivi), `EditPreview`, `SegmentTimeline`, `TextLayerEditor`, `RevertVideoButton` ; fonctions pures dans `editorState.ts`.
- État local : version du serveur, passages avec clés temporaires, textes imbriqués, position de lecture et sélection. Aucun brouillon enregistré ; un seul PUT global.
- Intégration : route protégée du frontend, accès depuis la page vidéo, droits créateur/admin, badge et durée montée dans les vignettes, confirmation du retour à l’original, sous-titres masqués sur la version montée.
- Règle confirmée pendant la reprise : un texte traversant une coupe est conservé sur chaque nouveau passage avec ses temps ajustés ; les moitiés de moins de 0,5 s sont supprimées, 0,5 s exactement est conservé. Une coupe dépassant 10 textes sur un passage est refusée avec un message explicite avant l’envoi.
- Maquette : suppression du bouton d’annulation du traitement conformément à la règle explicite de cette version ; lecture réelle, déplacements effectifs et commandes au clavier remplacent la simulation HTML.
- Vérification : TypeScript, tests frontend ciblés et build de production ; contrôle visuel desktop/mobile avec API simulée et vidéo synthétique, lecture continue, transition entre passages, glisser-déposer et réordonnancement au clavier. La recette réelle complète frontend → backend → file → worker reste à exécuter sur un environnement lancé et configuré.
- Environnement : utiliser le Node 22 déjà installé via nvm si le Node Homebrew échoue sur `libsimdjson.30.dylib`. Le build est validé avec le plugin ESLint désactivé : le cache de `node_modules` est hors du périmètre d’écriture et la commande ESLint autonome rencontre une incompatibilité de plugin existante. Aucune dépendance n’a été ajoutée.
- Reste : pré-découpage à valider avant code, infrastructure, recette en préproduction et mesure des deux encodages de 45 minutes. Voir `PREDECOUPAGE.md` et `MESSAGE-OPS.md`.

### Détail du problème ESLint local (18 novembre 2026)

Le build standard échoue à écrire `frontend/node_modules/.cache/.eslintcache` (`EPERM`, dépendances locales liées hors du périmètre d’écriture). Le lancement autonome d’ESLint depuis la racine rencontre ensuite `@typescript-eslint/no-unused-expressions: Cannot read properties of undefined (reading allowShortCircuit)` avec les versions installées. Depuis `frontend/`, la configuration racine résout aussi incorrectement `frontend/frontend/tsconfig.json`.

Contournement de vérification utilisé : Node 22 via nvm, `npx tsc --noEmit`, tests ciblés, puis `CI=true DISABLE_ESLINT_PLUGIN=true npm run build`. Il valide compilation et build, **pas ESLint**. Aucun paquet ni fichier de dépendances n’a été modifié pour contourner ces problèmes.

## Recette UI avec worker réel (18 novembre 2026)

Recette complète effectuée sur le build réel du frontend avec Keycloak, PostgreSQL, MinIO, ElasticMQ et les workers FFmpeg de cette branche : trois passages réordonnés, texte coupé en deux, rendu `ready` en 21,079 s, lecture HLS et textes vérifiés, retour à l’original, puis échec volontaire `invalid_source` en une tentative. Source originale conservée et métadonnées de test restaurées. Voir [le compte rendu détaillé](RECETTE-LOCALE-2026-11-18.md).

Une correction UI ajoute un chargeur compact : le statut ne doit pas être repoussé sous le premier écran par un chargeur de 100vh. Vérifié sur un nouveau rendu réel après l’échec volontaire, avec suivi `pending → processing → ready`, puis nouveau retour à l’original. TypeScript, 31 tests frontend ciblés et build réussis (limite ESLint inchangée). Le pré-découpage n’est pas encore codé ; son exécution, l’attente pour 45 minutes et le stockage proposé sont décrits dans [PREDECOUPAGE.md](PREDECOUPAGE.md). La condition d’essais sur de vrais lives reste ouverte tant que le corpus n’est pas fourni.

Les données de recette, initialement conservées pour revue, ont ensuite été nettoyées après autorisation (voir la mise à jour ci-dessous). Le `.env` existant est inchangé : pour cette recette, **provider, endpoint, URL de file et clés** ont tous été remplacés par les valeurs locales dans le processus backend.

## Nettoyage et révision du pré-découpage

Après autorisation explicite et présentation de l’inventaire, les données dédiées à la recette ont été nettoyées : vidéo et lignes associées, utilisateur PostgreSQL/Keycloak, 102 objets MinIO et traces temporaires. Les autres vidéos/comptes et le fichier source de Downloads sont conservés. Le compte rendu de recette reste dans le dépôt.

La proposition initiale de file d’analyse séparée est remplacée par la recommandation **job d’analyse typé dans la file et le déploiement de rendu existants**, sans nouvelle ressource ops. `PREDECOUPAGE.md` compare ce choix au pré-calcul à l’upload (utile pour les futurs uploads mais insuffisant pour le stock) et à une isolation dédiée (non retenue tant que les mesures de charge ne l’imposent pas). PostgreSQL et l’attente avec progression restent validés. Aucun code de pré-découpage ajouté ; les vrais lives de validation seront fournis plus tard et resteront hors dépôt.
