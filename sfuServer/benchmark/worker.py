#!/usr/bin/env python3
"""
Worker pour le benchmark distribué WebSocket.
Gère une pool de viewers et communique avec le host via WebSocket.

Usage:
    python worker.py --host-ws ws://localhost:8080 --worker-id worker_001
"""
import asyncio
import argparse
import time
import json
import sys
import os
import socket
import threading
from typing import Dict, List, Optional

try:
    import websockets
except ImportError:
    print("❌ websockets package not found. Install with: pip install websockets")
    sys.exit(1)

# Ajouter le chemin pour importer les modules locaux  
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from viewer import DistributedViewer


class WorkerManager:
    """Gestionnaire des viewers sur un worker avec communication WebSocket"""
    
    def __init__(self, worker_id: str, host_ws_url: str):
        self.worker_id = worker_id
        self.host_ws_url = host_ws_url
        self.viewers: Dict[str, DistributedViewer] = {}
        self.viewer_tasks: Dict[str, asyncio.Task] = {}
        
        # WebSocket vers le host
        self.websocket = None
        self.ws_connected = False
        self.reconnect_interval = 5.0
        
        # Configuration par défaut des viewers
        self.default_config = {
            "url": "http://localhost:7880/whep",
            "stun_url": "stun:stun.l.google.com:19302", 
            "encoding_method": "simple",
            "detection_queue_size": 100
        }
        
        # Batch processing pour les détections
        self.batch_interval = 1.0  # Envoyer les détections toutes les 1s
        self.detection_batch_task = None
        self.running = False
        
        # Tracking des premières frames
        self.first_frame_sent: Dict[str, bool] = {}
        
        print(f"[Worker {self.worker_id}] 🚀 Initialized")
    
    async def connect_to_host(self):
        """Connexion WebSocket au host avec reconnexion automatique"""
        while self.running:
            try:
                print(f"[Worker {self.worker_id}] 🔌 Connecting to {self.host_ws_url}")
                
                async with websockets.connect(self.host_ws_url) as websocket:
                    self.websocket = websocket
                    self.ws_connected = True
                    print(f"[Worker {self.worker_id}] ✅ Connected to host")
                    
                    # Envoyer identification
                    await self.send_message({
                        "type": "worker_connected",
                        "worker_id": self.worker_id,
                        "ip": self.get_local_ip(),
                        "timestamp": time.time()
                    })
                    
                    # Écouter les messages du host
                    await self.listen_to_host()
                    
            except Exception as e:
                print(f"[Worker {self.worker_id}] ❌ Connection error: {e}")
                self.ws_connected = False
                self.websocket = None
                
                if self.running:
                    print(f"[Worker {self.worker_id}] 🔄 Reconnecting in {self.reconnect_interval}s")
                    await asyncio.sleep(self.reconnect_interval)
    
    async def listen_to_host(self):
        """Écoute les messages du host"""
        try:
            async for message in self.websocket:
                data = json.loads(message)
                await self.handle_host_message(data)
        except websockets.exceptions.ConnectionClosed:
            print(f"[Worker {self.worker_id}] 🔌 Connection closed by host")
        except Exception as e:
            print(f"[Worker {self.worker_id}] ❌ Listen error: {e}")
    
    async def handle_host_message(self, data: dict):
        """Traite les messages reçus du host"""
        msg_type = data.get("type")
        
        if msg_type == "start_viewers":
            await self.start_viewers_from_command(data)
        elif msg_type == "stop_viewers":
            await self.stop_all_viewers()
        elif msg_type == "get_status":
            await self.send_status()
        elif msg_type == "ping":
            await self.send_message({"type": "pong", "timestamp": time.time()})
        else:
            print(f"[Worker {self.worker_id}] ⚠️  Unknown message type: {msg_type}")
    
    async def start_viewers_from_command(self, data: dict):
        """Démarre les viewers selon la commande reçue"""
        try:
            count = data.get("count", 1)
            config = {**self.default_config, **data.get("config", {})}
            
            print(f"[Worker {self.worker_id}] 🎬 Starting {count} viewers")
            
            # Démarrer les viewers
            started_viewers = []
            for i in range(count):
                viewer_id = f"{self.worker_id}_viewer_{i+1}"
                
                if viewer_id in self.viewers:
                    print(f"[Worker {self.worker_id}] ⚠️  Viewer {viewer_id} already exists")
                    continue
                
                # Créer le viewer
                viewer = DistributedViewer(
                    viewer_id=viewer_id,
                    url=config["url"],
                    stun_url=config["stun_url"],
                    encoding_method=config["encoding_method"],
                    detection_queue_size=config["detection_queue_size"]
                )
                
                self.viewers[viewer_id] = viewer
                self.first_frame_sent[viewer_id] = False
                
                # Démarrer le viewer
                task = asyncio.create_task(viewer.run())
                self.viewer_tasks[viewer_id] = task
                
                started_viewers.append(viewer_id)
                print(f"[Worker {self.worker_id}] ✅ Started viewer {viewer_id}")
            
            # Confirmer le démarrage
            await self.send_message({
                "type": "viewers_started",
                "worker_id": self.worker_id,
                "viewers": started_viewers,
                "timestamp": time.time()
            })
            
            # Démarrer le batch processing si pas déjà fait
            if self.detection_batch_task is None or self.detection_batch_task.done():
                self.detection_batch_task = asyncio.create_task(self.detection_batch_loop())
        
        except Exception as e:
            print(f"[Worker {self.worker_id}] ❌ Error starting viewers: {e}")
            await self.send_message({
                "type": "error",
                "worker_id": self.worker_id,
                "message": f"Failed to start viewers: {e}",
                "timestamp": time.time()
            })
    
    async def stop_all_viewers(self):
        """Arrête tous les viewers"""
        print(f"[Worker {self.worker_id}] 🛑 Stopping all viewers")
        
        stopped_viewers = []
        for viewer_id, viewer in self.viewers.items():
            try:
                await viewer.stop()
                
                # Annuler la tâche
                if viewer_id in self.viewer_tasks:
                    task = self.viewer_tasks[viewer_id]
                    if not task.done():
                        task.cancel()
                        try:
                            await task
                        except asyncio.CancelledError:
                            pass
                    del self.viewer_tasks[viewer_id]
                
                stopped_viewers.append(viewer_id)
                print(f"[Worker {self.worker_id}] ✅ Stopped viewer {viewer_id}")
                
            except Exception as e:
                print(f"[Worker {self.worker_id}] ❌ Error stopping viewer {viewer_id}: {e}")
        
        # Nettoyer
        self.viewers.clear()
        self.first_frame_sent.clear()
        
        # Arrêter le batch processing
        if self.detection_batch_task and not self.detection_batch_task.done():
            self.detection_batch_task.cancel()
        
        # Confirmer l'arrêt
        await self.send_message({
            "type": "viewers_stopped", 
            "worker_id": self.worker_id,
            "viewers": stopped_viewers,
            "timestamp": time.time()
        })
    
    async def detection_batch_loop(self):
        """Boucle qui collecte et envoie les détections par batch"""
        print(f"[Worker {self.worker_id}] 📦 Starting detection batch loop (interval: {self.batch_interval}s)")
        
        try:
            while self.running and self.viewers:
                await asyncio.sleep(self.batch_interval)
                
                # Vérifier les premières frames
                await self.check_first_frames()
                
                # Collecter toutes les détections
                detections = []
                for viewer_id, viewer in self.viewers.items():
                    # Récupérer toutes les détections en attente
                    viewer_detections = viewer.get_all_detections()
                    detections.extend(viewer_detections)
                
                # Envoyer le batch s'il y a des détections
                if detections:
                    await self.send_detections_batch(detections)
                
        except asyncio.CancelledError:
            print(f"[Worker {self.worker_id}] 📦 Detection batch loop cancelled")
        except Exception as e:
            print(f"[Worker {self.worker_id}] ❌ Error in detection batch loop: {e}")
    
    async def check_first_frames(self):
        """Vérifie si des viewers ont reçu leur première frame"""
        for viewer_id, viewer in self.viewers.items():
            if not self.first_frame_sent.get(viewer_id, False):
                status = viewer.get_status()
                if status.get("first_frame_received", False):
                    # Première frame détectée !
                    self.first_frame_sent[viewer_id] = True
                    await self.send_message({
                        "type": "first_frame_received",
                        "worker_id": self.worker_id,
                        "viewer_id": viewer_id,
                        "timestamp": time.time()
                    })
                    print(f"[Worker {self.worker_id}] 🎯 First frame received by {viewer_id}")
    
    async def send_detections_batch(self, detections: List[dict]):
        """Envoie un batch de détections au host"""
        if not detections:
            return
        
        batch_message = {
            "type": "detections",
            "worker_id": self.worker_id,
            "timestamp": time.time(),
            "count": len(detections),
            "detections": detections
        }
        
        await self.send_message(batch_message)
        print(f"[Worker {self.worker_id}] 📊 Sent batch of {len(detections)} detections")
    
    async def send_status(self):
        """Envoie le statut du worker au host"""
        viewer_status = {}
        for viewer_id, viewer in self.viewers.items():
            viewer_status[viewer_id] = viewer.get_status()
        
        status_message = {
            "type": "worker_status",
            "worker_id": self.worker_id,
            "timestamp": time.time(),
            "viewers_count": len(self.viewers),
            "viewers": viewer_status
        }
        
        await self.send_message(status_message)
    
    async def send_message(self, message: dict):
        """Envoie un message au host via WebSocket"""
        if not self.ws_connected or not self.websocket:
            print(f"[Worker {self.worker_id}] ⚠️  WebSocket not connected, dropping message: {message['type']}")
            return
        
        try:
            await self.websocket.send(json.dumps(message))
        except Exception as e:
            print(f"[Worker {self.worker_id}] ❌ Error sending message: {e}")
            self.ws_connected = False
    
    def get_local_ip(self) -> str:
        """Récupère l'IP locale du worker"""
        try:
            # Connexion temporaire pour découvrir l'IP locale
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                return s.getsockname()[0]
        except:
            return "127.0.0.1"
    
    async def start(self):
        """Démarre le worker"""
        self.running = True
        print(f"[Worker {self.worker_id}] 🚀 Starting worker")
        
        # Démarrer la connexion WebSocket
        await self.connect_to_host()
    
    async def stop(self):
        """Arrête le worker"""
        self.running = False
        print(f"[Worker {self.worker_id}] 🛑 Stopping worker")
        
        # Arrêter tous les viewers
        await self.stop_all_viewers()
        
        # Fermer la connexion WebSocket
        if self.websocket:
            await self.websocket.close()
            self.ws_connected = False


async def main():
    """Point d'entrée principal"""
    parser = argparse.ArgumentParser(description="Worker pour benchmark distribué WebSocket")
    parser.add_argument("--host-ws", default="ws://localhost:8080", help="URL WebSocket du host")
    parser.add_argument("--worker-id", default=None, help="ID du worker (auto-généré si non fourni)")
    
    args = parser.parse_args()
    
    # Générer un ID de worker si pas fourni
    if not args.worker_id:
        args.worker_id = f"worker_{socket.getfqdn()}_{int(time.time() % 10000)}"
    
    print("=" * 60)
    print(f"🤖 Worker {args.worker_id}")
    print(f"🔌 Host WebSocket: {args.host_ws}")
    print("=" * 60)
    
    # Créer et démarrer le worker
    worker = WorkerManager(args.worker_id, args.host_ws)
    
    try:
        await worker.start()
    except KeyboardInterrupt:
        print(f"\n[Worker {args.worker_id}] 🛑 Interrupted by user")
    finally:
        await worker.stop()


if __name__ == "__main__":
    asyncio.run(main())