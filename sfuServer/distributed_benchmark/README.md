# Benchmark Distribué WebRTC

Système de benchmark distribué pour tester les performances d'un serveur SFU (Selective Forwarding Unit) WebRTC avec des viewers répartis sur plusieurs machines.

## 🎯 Nouveau : Système de Reporting WebSocket

**✨ Version 2.0 avec reporting en temps réel !**

Le système intègre maintenant un reporting WebSocket pour :
- 🔴 **Détections de frames rouges** envoyées **immédiatement**
- 📊 **Métriques système** (CPU, RAM, réseau) collectées toutes les **5 secondes**
- 💾 **Sauvegarde automatique** à la fin et en cas de crash
- 🔄 **Reconnexion automatique** des workers

� **[Guide complet du WebSocket](WEBSOCKET_REPORTING.md)**  
👉 **[Démarrage rapide](QUICKSTART.md)**

## �📋 Architecture

Le système est composé de 3 éléments principaux :

1. **Controller** : Machine centrale qui orchestre le benchmark
   - Lance le host (streamer)
   - **🆕 Serveur WebSocket** (port 9000) pour recevoir les données en temps réel
   - Synchronise le démarrage
   - Distribue les viewers sur les workers
   - Collecte les métriques
   - Génère les rapports

2. **Workers** : Machines distantes qui exécutent les viewers
   - Reçoivent les commandes du controller via HTTP
   - **🆕 Client WebSocket** pour envoyer données au controller
   - **🆕 Collecteur de métriques système** (CPU, RAM, réseau)
   - Lancent les viewers WebRTC
   - Envoient les détections et métriques en temps réel

3. **Host** : Streamer vidéo (lancé sur la machine controller)
   - Génère un flux vidéo avec des frames rouges périodiques
   - Mesure la latence via ces frames rouges

### 🌐 Architecture WebSocket

```
┌─────────────────────────────────────────┐
│         CONTROLLER (port 9000)          │
│    📡 WebSocket Server (push model)     │
│    💾 Stockage viewer_detections/       │
│    💾 Stockage worker_metrics/          │
└─────────────────────────────────────────┘
           ▲              ▲
           │              │
    WebSocket (WS)   WebSocket (WS)
           │              │
    ┌──────┴──────┐  ┌───┴────────┐
    │  WORKER 1   │  │  WORKER 2  │
    │ - Viewers   │  │ - Viewers  │
    │ - Métriques │  │ - Métriques│
    │ - WS Client │  │ - WS Client│
    └─────────────┘  └────────────┘
```

## 🚀 Installation

### Sur toutes les machines (Controller + Workers)

```bash
# Cloner le repository
cd sfuServer/distributed_benchmark

# Installer les dépendances Python
pip install -r requirements.txt
```

### Vérifier l'installation

```bash
python test_websocket_setup.py
```

Vous devriez voir :
```
🎉 Tous les tests sont passés!
```

## ⚙️ Configuration

Éditer le fichier `config.yaml` :

```yaml
# Liste des workers
workers:
  - ip: "10.0.0.2"
    port: 8080
    enabled: true
  - ip: "10.0.0.3"
    port: 8080
    enabled: true

# Configuration du serveur SFU
sfu:
  url: "http://localhost:8090"
  whip_endpoint: "/whip"
  viewer_endpoint: "/viewer"

# Configuration du benchmark
benchmark:
  total_viewers: 100      # Nombre total de viewers à distribuer
  duration: 300           # Durée du test en secondes
  red_interval: 3.0       # Intervalle entre les frames rouges
  
# Dossier de sortie des résultats
metrics:
  output_dir: "./distributed_benchmark_data"
```

## 📝 Utilisation

### Étape 1 : Démarrer les workers sur chaque machine distante

Sur chaque machine worker :

```bash
cd sfuServer/distributed_benchmark
python worker.py --port 8080
```

Vous devriez voir :
```
================================================================================
🚀 Distributed Benchmark Worker
================================================================================
Listening on 0.0.0.0:8080
Ready to receive viewer tasks from controller
================================================================================
```

### Étape 2 : Démarrer le serveur SFU

Sur la machine qui héberge le SFU :

```bash
# Exemple pour un serveur Go
cd sfuServer
go run main.go
```

### Étape 3 : Lancer le benchmark depuis le controller

Sur la machine controller :

```bash
cd sfuServer/distributed_benchmark
python controller.py --config config.yaml
```

