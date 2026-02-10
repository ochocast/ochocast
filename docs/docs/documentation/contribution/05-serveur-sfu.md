# Serveur SFU

Le **serveur SFU** (Selective Forwarding Unit) est le composant responsable de la diffusion vidéo en temps réel dans OchoCast. Il reçoit le flux WebRTC d'un diffuseur (OBS, navigateur…) et le redistribue à tous les spectateurs connectés, sans transcodage. Il est écrit en **Go** avec la bibliothèque [Pion WebRTC](https://github.com/pion/webrtc).

## 1. Vue d'ensemble de l'architecture

```
                          ┌──────────────────┐
                          │   Control Plane  │
                          │  (orchestrateur) │
                          └────────┬─────────┘
                                   │ métriques / topologie
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
              │  SFU (A)  │  │  SFU (B)  │  │  SFU (C)  │
              │  origin   │  │  relay    │  │  relay    │
              └──┬──┬──┬──┘  └──┬──┬──┬──┘  └──┬──┬──┬──┘
     Host ──────►│  │  │        │  │  │        │  │  │
                 ▼  ▼  ▼        ▼  ▼  ▼        ▼  ▼  ▼
                 Viewers        Viewers        Viewers
```

Le SFU peut fonctionner en **mode autonome** (un seul serveur) ou en **mode distribué** (cluster de SFUs coordonnés par un **Control Plane**).

---

## 2. Structure du code

```
sfuServer/
├── main.go                 # Point d'entrée, enregistrement des routes HTTP
├── server.go               # SFUServer : gestion des rooms, cascade, métriques
├── room.go                 # Room : gestion d'une salle (host, viewers, tracks)
├── broadcaster.go          # TrackBroadcaster : lecture RTP et écriture optimisée
├── handlers.go             # Handlers HTTP (WHIP, viewer, cascade, promote…)
├── models.go               # Structures de données (Room, SFUServer, etc.)
├── utils.go                # Utilitaires (génération d'ID/clé)
├── cmd/
│   └── controlplane/
│       └── main.go         # Point d'entrée du Control Plane
├── pkg/
│   ├── controlplane/
│   │   └── controlplane.go # Logique du Control Plane (topologie, load balancing)
│   └── metrics/
│       └── collector.go    # Collecteur de métriques (CPU, mémoire, rooms)
└── internal/
    └── models/
        └── shared.go       # Modèles partagés entre SFU et Control Plane
```

---

## 3. Concepts clés

### 3.1. Room

Une `Room` représente une salle de diffusion. Elle contient :

| Champ | Type | Description |
|---|---|---|
| `Host` | `*webrtc.PeerConnection` | Connexion du diffuseur principal |
| `Publishers` | `map[string]*webrtc.PeerConnection` | Speakers additionnels (promus depuis viewers) |
| `Viewers` | `map[string]*webrtc.PeerConnection` | Spectateurs connectés |
| `Broadcasters` | `map[string]*TrackBroadcaster` | Un broadcaster par piste audio/vidéo |
| `SharedTracks` | `map[string]*TrackLocalStaticRTP` | Pistes partagées entre tous les viewers |
| `RecorderTracks` | `map[string]*TrackLocalStaticRTP` | Pistes dédiées au recorder (sans perte) |
| `IsOrigin` | `bool` | `true` si ce SFU est l'origin pour cette room |
| `OriginURL` | `string` | URL du SFU origin (si edge/relay) |

**Cycle de vie :**

```
POST /room/create  →  Room créée (clé générée)
POST /whip         →  Host connecté, tracks reçues, StreamActive = true
POST /viewer       →  Viewer ajouté, reçoit les SharedTracks
Déconnexion host   →  Grace period (10 min) puis suppression
DELETE /room/delete →  Suppression immédiate
```

### 3.2. TrackBroadcaster

Le `TrackBroadcaster` est le cœur du pipeline média. Pour chaque piste audio ou vidéo du host, un broadcaster est créé.

**Pipeline optimisé :**

