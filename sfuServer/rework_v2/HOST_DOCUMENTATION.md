# Documentation - Host (Benchmark Distributor)

## Vue d'ensemble

Le module `host.py` implémente un **émetteur vidéo WebRTC** utilisant le protocole WHIP (WebRTC-HTTP Ingestion Protocol). Il génère un flux vidéo synthétique et le diffuse vers un serveur SFU via WebRTC.

### Architecture

```
Host
├── StreamTrack (MediaStreamTrack)
│   ├── Génération de frames (bleues/rouges)
│   ├── Gestion de la queue asynchrone
│   └── Collecte des timestamps (latency check)
└── Connexion WebRTC (RTCPeerConnection)
    ├── Configuration STUN/ICE
    ├── Négociation SDP (offer/answer)
    └── Transmission via WHIP
```

---

## Classe `StreamTrack`

### Responsabilité
Génère et envoie des frames vidéo synthétiques à un débit constant (FPS configuré).

### Caractéristiques des frames

#### Frames bleues (standard)
- **RGB**: `(0, 0, 255)` - Bleu pur
- **Fréquence**: Continue (selon FPS configuré)
- **Objectif**: Flux vidéo de base

#### Frames rouges (latency check)

Le système supporte **deux méthodes d'encodage** pour les frames rouges :

##### Méthode 1: Simple 16-bit (par défaut)
- **RGB**: `(255, G, B)` où :
  - `R = 255` (rouge pur)
  - `G = sequence_number & 0xFF` (bits 0-7)
  - `B = (sequence_number >> 8) & 0xFF` (bits 8-15)
- **Range**: 0-65535 (16 bits)
- **Avantages**: Range étendu, encodage direct
- **Inconvénients**: Pas de détection d'erreur

##### Méthode 2: Diagonal avec redondance
- **RGB**: `(255, G, B)` où :
  - `R = 255` (rouge pur)
  - `G = sequence_number * 2` (toujours pair, 0-254)
  - `B = 255 - G` (redondance)
- **Range**: 0-127 (7 bits, wrap-around après)
- **Validation**: `G + B == 255` pour détecter la corruption
- **Avantages**: Détection d'erreur, correction partielle
- **Inconvénients**: Range limité

**Fréquence**: Toutes les `red_interval` secondes (par défaut 5s)
**Objectif**: Mesure de latence end-to-end avec validation d'intégrité

### Paramètres

```python
class StreamTrack(MediaStreamTrack):
    def __init__(self, host_instance):
        self._interval = 1.0 / host_instance.fps  # Intervalle entre frames
        self._queue = asyncio.Queue(maxsize=5)    # Buffer de frames
        self._pts = 0                             # Presentation timestamp
        self.red_timestamps = []                  # Historique des frames rouges
        self.special_frame_sequence_number = 0    # Compteur de séquence
```

### Métriques de performance

```python
self.frames_generated = 0    # Total de frames générées
self.frames_dropped = 0      # Frames perdues (queue pleine)
self.timing_errors = 0       # Erreurs de timing (génération trop lente)
```

### Mécanismes de synchronisation

#### 1. Timing absolu pour frames rouges
```python
next_red_time = last_red_check + self.host.red_interval
should_be_red = t0 >= next_red_time
```
- Évite la dérive temporelle
- Garantit un intervalle constant entre frames rouges

#### 2. Gestion de queue non-bloquante
```python
if self._queue.full():
    dropped = self._queue.get_nowait()  # Supprime la plus ancienne
    self.frames_dropped += 1
self._queue.put_nowait(frame)
```
- Priorité aux frames récentes
- Évite le blocage de la génération

#### 3. Contrôle du débit (rate limiting)
```python
elapsed = time.time() - t0
sleep_time = max(0, self._interval - elapsed)
await asyncio.sleep(sleep_time)
```
- Maintient le FPS cible
- Détecte les retards excessifs

### Sauvegarde des timestamps

Fichier: `<output>/host_timestamps.json`

