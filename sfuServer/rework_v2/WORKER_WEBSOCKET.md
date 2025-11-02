# Worker WebSocket - Architecture

## 🎯 Objectifs réalisés

✅ **Suppression du serveur HTTP** : Plus de Flask, tout passe par WebSocket  
✅ **Pool de viewers** : Gestion dynamique avec démarrage/arrêt en batch  
✅ **Messages première frame** : Envoi immédiat au host quand un viewer reçoit sa première frame  
✅ **Détections par batch** : Collecte toutes les 1s et envoi seulement s'il y a des détections  
✅ **Lecture des queues** : Utilise `get_all_detections()` des viewers  
✅ **Reconnexion automatique** : WebSocket avec retry automatique  

## 📡 Messages WebSocket

### Du Worker vers Host

```json
// Connexion du worker
{
  "type": "worker_connected",
  "worker_id": "worker_001", 
  "ip": "192.168.1.218",
  "timestamp": 1234567890.123
}

// Première frame reçue par un viewer
{
  "type": "first_frame_received",
  "worker_id": "worker_001",
  "viewer_id": "worker_001_viewer_1",
  "timestamp": 1234567890.123
}

// Batch de détections (toutes les 1s si détections)
{
  "type": "detections",
  "worker_id": "worker_001", 
  "timestamp": 1234567890.123,
  "count": 5,
  "detections": [
    {
      "viewer_id": "worker_001_viewer_1",
      "sequence_number": 42,
      "is_valid": true,
      "timestamp": 1234567890.123,
      "relative_time": 5.123,
      "frame_number": 150,
      "encoding_method": "simple"
    }
  ]
}

// Statut du worker
{
  "type": "worker_status",
  "worker_id": "worker_001",
  "timestamp": 1234567890.123, 
  "viewers_count": 3,
  "viewers": {
    "worker_001_viewer_1": {
      "connected": true,
      "running": true,
      "frame_count": 1500,
      "red_detections": 25,
      "queue_size": 2
    }
  }
}
```

### Du Host vers Worker

```json
// Démarrer des viewers  
{
  "type": "start_viewers",
  "count": 3,
  "config": {
    "url": "http://localhost:7880/whep",
    "encoding_method": "simple"
  }
}

// Arrêter tous les viewers
{
  "type": "stop_viewers"
}

// Demander le statut
{
  "type": "get_status"
}

// Ping
{
  "type": "ping"
}
```

## 🏗️ Architecture

```
                    WebSocket
┌─────────────┐ ◄──────────────► ┌─────────────┐
│    Host     │    Messages      │   Worker    │
│ (+ Server)  │                  │             │
└─────────────┘                  │ ┌─────────┐ │
                                 │ │Viewer 1 │ │  
                                 │ └─────────┘ │
                                 │ ┌─────────┐ │
                                 │ │Viewer 2 │ │
                                 │ └─────────┘ │ 
                                 │ ┌─────────┐ │
                                 │ │Viewer 3 │ │
                                 │ └─────────┘ │
                                 └─────────────┘
```

## 🔧 Utilisation

```bash
# Démarrer le worker
python3 worker.py --host-ws ws://localhost:8080 --worker-id worker_001

# Le worker va :
# 1. Se connecter au host WebSocket
# 2. Attendre les commandes (start_viewers, stop_viewers) 
# 3. Gérer sa pool de viewers automatiquement
# 4. Envoyer les premières frames immédiatement
# 5. Envoyer les détections par batch toutes les 1s
```

## 🎮 Fonctionnalités clés

- **Auto-reconnexion** : Si la connexion WebSocket tombe, retry automatique
- **Pool management** : Démarrage/arrêt de tous les viewers ensemble 
- **No empty batches** : N'envoie de batch que s'il y a des détections
- **Thread-safe queues** : Utilise les queues thread-safe des viewers
- **Identification** : Worker s'identifie avec IP et worker_id
- **Error handling** : Gestion propre des erreurs et notifications au host

## ⚡ Performance

- **Batch interval** : 1s (configurable)
- **Queue size** : 100 détections par viewer (configurable)  
- **Reconnect interval** : 5s (configurable)
- **Non-blocking** : Drop des messages si WebSocket indisponible

Le worker est maintenant **ready for production** ! 🚀