```
TrackRemote (host)
    │
    ▼
  readLoop()          ← lit les paquets RTP du host
    │
    ├──► writeQueueCh (20 000 paquets)    ← buffer async pour viewers
    │        │
    │        ▼
    │    asyncWriteLoop() × 4 goroutines  ← écrit vers SharedTrack
    │        │
    │        ▼
    │    SharedTrack ──► Tous les viewers  ← 1 seule track partagée
    │
    └──► recorderCh (50 000 paquets)      ← buffer dédié au recorder
             │
             ▼
         recorderWriteLoop()              ← écriture sans perte
             │
             ▼
         RecorderTrack ──► Recorder
```

**Optimisations clés :**

- **SharedTracks** : Une seule `TrackLocalStaticRTP` est partagée par tous les viewers. Pas d'allocation M×N (M tracks × N viewers).
- **sync.Pool** : Les buffers de paquets RTP (1500 octets) sont recyclés via un pool global pour réduire la pression sur le GC.
- **Recorder dédié** : Le recorder a ses propres tracks et un buffer de 50 000 paquets (~16 secondes à 30 fps). Il ne subit pas les drops liés à la congestion des viewers.
- **Multi-writer** : 4 goroutines parallèles écrivent sur la `SharedTrack`, permettant un passage à l'échelle linéaire.

### 3.3. Signalisation WebRTC (WHIP)

Le SFU utilise le protocole **WHIP** (WebRTC HTTP Ingestion Protocol) pour recevoir le flux du diffuseur :

1. Le client envoie une **SDP Offer** en `POST /whip?room_id=...&key=...`
2. Le SFU crée une `PeerConnection`, configure les handlers `OnTrack`
3. Le SFU génère une **SDP Answer** et la retourne
4. L'ICE gathering se termine, la connexion WebRTC s'établit
5. Les pistes audio/vidéo arrivent via `OnTrack` → `room.AddTrack()`

Pour les **viewers**, le flux est inversé :
1. Le viewer envoie une SDP Offer en `POST /viewer?room_id=...`
2. Le SFU ajoute les `SharedTracks` existantes à la `PeerConnection`
3. Le SFU retourne la SDP Answer

---

## 4. Mode distribué (Cascade)

### 4.1. Control Plane

Le **Control Plane** est un service séparé qui orchestre le cluster de SFUs. Il est responsable de :

- **Enregistrement** : chaque SFU s'inscrit au démarrage via `POST /control/register_sfu`
- **Métriques** : chaque SFU envoie ses métriques (CPU, mémoire, viewers) toutes les 5 secondes
- **Topologie** : il maintient un arbre de diffusion par room (ingestion → relay → viewer-pool)
- **Load balancing** : il dirige les viewers vers le SFU optimal
- **Cascade** : il déclenche les connexions cascade entre SFUs quand nécessaire

**Rôles des nœuds dans la topologie :**

| Rôle | Description |
|---|---|
| `ingestion` | SFU qui reçoit le flux du host (origin) |
| `relay` | SFU intermédiaire qui redistribue le flux |
| `viewer-pool` | SFU terminal qui sert les viewers |

### 4.2. Connexion cascade

Quand un viewer se connecte à un SFU qui ne possède pas le flux :

1. Le Control Plane identifie le SFU origin (ingestion)
2. Il ordonne au SFU edge de souscrire via `POST /cascade/subscribe`
3. Le SFU edge crée une `PeerConnection` vers le SFU origin
4. Les tracks sont reçues comme si elles venaient d'un host local
5. Les viewers locaux reçoivent le flux via les `SharedTracks` habituelles

```
SFU Origin                          SFU Edge
   │                                    │
   │◄── POST /cascade/subscribe ────────│  (SDP Offer)
   │                                    │
   │──── SDP Answer ───────────────────►│
   │                                    │
   │════ WebRTC media stream ══════════►│
   │                                    │
   │                              Viewers locaux
```

### 4.3. Grace Period