```json
{
  "session_info": {
    "start_time": "ISO8601",
    "end_time": "ISO8601",
    "red_interval": 5.0,
    "fps": 30,
    "resolution": "640x360",
    "total_red_frames": 120,
    "total_frames": 3600,
    "frames_dropped": 5,
    "timing_errors": 2,
    "avg_timing_error": 0.002,
    "max_timing_error": 0.015,
    "exit_error": false,
    "exit_reason": null
  },
  "red_timestamps": [
    {
      "frame": 150,
      "timestamp": 1698945123.456789,
      "relative_time": 5.001234,
      "sequence_number": 1,
      "expected_time": 5.0,
      "timing_error": 0.001234
    }
  ],
  "performance_stats": {
    "timing_errors_ms": [1.234, 2.456],
    "frame_drop_rate": 0.139
  }
}
```

---

## Classe `Host`

### Responsabilité
Orchestre la connexion WebRTC et la diffusion du flux vidéo vers un serveur SFU.

### Paramètres de construction

```python
def __init__(self, 
    url: str,                    # URL WHIP du serveur SFU
    stun_url: str,               # Serveur STUN (format: stun:host:port)
    output: str,                 # Répertoire de sortie pour les logs/timestamps
    width=640,                   # Largeur de la vidéo (px)
    height=360,                  # Hauteur de la vidéo (px)
    fps=30,                      # Images par seconde
    red_interval=5.0,            # Intervalle entre frames rouges (s)
    token=None,                  # Token d'authentification Bearer (optionnel)
    encoding_method="simple",    # Méthode d'encodage: "simple" ou "diagonal"
    connection_timeout=30.0,     # Timeout connexion WebRTC (secondes)
    http_timeout=10.0            # Timeout requêtes HTTP (secondes)
):
```

### Cycle de vie

#### 1. Démarrage

**Mode asynchrone** (dans un event loop existant):
```python
host = Host(url, stun_url, output)
task = asyncio.create_task(host.start_async())
await asyncio.sleep(2)  # Attendre connexion
host.start_check_latency()
await asyncio.sleep(60)
host.stop()
await task
```

**Mode thread** (pour code synchrone):
```python
host = Host(url, stun_url, output)
thread = host.start_in_thread()  # Lance dans un thread daemon
time.sleep(2)  # Attendre connexion
host.start_check_latency()
time.sleep(60)
host.stop()
thread.join(timeout=5.0)
```

#### 2. Activation du latency check
```python
host.start_check_latency()  # Active l'envoi de frames rouges
```

#### 3. Arrêt
```python
host.stop()  # Thread-safe, set le stop_event
```

### Flux WebRTC (WHIP)

#### 1. Configuration RTCPeerConnection
```python
config = RTCConfiguration(
    iceServers=[RTCIceServer(self.stun_url)]
)
self.pc = RTCPeerConnection(configuration=config)
```

#### 2. Préférence de codecs
```python
# Priorité: VP8 > H264 (Constrained Baseline) > Autres
vp8 = [c for c in video_caps if c.mimeType.lower() == "video/vp8"]
h264_cb = [c for c in video_caps 
           if c.mimeType.lower() == "video/h264"
           and c.parameters.get("profile-level-id") == "42e01f"]
transceiver.setCodecPreferences(vp8 + h264_cb + others)
```

**Justification**:
- **VP8**: Faible latence, pas de B-frames, encodage simple
- **H264 CBP**: Compatible, bonne qualité, latence acceptable
- Évite les codecs complexes (H264 High Profile, VP9, AV1)

#### 3. Patching SDP (optimisations bitrate)

```python
def patch_sdp_bitrates(self, sdp: str) -> str:
    # Pour VP8:
    x-google-start-bitrate=2000      # 2 Mbps initial
    x-google-max-bitrate=4000        # 4 Mbps max
    x-google-min-bitrate=1000        # 1 Mbps min
    x-google-cpu-overuse-detection=false  # Désactive la réduction adaptative
    max-fr=30                        # 30 FPS max
    
    # Pour H264:
    level-asymmetry-allowed=1
    packetization-mode=1
    profile-level-id=42e01f          # Constrained Baseline Profile
    
    # Paramètres de latence (ajoutés à m=video):
    a=rtcp-fb:* nack                 # NACK pour retransmission
    a=rtcp-fb:* ccm fir              # Full Intra Request
    a=rtcp-fb:* goog-remb            # Receiver Estimated Max Bitrate
```

#### 4. Négociation WHIP

```http
POST /whip/endpoint HTTP/1.1
Content-Type: application/sdp
Accept: application/sdp
Authorization: Bearer <token>

v=0
o=- ... 
s=-
t=0 0
...
```

**Réponse** (status 200/201):
```
Content-Type: application/sdp

v=0
...
(SDP answer)
```

