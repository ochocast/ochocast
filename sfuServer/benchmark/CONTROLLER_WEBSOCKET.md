# Controller WebSocket - Architecture Simple et Cohérente

## 🎯 Controller : Le Cerveau du Système

### ✅ Rework Réalisé

- **Suppression de la verbosité** : Code simplifié, messages clairs avec emojis
- **Architecture cohérente** : WebSocket server intégré, gestion Host comme objet
- **Sauvegarde intelligente** : Fichier unique pour host+workers, dossiers séparés pour détections
- **Flow automatisé** : Attendre première frame → démarrer frames rouges → benchmark
- **Configuration simplifiée** : YAML propre, moins de paramètres

## 🏗️ Architecture Finale

```
┌─────────────────────┐
│    Controller       │
│  (Cerveau central)  │
│                     │
│  ┌───────────────┐  │    WebSocket     ┌─────────────┐
│  │     Host      │  │ ◄──────────────► │   Worker 1  │
│  │   (objet)     │  │    Messages      │             │
│  └───────────────┘  │                  │ ┌─────────┐ │
│                     │                  │ │Viewer 1 │ │
│  ┌───────────────┐  │                  │ │Viewer 2 │ │
│  │ WebSocket     │  │                  │ └─────────┘ │
│  │ Server        │  │                  └─────────────┘
│  │ :8080         │  │
│  └───────────────┘  │    WebSocket     ┌─────────────┐
│                     │ ◄──────────────► │   Worker 2  │
└─────────────────────┘    Messages      │             │
                                         │ ┌─────────┐ │
                                         │ │Viewer 3 │ │
                                         │ │Viewer 4 │ │
                                         │ └─────────┘ │
                                         └─────────────┘
```

## 📡 Messages WebSocket Implémentés

### Worker → Controller

```json
// Worker se connecte
{
  "type": "worker_connected",
  "worker_id": "worker_001",
  "ip": "192.168.1.100"
}

// Premier viewer reçoit une frame
{
  "type": "first_frame_received", 
  "worker_id": "worker_001",
  "viewer_id": "worker_001_viewer_1"
}

// Batch de détections
{
  "type": "detections",
  "worker_id": "worker_001",
  "timestamp": 1234567890.123,
  "count": 5,
  "detections": [...]
}

// Confirmation de démarrage
{
  "type": "viewers_started",
  "worker_id": "worker_001", 
  "viewers": ["worker_001_viewer_1", "worker_001_viewer_2"]
}
```

### Controller → Worker

```json
// Démarrer des viewers
{
  "type": "start_viewers",
  "count": 3,
  "config": {
    "url": "http://localhost:7880/whep",
    "stun_url": "stun:stun.l.google.com:19302",
    "encoding_method": "simple"
  }
}

// Arrêter tous les viewers  
{
  "type": "stop_viewers"
}
```

## 📁 Structure des Fichiers de Sauvegarde

### Fichier Principal : `benchmark_info.json`

```json
{
  "benchmark_id": "bench_20251102_212159",
  "start_time": 1234567890.123,
  "end_time": 1234567950.456, 
  "status": "running",
  "config": { ... },
  "timestamp": 1234567890.123,
  "benchmark_running": true,
  "first_frame_received": true,
  "benchmark_start_time": 1234567892.789,
  "host_status": {
    "running": true,
    "check_latency": true
  },
  "workers": {
    "worker_001": {
      "ip": "192.168.1.100", 
      "connected_at": 1234567890.0,
      "viewers_count": 3,
      "status": "connected",
      "last_ping": null
    }
  }
}
```

### Dossiers des Détections

```
benchmark_results/
├── benchmark_info.json          # Info générale
├── worker_001/                  # Dossier par worker
│   ├── detections_1234567891.json
│   ├── detections_1234567892.json
│   └── detections_1234567893.json
├── worker_002/
│   ├── detections_1234567891.json
│   └── detections_1234567892.json
└── host_timestamps.json         # Timestamps du host (auto-généré)
```

### Fichier de Détections : `detections_{timestamp}.json`

```json
{
  "worker_id": "worker_001",
  "timestamp": 1234567891.123,
  "count": 5,
  "detections": [
    {
      "viewer_id": "worker_001_viewer_1",
      "sequence_number": 42,
      "is_valid": true,
      "timestamp": 1234567891.123,
      "relative_time": 5.123,
      "frame_number": 150,
      "encoding_method": "simple"
    }
  ]
}
```

