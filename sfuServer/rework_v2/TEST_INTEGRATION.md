# 🧪 Test d'Intégration Complète - Benchmark WebSocket Local

## 📋 Prérequis

1. **SFU Server en local** (mediasoup ou Pion)
2. **3 terminaux** ouverts dans `/home/titouan/PAE/ochocast-webapp/sfuServer/rework_v2/`

---

## 🚀 Étapes de Test

### 1. Terminal 1 - Démarrer le SFU (si pas déjà fait)
```bash
# Si tu as un SFU Go (Pion)
cd /home/titouan/PAE/ochocast-webapp/sfuServer
./server

# Ou si tu utilises le serveur existant
# (vérifier qu'il tourne sur http://localhost:7880)
```

### 2. Terminal 2 - Démarrer le Controller
```bash
cd /home/titouan/PAE/ochocast-webapp/sfuServer/rework_v2

# Lancer le controller avec la config simple
python3 controller.py --config config_simple.yaml

# Le controller va :
# ✅ Démarrer le serveur WebSocket sur :8080
# ⏳ Attendre la connexion des workers
```

### 3. Terminal 3 - Démarrer le Premier Worker
```bash
cd /home/titouan/PAE/ochocast-webapp/sfuServer/rework_v2

# Démarrer le worker 1
python3 worker.py --host-ws ws://localhost:8080 --worker-id worker_local_1

# Le worker va :
# ✅ Se connecter au controller
# ⏳ Attendre les commandes de démarrage des viewers
```

### 4. Terminal 4 (optionnel) - Deuxième Worker  
```bash
cd /home/titouan/PAE/ochocast-webapp/sfuServer/rework_v2

# Démarrer le worker 2 pour tester la distribution
python3 worker.py --host-ws ws://localhost:8080 --worker-id worker_local_2
```

---

## 🎯 Séquence Automatique Attendue

### 1. Controller démarre (Terminal 2)
```
🧠 Benchmark Controller
📁 Config: config_simple.yaml
[Controller] 🧠 Initialized benchmark bench_20241102_HHMMSS
[Controller] 🔌 Starting WebSocket server on 0.0.0.0:8080
[Controller] ✅ WebSocket server started on ws://0.0.0.0:8080
[Controller] ⏳ Waiting for workers to connect...
```

### 2. Worker se connecte (Terminal 3)
```
[Worker worker_local_1] 🚀 Initialized
[Worker worker_local_1] 🔌 Connecting to ws://localhost:8080
[Worker worker_local_1] ✅ Connected to host
```

**Controller reçoit :**
```
[Controller] 🤖 Worker worker_local_1 connected from 192.168.1.XXX
[Controller] ✅ 1 worker(s) connected
```

### 3. Controller démarre le Host
```
[Controller] 🎥 Starting host...
[Host] 🚀 Starting stream (640x360 @ 30fps)
[Host] 🔌 Connecting to http://localhost:7880/whip
[Host] ✅ WebRTC connection established
[Controller] ✅ Host started
```

### 4. Controller démarre les Viewers
```
[Controller] 🚀 Starting viewers on 1 workers...
[Controller] 📤 Sent start command to worker_local_1 (6 viewers)
```

**Worker reçoit et traite :**
```
[Worker worker_local_1] 🎬 Starting 6 viewers
[Worker worker_local_1] ✅ Started viewer worker_local_1_viewer_1
[Worker worker_local_1] ✅ Started viewer worker_local_1_viewer_2
...
[Worker worker_local_1] 📦 Starting detection batch loop (interval: 1.0s)
```

### 5. Première Frame reçue
```
[Worker worker_local_1] 🎯 First frame received by worker_local_1_viewer_1
[Controller] 🎯 First frame received! Starting red frames...
[Host] 🔴 Red frame check enabled
```

### 6. Benchmark actif
```
[Controller] ⏰ Running benchmark for 60 seconds...
[Worker worker_local_1] 📊 Sent batch of 3 detections
[Controller] 📊 Saved 3 detections from worker_local_1
```

---

## 🔍 Vérifications Pendant le Test

### Fichiers créés
```bash
# Dans un 5ème terminal
cd /home/titouan/PAE/ochocast-webapp/sfuServer/rework_v2

# Vérifier la structure des résultats
ls -la benchmark_results/
# Doit montrer :
# benchmark_info.json
# worker_local_1/
# host_timestamps.json (après première frame rouge)

# Vérifier les détections
ls -la benchmark_results/worker_local_1/
# Doit montrer des fichiers detections_*.json

# Voir le contenu en temps réel
tail -f benchmark_results/benchmark_info.json
```

### WebSocket actif
```bash
# Tester la connexion WebSocket manuellement
curl -I http://localhost:8080
# Ou avec un client WebSocket si disponible
```

---

## 🛑 Arrêt Propre

### Dans le Terminal Controller (Terminal 2)
```bash
# Ctrl+C pour arrêter le benchmark
^C
[Controller] 🛑 Interrupted by user
[Controller] 🛑 Stopping benchmark...
[Controller] 📤 Sent stop command to worker_local_1
[Controller] 🛑 Stopping host...
[Controller] ✅ Benchmark stopped. Results in ./benchmark_results/
```

### Workers s'arrêtent automatiquement
```bash
[Worker worker_local_1] 🛑 Stopping all viewers
[Worker worker_local_1] ✅ Stopped viewer worker_local_1_viewer_1
...
[Worker worker_local_1] 🔌 Connection closed by host
```

---

## 📊 Résultats Attendus

### Structure finale
```
benchmark_results/
├── benchmark_info.json          # Info complète
├── host_timestamps.json         # Frames rouges du host  
└── worker_local_1/             # Détections du worker
    ├── detections_1730574891.json
    ├── detections_1730574892.json
    └── ...
```

### Métriques typiques (après 60s)
- **Host** : ~1800 frames générées, ~60 frames rouges
- **Viewers** : ~6 viewers × ~60 détections = ~360 détections total
- **Fichiers** : ~60 fichiers de détections (1 par seconde par worker)

---

## 🚨 Dépannage

### SFU pas accessible
```bash
# Vérifier que le SFU répond
curl http://localhost:7880/whip
# Doit retourner une erreur HTTP (pas de connexion refusée)
```

### Worker ne se connecte pas
```bash
# Vérifier que le controller écoute
netstat -tlnp | grep 8080
# Doit montrer python3 qui écoute sur :8080
```

### Pas de détections
```bash
# Vérifier les logs du worker pour les erreurs WebRTC
# Vérifier que les frames rouges sont générées par le host
```

---

## 🎯 Commandes de Test Rapide

### Test Minimal (1 worker)
```bash
# Terminal 1
python3 controller.py --config config_simple.yaml

# Terminal 2  
python3 worker.py --host-ws ws://localhost:8080 --worker-id test_worker

# Attendre ~30s puis Ctrl+C dans le controller
```

### Test Complet (2 workers)
```bash
# Terminal 1
python3 controller.py --config config_simple.yaml

# Terminal 2
python3 worker.py --host-ws ws://localhost:8080 --worker-id worker_1

# Terminal 3
python3 worker.py --host-ws ws://localhost:8080 --worker-id worker_2

# Laisser tourner 60s complet
```

Prêt pour le test ! 🚀