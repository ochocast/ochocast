# Enregistrement des Lives

OchoCast permet d'enregistrer automatiquement vos sessions de streaming en direct pour les publier ensuite en tant que vidéos à la demande.

## Architecture du Système

Le système d'enregistrement fonctionne avec plusieurs composants qui communiquent entre eux.

:::tip Schéma interactif
Copiez le code ci-dessous dans [Mermaid Live Editor](https://mermaid.live) pour visualiser le schéma d'architecture :

```mermaid
flowchart TB
    subgraph USER["👤 Utilisateur"]
        OBS[OBS Studio / Encoder]
    end

    subgraph FRONTEND["🖥️ Frontend React"]
        UI[Interface TrackSettings]
        Toggle[Toggle « Enregistrer les lives »]
    end

    subgraph BACKEND["⚙️ Backend NestJS"]
        API[API /recordings/*]
        UseCase[Recording UseCases]
        VideoService[Video Service]
    end

    subgraph CP["🎛️ Control Plane"]
        Discovery[/recorder endpoint]
        Topology[Room Topology]
    end

    subgraph VM["🎬 VM liveRecorder"]
        Recorder[Service Go]
        MP4Writer[MP4 Writer]
    end

    subgraph SFU["📡 Serveur SFU"]
        Room[Room WebRTC]
    end

    subgraph STORAGE["💾 Stockage"]
        S3[S3 / MinIO]
        DB[(PostgreSQL)]
    end

    OBS -->|WHIP| CP
    CP -->|Proxy| Room
    UI -->|1. Créer Room| CP
    Toggle -->|0. PUT /recordings/track/:id/armed| API
    Room -->|2. POST /recordings/live-events| API
    API -->|3. GET /recorder| Discovery
    Discovery -->|4. sfu_url + room_key| API
    API -->|5. HTTP| Recorder
    Recorder -->|6. WebRTC /recorder| Room
    Room -->|7. RTP packets| MP4Writer
    MP4Writer -->|8. Fichier MP4| Recorder
    Recorder -->|9. POST /recordings/segments| API
    UseCase -->|10. Transcode + Upload| S3
    VideoService -->|11. Métadonnées| DB

    style USER fill:#e1f5fe
    style FRONTEND fill:#fff3e0
    style BACKEND fill:#e8f5e9
    style CP fill:#e0f7fa
    style VM fill:#fce4ec
    style SFU fill:#f3e5f5
    style STORAGE fill:#efebe9
```
:::

### Flux détaillé

| Étape | Action | Description |
|-------|--------|-------------|
| 0 | Armer la track | L'organisateur active une fois le toggle « Enregistrer les lives de cette track » (`PUT /recordings/track/:id/armed`), même avant le live. Le réglage persiste d'un live à l'autre |
| 1 | Créer la Room | Le frontend crée une room via le Control Plane (`room_id` = id de la track) |
| 2 | Live démarré | Au premier flux reçu, le SFU d'origine notifie le backend (`POST /recordings/live-events`, header `X-Sfu-Webhook-Secret`). Si la track est armée, le backend démarre l'enregistrement (jamais deux recorders sur une même track, 3 tentatives) |
| 3 | Discovery SFU | Le backend appelle le Control Plane (`GET /recorder?room_id=X`) pour obtenir l'URL du SFU d'ingestion |
| 4 | Réponse Control Plane | Le Control Plane retourne `sfu_url`, `room_key` et `recorder_url` |
| 5 | Notification VM | Le backend contacte la VM liveRecorder via HTTP avec les infos du SFU |
| 6 | Connexion WebRTC | Le recorder se connecte au SFU d'ingestion via l'endpoint `/recorder` |
| 7 | Réception des flux | Le recorder reçoit les packets RTP (audio + vidéo) avec buffer dédié (50k packets) |
| 8 | Écriture MP4 | Les flux sont synchronisés et écrits dans un fichier MP4 |
| 9 | Segment | À la coupure du live (notification `stopped` du SFU ou déconnexion de l'hôte), le recorder envoie le MP4 au backend comme segment non répertorié |
| 10 | Traitement | Le backend transcode et upload vers S3 |
| 11 | Finalisation | La vidéo est créée en base avec les métadonnées du track |

### Rôle du Control Plane

Le Control Plane orchestre la topologie des SFU et permet au recorder de découvrir automatiquement le bon serveur SFU :

- **Endpoint `/recorder`** : Retourne l'URL du SFU d'ingestion (où le host stream) et la clé de la room
- **Avantages** :
  - Le backend n'a pas besoin de connaître l'URL des SFU
  - Le recorder se connecte toujours au bon SFU (celui qui reçoit le stream du host)
  - Compatible avec le load balancing et les architectures multi-SFU

---

## Prérequis

Avant de pouvoir utiliser l'enregistrement, plusieurs composants doivent être déployés et configurés :

### Infrastructure requise

| Composant | Description | Variable d'environnement |
|-----------|-------------|--------------------------|
| **Control Plane** | Orchestre les SFU et la découverte | `CONTROL_PLANE_URL` (backend) |
| **VM liveRecorder** | Service Go qui capture les flux | `RECORDING_VM_URL` (backend) |
| **Serveur(s) SFU** | Gère les connexions WebRTC | Enregistrés auprès du Control Plane |
| **Stockage (MinIO/S3)** | Stocke les vidéos finales | `STOCK_*` (backend) |
| **Keycloak** | Authentification pour la publication auto | Variables Keycloak (VM) |

### Configuration Backend

Dans le fichier `.env` du backend :

```env
# URL du Control Plane (pour la découverte du SFU)
CONTROL_PLANE_URL=http://localhost:8090

# URL de la VM d'enregistrement
RECORDING_VM_URL=http://localhost:8080

# Secret partagé avec le SFU (notifications live démarré / arrêté)
SFU_WEBHOOK_SECRET=<secret>

# Les nouvelles tracks sont-elles armées par défaut ? (false par défaut)
RECORDING_ARMED_BY_DEFAULT=false
```

### Configuration SFU

Dans le fichier `.env` du SFU :

```env
# URL du backend (sans /api) à notifier des débuts / fins de live
BACKEND_URL=<url-backend>

# Même valeur que SFU_WEBHOOK_SECRET côté backend
SFU_WEBHOOK_SECRET=<secret>
```

### Configuration VM liveRecorder

Dans le fichier `.env` de la VM :

```env
# URL du backend pour la publication automatique
BACKEND_PUBLIC_URL=<url-backend>

# Authentification Keycloak
KEYCLOAK_TOKEN_URL=<url-keycloak>/realms/<realm>/protocol/openid-connect/token
KEYCLOAK_CLIENT_ID=<client-id>
KEYCLOAK_CLIENT_SECRET=<client-secret>

# Utilisateur technique pour la publication
RECORDING_USER_USERNAME=<username>
RECORDING_USER_PASSWORD=<password>
```

:::warning Utilisateur technique
Créez un utilisateur dédié dans Keycloak avec les droits nécessaires pour publier des vidéos. Ne pas utiliser un compte administrateur.
:::

---

## Comment activer l'enregistrement

### Étape 1 : Créer un Track (événement live)

1. Connectez-vous à OchoCast
2. Accédez à la page de création d'événement
3. Remplissez les informations du track (titre, description, speakers, tags)
4. Sauvegardez le track

### Étape 2 : Armer l'enregistrement

1. Accédez aux paramètres du track
2. Activez le toggle **« Enregistrer les lives de cette track »** — possible dès la création du track, sans live en cours
3. Un toast confirme que les prochains lives seront enregistrés

Seul l'organisateur (speaker du track ou créateur de l'événement) peut armer ou désarmer. Le réglage persiste d'un live à l'autre, et clôturer le track ne le modifie pas.

### Étape 3 : Lancer le live

1. Cliquez sur **"Démarrer le live OBS"**, copiez l'URL WHIP dans OBS et lancez le streaming
2. L'enregistrement démarre automatiquement, sans qu'aucune page ne soit ouverte
3. À chaque coupure du live (arrêt, crash, reconnexion), le segment en cours est clôturé ; la reprise en crée un nouveau

### Désarmer

Désactivez le toggle. Si un live est en cours, l'enregistrement s'arrête immédiatement et le segment en cours est conservé. À l'inverse, armer pendant un live démarre l'enregistrement immédiatement.

### Statut de l'enregistrement

À côté du toggle, un statut se met à jour en temps réel (toutes les 5 s) :

| Statut | Signification |
|--------|---------------|
| Désactivé | Le track n'est pas armé |
| Armé — en attente du live | Le prochain live sera enregistré |
| Enregistrement en cours | L'enregistreur capture le live |
| Problème d'enregistrement | Le démarrage ou l'arrêt a échoué après plusieurs tentatives, ou l'enregistreur est injoignable |

En cas de problème, un bandeau s'affiche aussi sur la page du live, **visible uniquement par l'organisateur**, avec un lien vers les paramètres du track. Le problème disparaît au prochain démarrage réussi, ou en désarmant le track.

---

## Où retrouver les vidéos enregistrées

Les vidéos enregistrées sont automatiquement publiées dans la section **Vidéos** d'OchoCast.

### Métadonnées héritées

La vidéo publiée hérite automatiquement des informations du track :

| Champ | Source |
|-------|--------|
| Titre | Titre du track |
| Description | Description du track |
| Speakers | Intervenants du track |
| Tags | Tags du track |
| Miniature | Générée automatiquement |

### Accès aux vidéos

1. **Page d'accueil** : Les vidéos récentes apparaissent dans la section "Dernières vidéos"
2. **Section Vidéos** : Toutes les vidéos sont listées dans `/videos`
3. **Profil utilisateur** : Retrouvez vos vidéos dans votre espace personnel

### Traitement de la vidéo

Après la publication, la vidéo passe par plusieurs étapes :

1. **Upload** : Le fichier MP4 est envoyé au backend
2. **Transcodage** : La vidéo est convertie en différentes qualités (HLS)
3. **Miniature** : Une vignette est générée automatiquement
4. **Stockage** : Les fichiers sont uploadés vers S3
5. **Disponibilité** : La vidéo devient accessible aux utilisateurs

:::note Délai de traitement
Le traitement peut prendre quelques minutes selon la durée de l'enregistrement. La vidéo apparaîtra dans la liste une fois le processus terminé.
:::

---

## Dépannage

### Le track est armé mais rien n'est enregistré

**Causes possibles** :
- Le SFU ne notifie pas le backend (`BACKEND_URL` ou `SFU_WEBHOOK_SECRET` absent côté SFU)
- Les secrets diffèrent entre SFU et backend (le backend répond 401)
- La VM liveRecorder ou le Control Plane n'est pas accessible

**Solutions** :
1. Cherchez `[LIVE-EVENT]` dans les logs du SFU
2. Vérifiez `SFU_WEBHOOK_SECRET` des deux côtés
3. Vérifiez `CONTROL_PLANE_URL` et `RECORDING_VM_URL` dans le backend, puis les logs `StartRecordingUsecase`

### Message "Failed to discover SFU" ou "Room not found"

**Causes possibles** :
- Le Control Plane ne connaît pas la room
- Le live n'a pas été démarré correctement

**Solutions** :
1. Vérifiez que le live est bien actif (OBS streaming)
2. Vérifiez que la room a été créée via le Control Plane
3. Testez l'endpoint directement : `GET http://<control-plane>/recorder?room_id=<room_id>`

### La vidéo n'apparaît pas après l'arrêt

**Causes possibles** :
- Le transcodage est en cours
- Échec de la publication automatique

**Solutions** :
1. Attendez quelques minutes (le transcodage prend du temps)
2. Vérifiez les logs du backend pour les erreurs
3. Vérifiez la configuration Keycloak de la VM

### La vidéo est désynchronisée (audio/vidéo)

**Cause** : Problème lors de la capture des flux RTP.

**Solutions** :
1. Vérifiez la stabilité de la connexion réseau
2. Réduisez la qualité du stream OBS
3. Consultez les logs de la VM liveRecorder

---

## Bonnes pratiques

### Avant l'enregistrement

- Testez votre configuration OBS avant le live officiel
- Vérifiez que tous les services sont opérationnels
- Préparez les métadonnées du track (titre, description, tags)

### Pendant l'enregistrement

- Surveillez les indicateurs de streaming dans OBS
- Gardez une connexion réseau stable
- Évitez de rafraîchir la page des paramètres du track

### Après l'enregistrement

- Attendez le toast de confirmation avant de fermer la page
- Vérifiez que la vidéo apparaît dans la section Vidéos
- Modifiez les métadonnées si nécessaire depuis la page de la vidéo