Quand le host se déconnecte (ex. : redémarrage d'OBS), une période de grâce de **10 minutes** est déclenchée avant la suppression de la room. Cela permet au host de se reconnecter sans perdre la clé de la room ni les viewers.

---

## 5. API HTTP

### Gestion des rooms

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/room/create` | Créer une room (retourne `room_id` et `key`) |
| `GET` | `/room/get?room_id=` | Récupérer les infos d'une room |
| `GET` | `/room/exists?room_id=` | Vérifier l'existence et obtenir l'URL WHIP |
| `DELETE` | `/room/delete?room_id=` | Supprimer une room |
| `GET` | `/room/viewers?room_id=` | Nombre de viewers dans une room |
| `GET` | `/stream-status?room_id=` | Vérifier si le stream est actif |

### Streaming

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/whip?room_id=&key=` | Ingestion WHIP (OBS, FFmpeg…). Body : SDP Offer |
| `POST` | `/viewer?room_id=` | Connexion viewer. Body : SDP Offer |
| `POST` | `/recorder?room_id=` | Connexion recorder (tracks dédiées, sans perte) |
| `POST` | `/promote?room_id=&key=&viewer_id=` | Promouvoir un viewer en speaker |
| `POST` | `/demote?room_id=&key=&publisher_id=` | Rétrograder un speaker en viewer |

### Cascade (multi-SFU)

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/cascade/subscribe?room_id=` | Un SFU edge souscrit au flux de l'origin |
| `POST` | `/cascade/publish?room_id=` | Un SFU edge reçoit le flux de l'origin |
| `POST` | `/cascade/disconnect?room_id=` | Déconnecter la cascade pour une room |
| `POST` | `/cascade/remove-downstream?room_id=&child_sfu_id=` | Supprimer un SFU downstream |

### Santé

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Healthcheck du serveur |

---

## 6. Configuration

La configuration se fait via des variables d'environnement (fichier `.env`).

### Variables principales

| Variable | Défaut | Description |
|---|---|---|
| `SERVER_PORT` | `8090` | Port HTTP du serveur |
| `SERVER_URL` | `http://localhost:8090` | URL publique du SFU |
| `ENABLE_HTTPS` | `false` | Activer HTTPS |
| `CERT_FILE` / `KEY_FILE` | `cert.pem` / `key.pem` | Certificats TLS |
| `SFU_ID` | auto-généré | Identifiant unique du SFU |
| `CONTROL_PLANE_URL` | *(vide)* | URL du Control Plane (mode cluster) |
| `SFU_REGION` / `SFU_ZONE` | *(vide)* | Région et zone pour les métriques |

### ICE / NAT Traversal

| Variable | Défaut | Description |
|---|---|---|
| `STUN_SERVERS` | Google STUN | Serveurs STUN (séparés par `,`) |
| `TURN_SERVER` | *(vide)* | Serveur TURN (requis derrière NAT symétrique) |
| `TURN_USERNAME` / `TURN_PASSWORD` | *(vide)* | Identifiants TURN |
| `PUBLIC_IP` | *(vide)* | IP publique pour NAT1To1 (Docker / containers) |
| `ENABLE_ICE_TCP` | `false` | Activer les candidats ICE-TCP |
| `ICE_RELAY_ONLY` | `false` | Forcer le mode relay (tout via TURN) |

---

## 7. Multi-Publisher (Promote / Demote)

Le SFU supporte plusieurs publishers dans une même room, permettant des scénarios interactifs (webinaires, co-streaming, classes virtuelles).

**Flux :**

1. Le host démarre son stream via `/whip`
2. Un viewer rejoint via `/viewer`
3. Le host promeut un viewer en speaker via `POST /promote` (avec la `key` de la room)
4. Le speaker envoie une SDP Offer, reçoit ses propres tracks
5. Tous les viewers reçoivent les tracks du host **et** du speaker
6. Le host peut rétrograder le speaker via `POST /demote`

Chaque publisher a sa propre `PeerConnection` indépendante. Les tracks de tous les publishers sont ajoutées aux `SharedTracks` de la room.

---

## 8. Recorder (enregistrement sans perte)

Le recorder se connecte via `POST /recorder?room_id=` et bénéficie d'un chemin dédié :

- Des `RecorderTracks` séparées des `SharedTracks` des viewers
- Un buffer de **50 000 paquets** (vs 20 000 pour les viewers)
- **Aucun drop de paquet** : le canal du recorder est bloquant (pas de `default` case)
- Une `recorderWriteLoop()` dédiée, indépendante du fan-out vers les viewers

Cela garantit une qualité d'enregistrement maximale, même sous forte charge de viewers.

---

## 9. Lancer le serveur en local

### Prérequis

- **Go 1.21+** installé

### Démarrage rapide

```bash
cd sfuServer
cp .env.example .env
# Éditer .env selon vos besoins (le défaut fonctionne en mode autonome)

go build -o server.exe
./server.exe
```

Le serveur écoute par défaut sur `http://localhost:8090`.

### Tester avec OBS

1. OBS ≥ 31.x → Paramètres → Stream → Service : **WHIP**
2. URL : `http://localhost:8090/whip?room_id=<ID>&key=<KEY>`
3. L'ID et la clé sont retournés par `POST /room/create`

### Cluster local (3 SFUs + Control Plane)

```bash
# Terminal 1 : Control Plane
CONTROL_PLANE_PORT=8090 go run cmd/controlplane/main.go

# Terminal 2 : SFU 1
SFU_ID=sfu-1 SERVER_PORT=8091 SERVER_URL=http://localhost:8091 \
  CONTROL_PLANE_URL=http://localhost:8090 go run .

# Terminal 3 : SFU 2
SFU_ID=sfu-2 SERVER_PORT=8092 SERVER_URL=http://localhost:8092 \
  CONTROL_PLANE_URL=http://localhost:8090 go run .

# Terminal 4 : SFU 3
SFU_ID=sfu-3 SERVER_PORT=8093 SERVER_URL=http://localhost:8093 \
  CONTROL_PLANE_URL=http://localhost:8090 go run .
```

---

## 10. Guide du contributeur

### Ajouter un nouveau endpoint

1. Créer la fonction handler dans `handlers.go` :
   ```go
   func handleMonEndpoint(w http.ResponseWriter, r *http.Request) {
       setCORSHeaders(w, "POST, OPTIONS")
       // ...
   }
   ```
2. Enregistrer la route dans `main.go` :
   ```go
   http.HandleFunc("/mon-endpoint", handleMonEndpoint)
   ```

### Ajouter une fonctionnalité à une Room

1. Ajouter le champ dans la struct `Room` (fichier `models.go`)
2. Initialiser le champ dans `NewRoom()` (fichier `room.go`)
3. Implémenter la logique métier dans `room.go`
4. **Toujours** utiliser `room.mu.Lock()` / `room.mu.RLock()` pour l'accès concurrent

### Modifier le pipeline média

Le pipeline est dans `broadcaster.go`. Points d'attention :

- **readLoop()** : lit les paquets du host. Ne jamais bloquer ici.
- **writeQueueCh** : si vous changez la taille du buffer, pensez à l'impact mémoire (20 000 × 1500 octets = ~30 Mo par track).
- **sync.Pool** : les buffers doivent être retournés au pool après usage pour éviter les fuites mémoire.
- **recorderCh** : ne jamais ajouter de `default` case (politique no-drop).

### Ajouter un nouveau type de client

Suivre le modèle du recorder :

1. Créer une méthode `room.AddMonClient()` dans `room.go`
2. Créer des tracks dédiées si nécessaire (comme `RecorderTracks`)
3. Enregistrer un handler `SetMonClientTrack()` dans le broadcaster si besoin
4. Ajouter les handlers de déconnexion (`OnICEConnectionStateChange`, `OnConnectionStateChange`)
5. Créer le handler HTTP dans `handlers.go`

### Conventions

- **Logs** : utiliser des préfixes entre crochets : `[WHIP]`, `[ROOM-%s]`, `[CASCADE]`, `[EDGE]`, etc.
- **Concurrence** : toujours protéger les accès à `Room` et `SFUServer` avec les mutex appropriés (`mu.Lock()` pour écriture, `mu.RLock()` pour lecture).
- **Cleanup** : gérer la déconnexion via `OnICEConnectionStateChange` et `OnConnectionStateChange` avec un pattern `removeOnce` pour éviter les double-close.
- **Nommage** : les IDs de viewers/publishers suivent le pattern `viewer-<addr>-<ptr>` ou `speaker-<viewerID>`.