#### 5. Fallback SDP

Si le SDP patché échoue (status 500):
1. Retry avec le SDP original (sans patching)
2. Log des deux tentatives

### Gestion des états WebRTC

```python
@self.pc.on("iceconnectionstatechange")
async def _i():
    # new -> checking -> connected -> completed
    # ou: failed, disconnected, closed

@self.pc.on("connectionstatechange")
async def _c():
    # new -> connecting -> connected
    # ou: failed, disconnected, closed
```

**Attente de connexion**:
```python
while self.pc.connectionState not in ("connected", "failed", "closed"):
    await asyncio.sleep(0.1)
```

### Gestion des threads

Le Host fonctionne dans deux modes clairement séparés:

#### Mode async (event loop existant)
```python
import asyncio
from host import Host

async def main():
    host = Host(...)
    task = asyncio.create_task(host.start_async())
    await asyncio.sleep(2)
    host.start_check_latency()
    await asyncio.sleep(60)
    host.stop()
    await task

asyncio.run(main())
```

#### Mode thread (code synchrone)
```python
import time
from host import Host

host = Host(...)
thread = host.start_in_thread()  # Crée un thread daemon avec event loop
time.sleep(2)
host.start_check_latency()
time.sleep(60)
host.stop()
thread.join(timeout=5.0)
```

**Note**: La méthode `start()` a été supprimée pour éviter toute ambiguïté. Utilisez explicitement `start_async()` ou `start_in_thread()`.

---

## Points forts de l'implémentation

### ✅ 1. Timing précis
- Horloge absolue pour éviter la dérive
- Détection des erreurs de timing
- Sleep adaptatif pour maintenir le FPS

### ✅ 2. Gestion robuste des frames
- Queue avec taille limitée (5 frames)
- Drop des anciennes frames si la queue est pleine
- Métriques détaillées (dropped, timing errors)

### ✅ 3. Encodage intelligent des frames rouges
- Numéro de séquence encodé dans les canaux RGB
- **Deux méthodes disponibles**:
  - Simple 16-bit: Range 0-65535, encodage direct
  - Diagonal: Range 0-127, détection d'erreur via redondance (G+B=255)
- Permet la détection de pertes et corruption côté client
- Voir section "Red Frame Encoding" pour détails

### ✅ 4. Optimisations WebRTC
- Préférence de codecs adaptée (VP8 en priorité)
- Patching SDP pour faible latence
- Fallback automatique si le patching échoue

### ✅ 5. Logs et debugging
- Timestamps détaillés sauvegardés en JSON
- Emojis pour identifier rapidement les événements
- Statistiques de performance complètes

### ✅ 6. Flexibilité d'exécution
- Mode async ou thread clairement séparés
- API explicite (start_async / start_in_thread)
- Stop thread-safe
- Support de l'authentification Bearer

### ✅ 7. Robustesse améliorée
- Timeouts configurables (HTTP et WebRTC)
- check_latency thread-safe avec lock
- Pas de blocage infini
- Gestion propre des erreurs

---

## Red Frame Encoding

### Vue d'ensemble

Les frames rouges sont utilisées pour mesurer la latence end-to-end. Le numéro de séquence est encodé dans les canaux G et B, tandis que R est toujours à 255.

### Méthode 1: Simple 16-bit Encoding

**Encodage**:
```python
R = 255
G = sequence_number & 0xFF         # Bits 0-7
B = (sequence_number >> 8) & 0xFF  # Bits 8-15
```

**Décodage**:
```python
sequence_number = G | (B << 8)
```

**Caractéristiques**:
- Range: 0 à 65535
- Aucune redondance
- Aucune détection d'erreur
- Idéal pour tests longs et connexions fiables

**Exemple**:
```python
from red_frame_utils import encode_sequence_simple, decode_sequence_simple

r, g, b = encode_sequence_simple(1234)
# (255, 210, 4)

seq = decode_sequence_simple(255, 210, 4)
# 1234
```

### Méthode 2: Diagonal Encoding with Redundancy

**Encodage**:
```python
R = 255
G = sequence_number * 2  # Toujours pair (0-254)
B = 255 - G              # Redondance
```

**Décodage**:
```python
sequence_number = round((G + (255 - B)) / 4)
is_valid = (G + B == 255)
```