Le controller va :
1. ✅ Vérifier que tous les workers sont disponibles
2. ⏰ Vérifier la synchronisation temporelle (NTP)
3. 📊 Calculer la distribution des viewers
4. 🎥 Démarrer le host (streamer)
5. 🚀 Démarrer les viewers sur les workers
6. 🔴 Démarrer le test de latence
7. 📊 Monitorer en temps réel
8. 💾 Collecter les résultats

### Étape 4 : Analyser les résultats

Après le test, analyser les données :

```bash
python analyse_distributed.py ./distributed_benchmark_data ./analysis_results
```

Cela génère :
- 📊 Graphiques de latence par viewer
- 📈 Latence moyenne et timeline
- 📉 Performance par worker
- 📝 Rapports détaillés (TXT)
- 🔍 Analyse des erreurs

## 📁 Structure des fichiers

```
distributed_benchmark/
├── config.yaml                 # Configuration du benchmark
├── controller.py               # Script principal (machine controller)
├── worker.py                   # Script worker (machines distantes)
├── viewer_distributed.py       # Viewer adapté pour le distribué
├── analyse_distributed.py      # Script d'analyse des résultats
├── requirements.txt            # Dépendances Python
├── README.md                   # Ce fichier
├── utils/
│   ├── communication.py        # Communication HTTP controller-worker
│   └── metrics.py              # Collecte et agrégation des métriques
└── distributed_benchmark_data/ # Dossier des résultats (créé automatiquement)
    ├── host_timestamps.json
    ├── viewer_1_timestamps.json
    ├── viewer_2_timestamps.json
    ├── ...
    ├── test_report.json
    └── metrics_history.json
```

## 🔧 Troubleshooting

### Les workers ne sont pas accessibles

```bash
# Sur le worker, vérifier que le port est ouvert
netstat -tuln | grep 8080

# Tester la connexion depuis le controller
curl http://<worker_ip>:8080/ping
```

### Problème de synchronisation temporelle

Les machines doivent être synchronisées avec NTP :

```bash
# Installer NTP
sudo apt-get install ntp

# Vérifier la synchronisation
ntpq -p

# Forcer la synchronisation
sudo ntpdate -u pool.ntp.org
```

### Erreur "Import could not be resolved"

Les erreurs Pylance dans VS Code sont normales si les dépendances ne sont pas installées dans l'environnement Python actif. Le code fonctionnera correctement une fois les dépendances installées.

### Les viewers ne se connectent pas

1. Vérifier que le serveur SFU est démarré et accessible
2. Vérifier l'URL dans `config.yaml`
3. Vérifier les logs des workers pour les erreurs WebRTC

### Latences très élevées

1. Vérifier la bande passante réseau entre workers et SFU
2. Vérifier la charge CPU sur le serveur SFU
3. Réduire le nombre de viewers par worker

## 📊 Métriques collectées

- **Latence end-to-end** : Temps entre l'envoi d'une frame rouge par le host et sa réception par chaque viewer
- **Taux de connexion** : Pourcentage de viewers qui se sont connectés avec succès
- **Frames manquantes** : Frames rouges non détectées par certains viewers
- **Frames dupliquées** : Détections multiples d'une même frame
- **Précision du timing** : Écart temporel entre les envois de frames rouges côté host

## 🔄 Différences avec le benchmark original

| Aspect | Original | Distribué |
|--------|----------|-----------|
| Déploiement | Tout sur une machine | Host + Controller + Workers distants |
| Scalabilité | Limitée par une machine | Distribué sur N machines |
| Synchronisation | Thread local | HTTP + vérification NTP |
| Collecte | Locale | Centralisée sur controller |
| Configuration | Arguments CLI | Fichier YAML |

## 🎯 Cas d'usage

- **Test de montée en charge** : Tester 100, 200, 500+ viewers simultanés
- **Test de latence** : Mesurer la latence end-to-end sous charge
- **Test de résilience** : Vérifier le comportement avec des viewers distribués géographiquement
- **Benchmarking** : Comparer différentes configurations SFU

## 🤝 Contribution

Pour améliorer ce benchmark :

1. Ajouter des métriques supplémentaires (CPU, RAM, réseau)
2. Support WebSocket pour monitoring temps réel
3. Interface web pour visualisation
4. Support de différents codecs (H264, VP9, AV1)

## 📝 License

Voir le fichier LICENSE du projet parent.
