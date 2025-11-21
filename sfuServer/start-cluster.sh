#!/bin/bash

# Script pour lancer plusieurs instances SFU en cluster local
# Usage: ./start-cluster.sh [nombre_de_serveurs]

NUM_SERVERS=${1:-3}
BASE_PORT=8090

echo "🚀 Démarrage de $NUM_SERVERS serveurs SFU en cluster..."
echo ""

# Arrêter les serveurs existants
pkill -f "whip-server" 2>/dev/null
sleep 1

# Compiler le serveur
echo "📦 Compilation du serveur..."
go build -o whip-server
if [ $? -ne 0 ]; then
    echo "❌ Erreur de compilation"
    exit 1
fi
echo "✅ Compilation réussie"
echo ""

# Créer les fichiers .env pour chaque serveur
for i in $(seq 0 $(($NUM_SERVERS - 1))); do
    PORT=$((BASE_PORT + i))
    ENV_FILE=".env.sfu$((i + 1))"
    
    # Construire la liste des peers (tous les autres serveurs)
    PEERS=""
    for j in $(seq 0 $(($NUM_SERVERS - 1))); do
        if [ $i -ne $j ]; then
            PEER_PORT=$((BASE_PORT + j))
            if [ -z "$PEERS" ]; then
                PEERS="http://localhost:$PEER_PORT"
            else
                PEERS="$PEERS,http://localhost:$PEER_PORT"
            fi
        fi
    done
    
    cat > "$ENV_FILE" << EOF
SERVER_URL=http://localhost:$PORT
SERVER_PORT=$PORT
PEER_SFU_URLS=$PEERS
SFU_MODE=hybrid
CASCADE_AUTH_KEY=dev-cluster-secret-key
EOF
    
    echo "📝 Créé $ENV_FILE pour SFU$((i + 1)) sur port $PORT"
done

echo ""
echo "🎬 Lancement des serveurs..."
echo ""

# Lancer chaque serveur dans un terminal séparé (tmux ou en arrière-plan)
for i in $(seq 0 $(($NUM_SERVERS - 1))); do
    PORT=$((BASE_PORT + i))
    ENV_FILE=".env.sfu$((i + 1))"
    LOG_FILE="sfu$((i + 1)).log"
    
    # Copier le .env pour ce serveur
    cp "$ENV_FILE" .env
    
    # Lancer le serveur en arrière-plan
    ./whip-server > "$LOG_FILE" 2>&1 &
    PID=$!
    
    echo "✅ SFU$((i + 1)) démarré (PID: $PID, Port: $PORT, Log: $LOG_FILE)"
    
    # Attendre un peu avant de lancer le suivant
    sleep 0.5
done

echo ""
echo "🎉 Cluster de $NUM_SERVERS serveurs SFU démarré !"
echo ""
echo "📊 État du cluster:"
echo "  - Ports: $BASE_PORT-$((BASE_PORT + NUM_SERVERS - 1))"
echo "  - Logs: sfu1.log, sfu2.log, ..."
echo "  - Mode: hybrid"
echo ""
echo "🔍 Commandes utiles:"
echo "  - Voir les logs: tail -f sfu1.log"
echo "  - Arrêter le cluster: pkill -f whip-server"
echo "  - Vérifier les processus: ps aux | grep whip-server"
echo ""