**Caractéristiques**:
- Range: 0 à 127 (wrap-around après)
- Redondance via G+B=255
- Détection d'erreur intégrée
- Correction partielle possible
- Idéal pour validation d'intégrité

**Exemple**:
```python
from red_frame_utils import encode_sequence_diagonal, decode_sequence_diagonal

r, g, b = encode_sequence_diagonal(50)
# (255, 100, 155)

seq, is_valid = decode_sequence_diagonal(255, 100, 155)
# (50, True)

# Frame corrompue
seq, is_valid = decode_sequence_diagonal(255, 100, 100)
# (64, False) - G+B != 255, corruption détectée
```

### Comparaison des méthodes

| Critère              | Simple         | Diagonal       |
|---------------------|----------------|----------------|
| Range               | 0-65535        | 0-127          |
| Bits utilisés       | 16             | 7              |
| Redondance          | Non            | Oui (G+B=255)  |
| Détection erreur    | Non            | Oui            |
| Correction erreur   | Non            | Partielle      |
| Usage recommandé    | Tests longs    | Validation     |

### Configuration

```python
# Simple encoding (par défaut)
host = Host(
    url="...",
    stun_url="...",
    output="...",
    encoding_method="simple"
)

# Diagonal encoding avec validation
host = Host(
    url="...",
    stun_url="...",
    output="...",
    encoding_method="diagonal"
)
```

### Format JSON enrichi

Le fichier `host_timestamps.json` inclut les informations d'encodage:

```json
{
  "session_info": {
    "encoding_method": "simple",
    "encoding_info": {
      "name": "Simple 16-bit",
      "max_sequence": 65535,
      "bits": 16,
      "has_redundancy": false,
      "error_detection": false
    },
    ...
  },
  "red_timestamps": [
    {
      "frame": 150,
      "timestamp": 1698945123.456789,
      "sequence_number": 1,
      "encoding_method": "simple",
      "rgb": [255, 1, 0],
      ...
    }
  ]
}
```

### Wrap-around (Diagonal)

Pour la méthode diagonal, si le test dépasse 127 red frames, le numéro de séquence revient à 0:

```python
# Dans host.py
if self.host.encoding_method == "diagonal":
    seq = self.special_frame_sequence_number % 128
    r, g, b = encode_sequence_diagonal(seq)
```

Séquences 0, 128, 256... auront le même encodage RGB.

### Détection de corruption

La méthode diagonal peut détecter:
- ✅ Changement d'un canal (G ou B)
- ✅ Perte de bits
- ❌ Corruption symétrique des deux canaux

### API red_frame_utils

```python
from red_frame_utils import (
    encode_sequence_simple,
    decode_sequence_simple,
    encode_sequence_diagonal,
    decode_sequence_diagonal,
    is_red_frame,
    validate_red_frame_simple,
    validate_red_frame_diagonal,
    get_encoding_info
)

# Vérifier si c'est une frame rouge
if is_red_frame(r, g, b):
    # Décoder selon la méthode
    if method == "simple":
        seq = decode_sequence_simple(r, g, b)
    else:
        seq, is_valid = decode_sequence_diagonal(r, g, b)
        if not is_valid:
            print(f"⚠️ Frame corrompue! Estimation: {seq}")
```

---

## Points à améliorer et incohérences détectées

### ✅ CORRIGÉ - Haute priorité

#### 1. ✅ Gestion de l'event loop simplifiée

**Problème résolu**: Trois chemins confus supprimés

**Solution implémentée**:
- `start_async()`: Pour contexte async uniquement
- `start_in_thread()`: Pour code synchrone avec thread
- `start()`: Supprimée pour forcer l'intention explicite

**Résultat**: Code clair, pas d'ambiguïté

#### 2. ✅ Timeouts ajoutés

**Solution implémentée**:
```python
# Nouveaux paramètres
connection_timeout=30.0  # Timeout WebRTC
http_timeout=10.0        # Timeout HTTP

# Dans le code
timeout = aiohttp.ClientTimeout(total=self.http_timeout)
async with aiohttp.ClientSession(timeout=timeout) as session:
    ...

# WebRTC connection timeout
if time.time() - connection_start > self.connection_timeout:
    raise TimeoutError("WebRTC connection timeout")
```

**Résultat**: Plus de blocage infini

#### 3. ✅ check_latency thread-safe

