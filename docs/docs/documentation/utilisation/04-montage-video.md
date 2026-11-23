# Montage vidéo

Le créateur d'une vidéo, ou un administrateur, peut la monter : garder certains passages, les réordonner et y ajouter du texte. Le montage est **non destructif** : la vidéo originale n'est jamais modifiée, et on peut toujours y revenir.

:::info État actuel
Le modèle de données, l'API, le rendu FFmpeg et l'interface de montage sont en place. Le pré-découpage par silences est disponible quand il est activé par l’équipe. La maquette de l'interface se trouve dans `docs/montage-video/maquette/`. Sans file de rendu configurée sur l'environnement, l'enregistrement d'un montage (`PUT`) répond `503`.
:::

## Principe

L'interface édite tout le montage localement : couper, supprimer ou déplacer un passage, ajouter un texte. Le bouton « Modifier la vidéo » envoie ensuite l'ensemble en une seule requête. Le backend enregistre le montage puis demande son rendu. Quand le rendu est prêt, les spectateurs voient la version montée.

:::tip Schéma interactif
Copiez le code ci-dessous dans [Mermaid Live Editor](https://mermaid.live) pour visualiser les statuts de rendu :
:::

```mermaid
stateDiagram-v2
    [*] --> draft: POST (montage créé)
    draft --> pending: PUT (enregistrer et rendre)
    failed --> pending: PUT
    ready --> pending: PUT (modifier à nouveau)
    pending --> processing: le worker prend le rendu
    processing --> ready: rendu terminé
    processing --> pending: échec temporaire, nouvelle tentative
    processing --> failed: échec définitif ou tentatives épuisées
    pending --> failed: rendu non publié ou job sans activité
    ready --> draft: POST revert
    failed --> draft: POST revert
    draft --> draft: POST revert
```

Tant qu'un rendu est en cours (`pending` ou `processing`), le montage ne peut pas être modifié : toute modification répond `409`. Entre deux tentatives, le montage repasse `pending` et `render_error` indique l'erreur de la dernière tentative.

## Ce que voient les spectateurs

- Quand un rendu est prêt, les spectateurs lisent la version montée : `GET /api/videos/media/:id` renvoie `/api/videos/media-content/:id/e-<jobId>/master.m3u8`. Chaque rendu a son propre chemin : les playlists sont mises en cache un an, l'original et chaque version montée ne se mélangent donc jamais.
- `GET /api/videos` (dont `GET /api/videos?id=…`, utilisé par la page vidéo) et `GET /api/videos/:userId` ajoutent deux champs à chaque vidéo :

  | Champ | Type | Contenu |
  |-------|------|---------|
  | `edited` | booléen | `true` quand les spectateurs voient une version montée (badge « Modifiée ») |
  | `renderedDuration` | nombre ou `null` | Durée en secondes de ce que voient les spectateurs : celle de la version montée si elle est active, sinon celle de l'original. `duration` reste toujours la durée de l'original |

- Pendant un nouveau rendu, ils gardent la version précédente (ou l'original s'il n'y en a pas) jusqu'à ce que le nouveau rendu soit prêt.
- Après un retour à l'original, ils lisent de nouveau l'original, et l'adresse de l'ancienne version montée répond `404`.
- Les sous-titres suivent la chronologie de l'original : ils sont masqués (`GET /api/videos/subtitle/:id` renvoie `null`) tant que la version montée est affichée, et reviennent avec l'original.
- La vidéo originale n'est jamais modifiée ni supprimée. La version montée est rendue depuis le fichier original conservé à l'upload (`<videoId>/source/original.*`), ou depuis la source quand la vidéo est lue telle quelle.

## Rendu

Le rendu est fait par l'image FFmpeg en mode `render`, derrière sa propre file (voir `ffmpegServer/SERVERLESS.md`, section « Rendu des montages »). Pour chaque rendu :

1. **Découpe** : chaque passage est découpé dans l'ordre de lecture, ramené à 1280×720 à 30 images par seconde, avec ses textes.
2. **Assemblage** : les passages sont mis bout à bout.
3. **Fichier final** : la vidéo montée est encodée en HLS 360p, 480p et 720p, comme une vidéo uploadée, dans `<videoId>/edits/<jobId>/`.

Texte : DejaVu Sans Bold, 40 px sur la base 720p, contour de 3 px (noir, ou blanc pour un texte noir), centré horizontalement. `top` place le texte à 6 % du haut, `center` au milieu, `bottom` à 12 % du bas. Les couleurs sont `#FFFFFF`, `#000000` et `#1DAC78`. Le texte revient à la ligne entre les mots à 40 caractères, sur 3 lignes au plus ; un mot plus long est coupé. Le texte n'est jamais interprété (pas de `%{...}`).

### Reprise sur erreur

| Cas | Effet |
|-----|-------|
| Échec temporaire (S3, réseau, arrêt du worker, erreur FFmpeg) | Le job repasse `pending`, la file relivre le message |
| Original introuvable ou illisible, source trop lourde (`TRANSCODING_MAX_SOURCE_BYTES`), délai du worker dépassé pendant l'encodage | Échec définitif : le montage passe `failed` |
| `VIDEO_EDIT_RENDER_MAX_ATTEMPTS` tentatives (3 par défaut) | Le montage passe `failed` |
| Aucune activité pendant `VIDEO_EDIT_RENDER_STALE_SECONDS` (3 × le bail par défaut), par exemple un message parti en file d'attente des messages morts | Le balayage (toutes les minutes) passe le job et le montage en `failed` |
| Callback de résultat perdu | Le worker a enregistré un point de reprise : la tentative suivante renvoie le résultat sans refaire le rendu |
| Vidéo supprimée pendant le rendu | Le callback répond `410`, le worker supprime les fichiers qu'il a envoyés |

Un montage `failed` est de nouveau modifiable : un nouveau `PUT` relance un rendu.

### Fichiers rendus orphelins

Un rendu terminé (prêt ou en échec) dont la version n'est plus celle que voient les spectateurs est orphelin : il a été remplacé, il a échoué, ou l'utilisateur est revenu à l'original. Ses fichiers (`<videoId>/edits/<jobId>/`) sont supprimés par un balayage horaire, 24 h après la fin du job (`VIDEO_EDIT_RENDER_ORPHAN_GRACE_SECONDS`), pour ne pas interrompre un spectateur en cours de lecture. `files_deleted_at` est alors renseigné. La suppression définitive d'une vidéo par un administrateur supprime aussi tous ses rendus.

## Modèle de données

Toutes les durées sont en secondes.

| Table | Contenu |
|-------|---------|
| `video_edit` | Un montage par vidéo (`videoId` unique, supprimé avec la vidéo) : `render_status`, `render_error`, `rendered_media_id` et `rendered_duration` (version montée que voient les spectateurs), `version` |
| `video_edit_segment` | Un passage de la vidéo source : `source_start`, `source_end` et `position` dans la vidéo montée |
| `video_edit_text_layer` | Un texte affiché sur un passage, qui suit ce passage quand on le déplace : `content`, `position`, `color`, `start_offset` (depuis le début du passage), `duration` |
| `video_edit_render_job` | Un rendu d'une version du montage, sur le modèle de `transcoding_job` : `version`, `payload` (description complète du rendu), `status`, `leaseToken`, `leaseExpiresAt`, `attempts`, `result`, `files_deleted_at` |

### Règles

- La vidéo doit être traitée (`transcoding_status = ready`) et sa durée connue.
- Le fichier original doit être conservé (voir « Vidéos sans original » ci-dessous).
- La vidéo montée dure au plus `VIDEO_EDIT_MAX_DURATION_SECONDS` (2700 s, soit 45 minutes par défaut ; valeur provisoire, à confirmer par une mesure en préproduction) pour tenir dans le délai du worker. Le montage initial d'une vidéo plus longue (la vidéo entière) doit donc être raccourci avant d'être enregistré.
- Un montage compte de 1 à 100 passages. Chaque passage dure au moins 1 s et reste dans la durée de la vidéo.
- Un même passage de la source ne peut apparaître qu'une fois : deux passages ne se chevauchent pas dans la source. Des passages bout à bout sont acceptés.
- Un passage porte au plus 10 textes. Chaque texte compte de 1 à 500 caractères, tient sur 3 lignes de 40 caractères (retour à la ligne entre les mots) et se termine dans son passage. Les textes d'un même passage peuvent se superposer dans le temps.
- Position du texte : `top`, `center` ou `bottom`. Couleur : `white`, `black` ou `green`.

## API

Toutes les routes sont préfixées par `/api`, demandent une authentification Keycloak et sont décrites dans Swagger (`/docs`, tag « Video edits »).

| Méthode | Route | Rôle | Succès |
|---------|-------|------|--------|
| `POST` | `/videos/:videoId/edit` | Crée le montage : un passage couvrant toute la vidéo, sans texte, statut `draft` | `201` |
| `GET` | `/videos/:videoId/edit` | Lit le montage, passages dans l'ordre de lecture | `200` |
| `PUT` | `/videos/:videoId/edit` | Remplace tout le montage et demande son rendu (statut `pending`) | `200` |
| `GET` | `/videos/:videoId/edit/render-status` | Statut de rendu, pour l'écran « Traitement en cours » | `200` |
| `POST` | `/videos/:videoId/edit/revert` | Revient à l'original : les spectateurs le revoient aussitôt, et le montage repart de toute la vidéo, sans texte | `200` |

### Enregistrer un montage

`version` est la version lue avec `GET`. Si quelqu'un a modifié le montage entre-temps, la requête répond `409` : il faut recharger le montage. L'ordre du tableau `segments` est l'ordre de lecture.

```json
PUT /api/videos/ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2/edit
{
  "version": 1,
  "segments": [
    {
      "sourceStart": 120,
      "sourceEnd": 870,
      "textLayers": [
        { "content": "Ouverture", "position": "bottom", "color": "white", "startOffset": 0, "duration": 300 }
      ]
    },
    { "sourceStart": 1270, "sourceEnd": 2205, "textLayers": [] }
  ]
}
```

La réponse contient le montage enregistré, avec `version` incrémentée et les identifiants des passages et des textes. Ces identifiants changent à chaque enregistrement.

### Erreurs

| Code | Cas |
|------|-----|
| `400` | Identifiant mal formé, corps invalide ou règle non respectée. `message` liste toutes les erreurs, par exemple `segments[1] overlaps segments[0] in the source video` |
| `403` | L'utilisateur n'est ni le créateur de la vidéo ni administrateur |
| `404` | Utilisateur, vidéo (archivée comprise) ou montage introuvable |
| `409` | Montage déjà créé, vidéo pas encore prête ou sans original conservé, version périmée ou rendu en cours |
| `503` | Rendu indisponible sur cet environnement, sans `VIDEO_EDIT_RENDER_QUEUE_URL` (rien n'est enregistré), ou rendu non publié dans la file (le montage passe alors en `failed`) |

### Vidéos sans original

Les vidéos dont seul le HLS a été gardé, sans job de transcodage ni source lue telle quelle, ne peuvent pas être montées (`409` à la création). Pour les compter sur un environnement :

```sql
SELECT COUNT(*) FROM video_entity v
WHERE NOT v.archived
  AND v.media_id LIKE '%/master.m3u8'
  AND NOT EXISTS (SELECT 1 FROM transcoding_job j WHERE j."videoId" = v.id);
```

## Tests

```bash
cd backend
# Règles, cas d'utilisation et endpoints HTTP (sans base de données)
npx jest tests/video-edits

# Migration, gateway et callbacks du rendu sur un PostgreSQL jetable
docker run -d --rm --name video-edit-test -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=video_edit_test -p 25440:5432 postgres:16-alpine
VIDEO_EDIT_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:25440/video_edit_test \
  npx jest --runInBand src/video-edits
docker stop video-edit-test
```

Le test PostgreSQL refuse une base qui contient déjà les tables de l'application : utilisez toujours une base dédiée. En intégration continue, le job `backend-contract` lui donne sa propre base (service `postgres-video-edit`).

Le worker se teste avec FFmpeg et la police DejaVu installés (`apt install ffmpeg fonts-dejavu-core`) :

```bash
cd ffmpegServer && npm run build && npm test
```

`tests/render.test.ts` rend une vidéo de 6 s générée par FFmpeg et vérifie l'ordre des passages, l'affichage des textes pendant leur durée seulement et les trois qualités HLS.

## Lecture de l’original dans l’éditeur

`GET /api/videos/:videoId/edit/source` renvoie une chaîne contenant l’adresse de l’original, au même format que `GET /api/videos/media/:id`. Cette route ignore le montage actif et fonctionne avant sa création. Pour une vidéo HLS, elle renvoie la playlist originale ; pour une vidéo lue depuis sa source, une URL présignée. L’éditeur doit utiliser cette route pour conserver la correspondance entre la lecture et les temps source des passages.

Accès : créateur et administrateurs via `getEditableVideo`. Erreurs : `400` pour un UUID mal formé, `403 videonotallowedit` pour un utilisateur sans droit, `404` pour un utilisateur ou une vidéo introuvable, `409` pour une vidéo non prête.

## Interface de montage

Depuis la page vidéo, « Monter la vidéo » ouvre `/video/:videoId/edit` pour le créateur ou un administrateur. Le lecteur de l’éditeur utilise exclusivement `GET /api/videos/:videoId/edit/source`, y compris pour modifier à nouveau une vidéo déjà montée. L’aperçu joue le montage en cours d’édition, sans rendu (voir « Aperçu pendant l’édition ») ; le rendu FFmpeg reste la référence pour l’image finale.

- Cliquez sur la timeline ou utilisez le curseur de lecture, puis « Couper ici ». Une coupe exige 5 secondes de chaque côté, avec 100 passages au maximum.
- Glissez le bloc vidéo entier sur la timeline : le repère vertical indique l’insertion. Les flèches gauche/droite permettent aussi le déplacement au clavier. Les textes restent attachés au passage ; supprimer un passage supprime ses textes.
- Ajoutez ou sélectionnez un texte pour modifier contenu, début relatif en secondes, durée, position et couleur. Le retour à la ligne utilise les mêmes règles de mots que le worker (40 caractères, 3 lignes au maximum). Les champs invalides sont signalés avant l’envoi.
- **Texte traversant une coupe** : le texte est conservé sur les deux nouveaux passages, avec début relatif, durée et fin ajustés à chacun. Toute moitié de moins de **0,5 s** est supprimée ; une moitié de exactement 0,5 s est conservée. Si un passage résultant aurait plus de 10 textes, la coupe est refusée avec un message avant toute requête.
- Le plafond de 45 minutes est vérifié avant le premier PUT, même si le montage créé initialement couvre un original plus long. Supprimez les passages inutiles pour le raccourcir.
- Les changements restent locaux. « Annuler les changements » quitte sans PUT. « Modifier la vidéo » envoie tous les passages et textes avec la version lue. Les clés locales ne sont pas les identifiants recréés par le serveur.
- Une erreur 400 affiche toutes les raisons renvoyées. Les refus 403 sont traduits, les conflits 409 et indisponibilités 503 conservent les modifications locales. Recharger depuis le serveur demande confirmation avant de les abandonner.
- Pendant le rendu, aucun bouton d’annulation du traitement n’est proposé. Le suivi interroge le statut sans requêtes concurrentes, réessaie après une interruption réseau et s’arrête à `ready` ou `failed` en revenant à la page vidéo avec un message.
- Le retour à l’original demande confirmation. La page vidéo et les vignettes affichent « Modifiée » et `renderedDuration` lorsqu’une version montée est active. Les sous-titres restent masqués sur celle-ci.

### Aperçu pendant l’édition

Un seul lecteur lit l’original (`edit/source`) et joue le montage tel qu’il est à l’écran, enregistré ou non :

- **Enchaînement** : la position est suivie à chaque image (`requestVideoFrameCallback`, sinon `requestAnimationFrame`). À la fin d’un passage (0,03 s avant sa coupe, soit environ une image), si le passage suivant commence au même endroit de l’original (écart de moins de 1 ms), la lecture continue sans saut ; sinon le lecteur saute au début du passage suivant, et les positions reçues pendant le saut sont ignorées. Après le dernier passage, la lecture s’arrête, le compteur affiche la durée du montage et « Lire » repart de 00:00.
- **Temps du montage** : le compteur (`00:00 / durée finale`) et la barre sont ceux du montage. Un clic sur la barre, la timeline ou un passage place la lecture au bon endroit de l’original. Les coupes, suppressions, déplacements et textes s’appliquent immédiatement, sans requête ; si le passage en cours disparaît, la lecture reprend au même temps du montage.
- **Textes** : dessinés par-dessus la vidéo pendant leur intervalle, bornes incluses comme le filtre `between(t,début,fin)` du rendu : un texte qui commence au tout début d’un passage s’affiche sur sa première image, un texte qui le finit jusqu’à sa dernière.
- **Original / Montage** : l’interrupteur joue l’original intact, sans textes, avec sa propre durée. Le changement conserve l’image affichée quand un passage la montre.
- **Chargement** : un indicateur reste affiché jusqu’à ce que le lecteur soit prêt. Si l’original ne peut pas être lu, si la lecture n’a pas démarré 8 s après « Lire », ou si le navigateur la refuse, un message s’affiche avec « Réessayer » : l’adresse de l’original est relue, puis un nouveau lecteur est créé. Un jeton expiré (`401`) est renouvelé une fois sans quitter la page ; sinon l’éditeur indique que la session a expiré.

Limites : un saut vers un passage qui ne suit pas le précédent dans l’original fige l’image et coupe le son pendant environ 0,1 à 0,3 s, le temps que le lecteur HLS charge et décode depuis l’image clé. La précision est d’environ une image. La qualité est celle du lecteur adaptatif (elle peut démarrer en 360p). Pendant la lecture, la timeline est actualisée environ dix fois par seconde, les textes à chaque image.

**Écarts connus avec le rendu.** Les textes suivent `drawTextFilter` (`ffmpegServer/src/services/render.service.ts`) sur une toile de 1280×720, avec les mêmes proportions dans le cadre 16:9 de l’aperçu :

| Élément | Rendu FFmpeg | Aperçu | Écart attendu |
|---|---|---|---|
| Police | DejaVu Sans Bold, fournie par l’image du worker | DejaVu Sans Bold si elle est installée, sinon Verdana (métriques très proches), puis la police sans empattement du système | Largeur des lignes légèrement différente sans DejaVu |
| Taille | 40 px sur 720 | 3,125 % de la largeur du cadre | Aucun |
| Retour à la ligne | 40 caractères, 3 lignes (`wrapText`) | Même fonction | Aucun |
| Interligne | Hauteur de ligne de la police + 10 px | 1,414 em (approximation des métriques de DejaVu) | Quelques pixels sur un texte de 2 ou 3 lignes |
| Position | Haut du bloc à 6 % ; centré ; bas du bloc à 88 % | Mêmes repères en CSS | Quelques pixels verticaux, la hauteur du bloc dépendant des métriques CSS |
| Alignement | Bloc centré, lignes alignées à gauche | Identique | Aucun |
| Couleurs | Blanc, noir, `#1DAC78` ; contour noir, blanc autour du noir | Identiques | Aucun |
| Contour | `borderw=3` à l’extérieur des lettres | Trait de 6/1280 de la largeur, peint sous le texte (`paint-order`) | Sans `paint-order` (navigateur ancien), le trait mord sur les lettres |
| Cadrage | Image ramenée à 1280×720 avec bandes noires, 30 i/s | `object-fit: contain` dans un cadre 16:9, cadence de l’original | Même cadrage ; cadence différente pour une source à 60 i/s |
| Coupes | À l’image près à 30 i/s, audio coupé avec la vidéo | Arrêt 0,03 s avant la fin, saut de 0,1 à 0,3 s entre passages non contigus | Enchaînements moins nets dans l’aperçu |
| Qualité | 720p, CRF 18 | Qualité HLS adaptative de l’original | Image plus douce au démarrage |

Tests : depuis `frontend/`, `CI=true npm test -- --watchAll=false --runInBand src/pages/videoEdit src/pages/videoMedia/videoMedia.test.tsx src/utils/session.test.ts`, puis `npx tsc --noEmit`. Les tests couvrent les validations, les coupes et leurs textes, les clés locales, les déplacements, l’accès à la source et le renouvellement du jeton, les erreurs, le verrou optimiste, le suivi du rendu et la confirmation du retour à l’original. Ceux de l’aperçu (`EditPreview.test.tsx`, avec un faux lecteur dont le test règle le temps, les sauts et les images) couvrent la conversion temps du montage / temps de l’original, l’enchaînement avec et sans saut, l’arrêt après le dernier passage, un passage supprimé pendant la lecture, les textes à leurs bornes, l’interrupteur Original / Montage, l’échec de lecture et « Réessayer », et l’absence de démarrage.

## Proposer des coupes par les silences

Le panneau « Coupes proposées par les silences » analyse l’original à la demande. Sélectionnez les points proposés puis « Appliquer les coupes sélectionnées », ou ignorez-les. Aucune portion n’est supprimée et aucun PUT n’est effectué avant « Modifier la vidéo ». Les points sont revalidés contre les passages locaux (5 s minimum, 100 passages au maximum) ; les textes sont répartis comme lors d’une coupe manuelle.

L’analyse partage la file des rendus : un message indique clairement qu’elle peut attendre derrière d’autres traitements. Après prise en charge, l’interface indique lecture de l’original puis progression de la détection, avec temps écoulé ; on peut quitter et revenir. Le calcul dispose de cinq minutes par défaut, configurables indépendamment du rendu. L’attente en file est distincte. Sans piste audio : « Cette vidéo n’a pas de piste audio : aucune coupe proposée ». Sans silence correspondant : message spécifique, sans modifier le montage.

- `POST /api/videos/:videoId/edit/silence-analysis` → 202, job existant/actif ou nouveau, cache 24 h si même source/réglages.
- `GET /api/videos/:videoId/edit/silence-analysis` → dernier job, pour reprendre le suivi.
- `GET /api/videos/:videoId/edit/silence-analysis/:jobId` → statut, phase, réglages, progression, résultat (`cuts`, `no_silence`, `no_audio`).

Droits créateur/admin ; UUID invalide 400, refus 403, inconnu 404, original absent/vidéo non prête 409, fonctionnalité désactivée 503. L’analyse fonctionne sans montage préexistant. Le seuil de bruit et la durée minimale sont configurés côté serveur, pas saisis par l’utilisateur ; voir `PREDECOUPAGE.md`.