## ⚙️ Configuration Simple

### `config_simple.yaml`

```yaml
# Configuration du serveur SFU  
sfu:
  url: "http://localhost:7880"
  whip_endpoint: "/whip"
  viewer_endpoint: "/whep" 
  stun_url: "stun:stun.l.google.com:19302"

# Configuration du benchmark
benchmark:
  total_viewers: 6               # Répartis entre workers
  duration: 60                   # Secondes après première frame
  red_interval: 1.0              # Frames rouges toutes les 1s
  
  host:
    width: 640
    height: 360
    fps: 30
    token: null

# Sauvegarde
metrics:
  output_dir: "./benchmark_results"
```

## 🎮 Flow du Benchmark

### 1. Démarrage
```bash
python3 controller.py --config config_simple.yaml
```

### 2. Séquence Automatique
1. **Controller démarre** → Serveur WebSocket sur :8080
2. **Workers se connectent** → Identification automatique
3. **Host démarre** → Objet Host créé et lancé
4. **Viewers démarrent** → Commande envoyée à tous les workers
5. **Attente première frame** → Trigger automatique des frames rouges
6. **Benchmark actif** → Collecte des détections pendant `duration` 
7. **Arrêt propre** → Host + Workers + Sauvegarde finale

### 3. Gestion des Workers
- **Connexion** : Auto-identification avec IP
- **Distribution** : Répartition équitable des viewers
- **Reconnexion** : Worker peut se reconnecter automatiquement
- **Erreurs** : Status trackés ("connected", "disconnected", "error")

### 4. Sauvegarde Continue
- **Périodique** : `benchmark_info.json` mis à jour toutes les 5s
- **Détections** : Fichier séparé par batch et par worker
- **Host timestamps** : Auto-généré par l'objet Host

## 🔧 API du Controller

### Classe `BenchmarkController`

```python
# Création
controller = BenchmarkController("config.yaml")

# Lancement du benchmark complet
await controller.run_benchmark()

# Méthodes principales
await controller.start_websocket_server()  # Server WS
await controller.start_host()              # Objet Host
await controller.start_viewers_on_workers() # Commande workers
await controller.stop_benchmark()          # Arrêt propre
```

### Classe `WorkerInfo`

```python
@dataclass 
class WorkerInfo:
    worker_id: str
    ip: str
    connected_at: float
    websocket: object
    viewers_count: int = 0
    status: str = "connected" 
    last_ping: Optional[float] = None
```

## ✨ Points Forts

### ✅ 1. Simplicité et Cohérence
- **Une responsabilité par composant** : Controller = orchestration, Host = streaming, Worker = pool viewers
- **Messages clairs** : Emojis + logs explicites
- **Configuration simple** : Minimum de paramètres nécessaires

### ✅ 2. Architecture Solide  
- **WebSocket intégré** : Pas de dépendance externe
- **Host comme objet** : Contrôle total du lifecycle
- **Sauvegarde intelligente** : Structure claire, pas de duplication

### ✅ 3. Flow Automatisé
- **Trigger première frame** : Démarrage automatique des frames rouges
- **Distribution automatique** : Répartition équitable des viewers
- **Arrêt propre** : Cleanup complet en cas d'interruption

### ✅ 4. Robustesse
- **Reconnexion workers** : Gestion des déconnexions
- **Sauvegarde continue** : Pas de perte de données
- **Error handling** : Status tracking et logs d'erreur

## 🚀 Utilisation

### Démarrage Simple

```bash
# Terminal 1: Controller
python3 controller.py --config config_simple.yaml

# Terminal 2: Worker 1  
python3 worker.py --host-ws ws://localhost:8080 --worker-id worker_001

# Terminal 3: Worker 2
python3 worker.py --host-ws ws://localhost:8080 --worker-id worker_002
```

### Résultats

```
benchmark_results/
├── benchmark_info.json      # État complet du benchmark
├── host_timestamps.json     # Timestamps des frames rouges
├── worker_001/              # Détections du worker 1
│   └── detections_*.json
└── worker_002/              # Détections du worker 2  
    └── detections_*.json
```

**Le Controller est maintenant simple, cohérent et prêt pour production !** 🎯