**Solution implémentée**:
```python
self._check_latency = False
self._latency_lock = threading.Lock()

@property
def check_latency(self):
    with self._latency_lock:
        return self._check_latency

@check_latency.setter
def check_latency(self, value):
    with self._latency_lock:
        self._check_latency = value
```

**Résultat**: Thread-safe à 100%, pas de race condition

---

### 🟠 Moyenne priorité (à faire)

#### 4. Sauvegarde des timestamps dupliquée

**Problème**:
```python
# Ligne 145: dans _run()
finally:
    if self.host.check_latency and not hasattr(self, '_timestamps_saved'):
        self._save_timestamps()
        self._timestamps_saved = True

# Ligne 198: dans stop()
if self.host.check_latency and not hasattr(self, '_timestamps_saved'):
    self._save_timestamps()
    self._timestamps_saved = True
```

**Impact**: Code dupliqué, risque d'oubli

**Suggestion**:
```python
def __del__(self):
    self._ensure_timestamps_saved()

def _ensure_timestamps_saved(self):
    if self.host.check_latency and not self._timestamps_saved:
        if not self.end_time:
            self.end_time = time.time()
        self._save_timestamps()
        self._timestamps_saved = True
```

#### 5. Validation SDP incomplète

**Problème**:
```python
# Ligne 399-405: Validation post-hoc
if not sdp_to_send.startswith('v=0'):
    print(f"[Host] ⚠️ Invalid SDP format")
if not sdp_to_send.endswith('\r\n'):
    sdp_to_send = sdp_to_send.rstrip() + '\r\n'
```

**Impact**: 
- Correction en production (masque les vrais bugs)
- Pas de validation structurelle

**Suggestion**:
```python
def validate_sdp(self, sdp: str) -> tuple[bool, str]:
    """Returns (is_valid, error_message)"""
    if not sdp.startswith('v=0'):
        return False, "Missing version line"
    if not re.search(r'm=video', sdp):
        return False, "No video media line"
    # ... autres validations
    return True, ""
```

#### 6. Gestion d'erreur incohérente dans le retry

**Problème**:
```python
# Ligne 429-438: Retry seulement si status=500 ET use_patched=True
if use_patched and resp.status == 500:
    # retry avec original
```

**Impact**:
- Autres erreurs (400, 403, 404) ne sont pas gérées
- Le retry n'est pas tenté pour les SDP originaux

**Suggestion**:
```python
async def _send_sdp_with_retry(self, session, sdp_variants):
    """Try multiple SDP variants until one succeeds"""
    for i, (name, sdp) in enumerate(sdp_variants):
        try:
            async with session.post(...) as resp:
                if resp.status in (200, 201):
                    return await resp.text()
                print(f"[Host] Variant '{name}' failed: {resp.status}")
        except Exception as e:
            print(f"[Host] Variant '{name}' error: {e}")
    raise Exception("All SDP variants failed")
```

### 🟢 Basse priorité (optionnel)

#### 7. Paramètres hardcodés

**Problème**:
```python
x-google-start-bitrate=2000  # Ligne 295
x-google-max-bitrate=4000    # Ligne 296
self._queue = asyncio.Queue(maxsize=5)  # Ligne 26
```

**Suggestion**:
```python
def __init__(
    self, ...,
    start_bitrate=2000,
    max_bitrate=4000,
    queue_size=5
):
    self.start_bitrate = start_bitrate
    self.max_bitrate = max_bitrate
    self.queue_size = queue_size
```

#### 8. Logs inconsistants

**Problème**:
- Mélange de niveaux: info (`[Host] Stream started`), warning (`⚠️`), erreur (`❌`)
- Pas de système de logging standard (print directement)
- Difficulté à filtrer ou rediriger les logs

**Suggestion**:
```python
import logging

logger = logging.getLogger(__name__)

class Host:
    def __init__(self, ..., log_level=logging.INFO):
        self.logger = logging.getLogger(f"{__name__}.{id(self)}")
        self.logger.setLevel(log_level)
```

#### 9. Pas de mécanisme de reconnexion

**Problème**:
- Si la connexion WebRTC échoue ou se déconnecte, le Host s'arrête
- Pas de retry automatique

**Suggestion**:
```python
async def _run_stream_with_retry(self, max_retries=3):
    for attempt in range(max_retries):
        try:
            await self._run_stream()
            break  # Success
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt  # Exponential backoff
                self.logger.warning(f"Retry {attempt+1}/{max_retries} in {wait}s")
                await asyncio.sleep(wait)
            else:
                raise
```

---

## Recommandations architecturales

### 1. Séparer les responsabilités

```
host.py
├── stream_track.py      # StreamTrack + génération frames
├── webrtc_client.py     # Connexion WebRTC + WHIP
├── sdp_utils.py         # Patching et validation SDP
└── metrics.py           # Collecte et sauvegarde des métriques
```

### 2. Configuration centralisée

```python
@dataclass
class HostConfig:
    url: str
    stun_url: str
    output: str
    width: int = 640
    height: int = 360
    fps: int = 30
    red_interval: float = 5.0
    token: Optional[str] = None
    start_bitrate: int = 2000
    max_bitrate: int = 4000
    queue_size: int = 5
    connection_timeout: float = 30.0
    retry_attempts: int = 3

class Host:
    def __init__(self, config: HostConfig):
        self.config = config
```

### 3. Interface plus claire

```python
class Host:
    async def __aenter__(self):
        await self.start_async()
        return self
    
    async def __aexit__(self, *args):
        await self.stop()

# Usage:
async with Host(config) as host:
    host.start_check_latency()
    await asyncio.sleep(60)
# Cleanup automatique
```

---

## Résumé des priorités

### ✅ Haute priorité - FAIT
1. ✅ Gestion de l'event loop simplifiée
2. ✅ Timeouts ajoutés (HTTP + WebRTC)
3. ✅ check_latency thread-safe avec lock

### 🟠 Moyenne priorité - À FAIRE
### 🟠 Moyenne priorité - À FAIRE
4. Supprimer la duplication de sauvegarde timestamps
5. Validation SDP avant envoi
6. Améliorer la gestion d'erreur SDP (retry généralisé)

### 🟢 Basse priorité - OPTIONNEL
7. Externaliser les paramètres hardcodés
8. Utiliser un vrai système de logging
9. Ajouter un mécanisme de reconnexion

---

## Exemple d'utilisation

### Mode async
```python
import asyncio
from host import Host

async def main():
    host = Host(
        url="http://localhost:7880/whip",
        stun_url="stun:stun.l.google.com:19302",
        output="./benchmark_output",
        width=640,
        height=360,
        fps=30,
        red_interval=5.0,
        encoding_method="simple",  # ou "diagonal"
        connection_timeout=30.0,
        http_timeout=10.0
    )
    
    # Démarrer le streaming
    task = asyncio.create_task(host.start_async())
    
    # Attendre la connexion
    await asyncio.sleep(2)
    
    # Activer le latency check
    host.start_check_latency()
    
    # Streamer pendant 60 secondes
    await asyncio.sleep(60)
    
    # Arrêter
    host.stop()
    await task

asyncio.run(main())
```

### Mode thread (synchrone)
```python
import time
from host import Host

host = Host(
    url="http://localhost:7880/whip",
    stun_url="stun:stun.l.google.com:19302",
    output="./benchmark_output",
    encoding_method="diagonal",  # avec détection d'erreur
    connection_timeout=30.0,
    http_timeout=10.0
)

# Démarrer dans un thread
thread = host.start_in_thread()

# Attendre la connexion
time.sleep(2)

# Activer le latency check
host.start_check_latency()

# Streamer pendant 60 secondes
time.sleep(60)

# Arrêter
host.stop()

# Attendre la fin du thread
thread.join(timeout=5.0)
```

---

## Conclusion

Le Host est **cohérent et robuste** :

### ✅ Points forts
- ✅ Génération de frames bien implémentée avec timing précis
- ✅ Deux méthodes d'encodage (simple + diagonal avec validation)
- ✅ Optimisations WebRTC pertinentes (VP8 prioritaire, patching SDP)
- ✅ Métriques complètes et détaillées
- ✅ Event loop simplifié et clair
- ✅ Timeouts configurables partout
- ✅ Thread-safe (check_latency avec lock)

### 🟠 Améliorations possibles
- Code dupliqué (sauvegarde timestamps)
- Validation SDP à améliorer
- Système de logging à moderniser
- Reconnexion automatique manquante

**Status actuel** : Prêt pour production avec quelques optimisations possibles.

**Recommandation** : Le Host fonctionne correctement. Les améliorations restantes sont des optimisations de confort, pas des bugs bloquants.
