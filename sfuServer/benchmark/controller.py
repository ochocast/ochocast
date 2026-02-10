#!/usr/bin/env python3
"""
Controller pour le benchmark distribué WebSocket.
Le cerveau qui gère le Host et la flotte de Workers via WebSocket.

Usage:
    python controller.py --config config.yaml
"""
import asyncio
import argparse
import time
import json
import yaml
import os
import sys
import aiohttp
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

try:
    import websockets
except ImportError:
    print("❌ websockets package not found. Install with: pip install websockets")
    sys.exit(1)

# Importer le Host
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from host import Host


@dataclass 
class WorkerInfo:
    """Information d'un worker connecté"""
    worker_id: str
    ip: str
    connected_at: float
    websocket: object  # websockets.WebSocketServerProtocol
    viewers_count: int = 0
    status: str = "connected"  # connected, disconnected, error
    last_ping: Optional[float] = None


class BenchmarkController:
    """Controller simple et cohérent pour le benchmark distribué"""
    
    def __init__(self, config_path: str):
        # Charger la configuration
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        # ID unique du benchmark
        self.benchmark_id = f"bench_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Host (objet géré par le controller)
        self.host: Optional[Host] = None
        self.host_task: Optional[asyncio.Task] = None
        
        # Workers via WebSocket
        self.workers: Dict[str, WorkerInfo] = {}
        self.ws_server = None
        self.ws_server_task = None
        
        # État du benchmark
        self.benchmark_running = False
        self.first_frame_received = False
        self.benchmark_start_time = None
        
        # Room information
        self.room_id = None
        self.room_key = None
        
        # Données collectées
        self.host_data = {
            "benchmark_id": self.benchmark_id,
            "start_time": None,
            "end_time": None,
            "status": "created",
            "config": self.config
        }
        
        # Sauvegarde
        self.output_dir = self.config['metrics']['output_dir']
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Sauvegarde périodique
        self.save_task = None
        self.save_interval = 5.0  # Toutes les 5s
        
        print(f"[Controller] 🧠 Initialized benchmark {self.benchmark_id}")
    
    async def start_websocket_server(self):
        """Démarre le serveur WebSocket pour les workers"""
        host = "0.0.0.0"
        port = 8080  # Port fixe pour simplifier
        
        print(f"[Controller] 🔌 Starting WebSocket server on {host}:{port}")
        
        async def handle_client(websocket, path):
            await self.handle_worker_connection(websocket, path)
        
        self.ws_server = await websockets.serve(handle_client, host, port)
        print(f"[Controller] ✅ WebSocket server started on ws://{host}:{port}")
    
    async def handle_worker_connection(self, websocket, path):
        """Gère la connexion d'un worker"""
        worker_id = None
        
        try:
            async for message in websocket:
                data = json.loads(message)
                
                if data.get("type") == "worker_connected":
                    worker_id = data["worker_id"]
                    worker_ip = data["ip"]
                    
                    # Enregistrer le worker
                    self.workers[worker_id] = WorkerInfo(
                        worker_id=worker_id,
                        ip=worker_ip,
                        connected_at=time.time(),
                        websocket=websocket
                    )
                    
                    print(f"[Controller] 🤖 Worker {worker_id} connected from {worker_ip}")
                    await self.save_host_data()
                
                elif data.get("type") == "first_frame_received":
                    await self.handle_first_frame(data)
                
                elif data.get("type") == "detections":
                    await self.handle_detections(data)
                
                elif data.get("type") == "viewers_started":
                    worker_id = data["worker_id"]
                    if worker_id in self.workers:
                        self.workers[worker_id].viewers_count = len(data["viewers"])
                        active_count = len(data.get("active_viewers", []))
                        print(f"[Controller] ✅ Worker {worker_id} started {len(data['viewers'])} viewers ({active_count} actifs)")
                
                elif data.get("type") == "viewers_stopped":
                    worker_id = data["worker_id"]
                    if worker_id in self.workers:
                        self.workers[worker_id].viewers_count = 0
                        print(f"[Controller] 🛑 Worker {worker_id} stopped all viewers")
                
                elif data.get("type") == "viewer_disconnected":
                    worker_id = data["worker_id"]
                    viewer_id = data["viewer_id"]
                    was_active = data.get("was_active", False)
                    mode = "ACTIF" if was_active else "PASSIF"
                    print(f"[Controller] ⚠️  Worker {worker_id}: Viewer {viewer_id} ({mode}) disconnected")
                
                elif data.get("type") == "viewer_recreated":
                    worker_id = data["worker_id"]
                    viewer_id = data["viewer_id"]
                    is_active = data.get("is_active", False)
                    mode = "ACTIF" if is_active else "PASSIF"
                    print(f"[Controller] 🔄 Worker {worker_id}: Viewer {viewer_id} recreated ({mode})")
                
                elif data.get("type") == "viewer_promoted":
                    worker_id = data["worker_id"]
                    viewer_id = data["viewer_id"]
                    print(f"[Controller] 🔼 Worker {worker_id}: Viewer {viewer_id} promoted to ACTIVE")
        
        except websockets.exceptions.ConnectionClosed:
            if worker_id and worker_id in self.workers:
                print(f"[Controller] 🔌 Worker {worker_id} disconnected")
                self.workers[worker_id].status = "disconnected"
        except Exception as e:
            if worker_id:
                print(f"[Controller] ❌ Error with worker {worker_id}: {e}")
                if worker_id in self.workers:
                    self.workers[worker_id].status = "error"
    
    async def handle_first_frame(self, data):
        """Gère la réception de la première frame par un viewer"""
        if not self.first_frame_received:
            self.first_frame_received = True
            print(f"[Controller] 🎯 First frame received! Starting red frames...")
            
            # Démarrer les frames rouges du host
            if self.host:
                self.host.start_check_latency()
                self.benchmark_start_time = time.time()
                self.host_data["benchmark_start_time"] = self.benchmark_start_time
                await self.save_host_data()
    
    async def handle_detections(self, data):
        """Sauvegarde les détections des viewers"""
        worker_id = data["worker_id"]
        detections = data["detections"]
        timestamp = data["timestamp"]
        
        # Créer le dossier du worker si nécessaire
        worker_dir = os.path.join(self.output_dir, worker_id)
        os.makedirs(worker_dir, exist_ok=True)
        
        # Nom du fichier basé sur le timestamp
        filename = f"detections_{int(timestamp)}.json"
        filepath = os.path.join(worker_dir, filename)
        
        # Sauvegarder les détections
        detection_data = {
            "worker_id": worker_id,
            "timestamp": timestamp,
            "count": len(detections),
            "detections": detections
        }
        
        with open(filepath, 'w') as f:
            json.dump(detection_data, f, indent=2)
        
        print(f"[Controller] 📊 Saved {len(detections)} detections from {worker_id}")
    
    async def create_room(self):
        """Crée une room sur le serveur SFU"""
        sfu_config = self.config['sfu']
        url = sfu_config['url'] + sfu_config['room_create_endpoint']
        
        # Générer un room_id unique basé sur le benchmark_id
        room_id = f"bench_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        print(f"[Controller] 🏠 Creating room {room_id}...")
        
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                payload = {"room_id": room_id}
                async with session.post(url, json=payload) as resp:
                    if resp.status not in (200, 201):
                        body = await resp.text()
                        print(f"[Controller] ❌ Failed to create room: {resp.status} {body}")
                        raise Exception(f"Failed to create room: {resp.status}")
                    
                    response_data = await resp.json()
                    self.room_id = response_data["room_id"]
                    self.room_key = response_data["key"]
                    
                    print(f"[Controller] ✅ Room created: {self.room_id}, key: {self.room_key}")
                    
                    # Sauvegarder dans les données du benchmark
                    self.host_data["room_id"] = self.room_id
                    self.host_data["room_key"] = self.room_key
                    await self.save_host_data()
                    
        except Exception as e:
            print(f"[Controller] ❌ Error creating room: {e}")
            raise
    
    async def start_host(self):
        """Démarre le host (objet)"""
        print(f"[Controller] 🎥 Starting host...")
        
        if not self.room_id or not self.room_key:
            raise Exception("Room must be created before starting host")
        
        sfu_config = self.config['sfu']
        host_config = self.config['benchmark']['host']
        
        # Construire l'URL avec les paramètres room_id et key
        whip_url = f"{sfu_config['url']}{sfu_config['whip_endpoint']}?room_id={self.room_id}&key={self.room_key}"
        
        # Créer l'objet Host
        self.host = Host(
            url=whip_url,
            stun_url=sfu_config['stun_url'],
            output=self.output_dir,
            width=host_config['width'],
            height=host_config['height'],
            fps=host_config['fps'],
            red_interval=self.config['benchmark']['red_interval'],
            token=host_config.get('token'),
            encoding_method=self.config['benchmark'].get('encoding_method', 'diagonal')
        )
        
        # Démarrer le host en async
        self.host_task = asyncio.create_task(self.host.start_async())
        
        # Attendre quelques secondes que la connexion s'établisse
        await asyncio.sleep(3)
        
        self.host_data["start_time"] = time.time()
        self.host_data["status"] = "running"
        
        print(f"[Controller] ✅ Host started")
        await self.save_host_data()
    
    async def stop_host(self):
        """Arrête le host"""
        if self.host:
            print(f"[Controller] 🛑 Stopping host...")
            self.host.stop()
            
            if self.host_task:
                try:
                    await self.host_task
                except:
                    pass
            
            self.host_data["end_time"] = time.time()
            self.host_data["status"] = "stopped"
            await self.save_host_data()
            
            print(f"[Controller] ✅ Host stopped")
    
    async def start_viewers_on_workers(self):
        """Commande tous les workers de démarrer leurs viewers"""
        if not self.workers:
            print(f"[Controller] ⚠️  No workers connected")
            return
        
        if not self.room_id:
            raise Exception("Room must be created before starting viewers")
        
        print(f"[Controller] 🚀 Starting viewers on {len(self.workers)} workers...")
        
        sfu_config = self.config['sfu']
        benchmark_config = self.config['benchmark']
        total_viewers = benchmark_config['total_viewers']
        
        # Configuration des viewers (avec valeurs par défaut)
        viewer_config = benchmark_config.get('viewers', {})
        active_count = viewer_config.get('active_count', 1)
        downscale_size = viewer_config.get('downscale_size', 1)
        detection_queue_size = viewer_config.get('detection_queue_size', 100)
        
        print(f"[Controller] 🎯 Viewer config: active_count={active_count}, downscale_size={downscale_size}")
        
        # Distribution simple : répartir équitablement
        viewers_per_worker = total_viewers // len(self.workers)
        remaining_viewers = total_viewers % len(self.workers)
        
        # Construire l'URL avec le paramètre room_id
        viewer_url = f"{sfu_config['url']}{sfu_config['viewer_endpoint']}?room_id={self.room_id}"
        
        # Envoyer les commandes à tous les workers
        for i, (worker_id, worker_info) in enumerate(self.workers.items()):
            # Les premiers workers prennent +1 viewer s'il y a un reste
            count = viewers_per_worker + (1 if i < remaining_viewers else 0)
            
            command = {
                "type": "start_viewers",
                "count": count,
                "config": {
                    "url": viewer_url,
                    "stun_url": sfu_config['stun_url'],
                    "encoding_method": benchmark_config.get('encoding_method', 'diagonal'),
                    "active_count": active_count,
                    "downscale_size": downscale_size,
                    "detection_queue_size": detection_queue_size
                }
            }
            
            try:
                await worker_info.websocket.send(json.dumps(command))
                print(f"[Controller] 📤 Sent start command to {worker_id} ({count} viewers, {min(active_count, count)} actifs)")
            except Exception as e:
                print(f"[Controller] ❌ Failed to send command to {worker_id}: {e}")
                worker_info.status = "error"
        
        await self.save_host_data()
    
    async def stop_viewers_on_workers(self):
        """Commande tous les workers d'arrêter leurs viewers"""
        print(f"[Controller] 🛑 Stopping viewers on all workers...")
        
        command = {"type": "stop_viewers"}
        
        for worker_id, worker_info in self.workers.items():
            try:
                await worker_info.websocket.send(json.dumps(command))
                worker_info.viewers_count = 0
                print(f"[Controller] 📤 Sent stop command to {worker_id}")
            except Exception as e:
                print(f"[Controller] ❌ Failed to send stop command to {worker_id}: {e}")
        
        await self.save_host_data()
    
    async def save_host_data(self):
        """Sauvegarde les données du host et workers"""
        # Ajouter l'état des workers
        workers_data = {}
        for worker_id, worker_info in self.workers.items():
            workers_data[worker_id] = {
                "ip": worker_info.ip,
                "connected_at": worker_info.connected_at,
                "viewers_count": worker_info.viewers_count,
                "status": worker_info.status,
                "last_ping": worker_info.last_ping
            }
        
        # Ajouter l'état du host si disponible
        host_status = {}
        if self.host:
            try:
                # Récupérer quelques stats basiques du host
                host_status = {
                    "running": self.host.stop_event is not None and not self.host.stop_event.is_set(),
                    "check_latency": self.host.check_latency if hasattr(self.host, 'check_latency') else False
                }
            except:
                host_status = {"error": "Could not get host status"}
        
        # Extraire la config des viewers si disponible
        viewer_config_summary = {}
        if 'benchmark' in self.config and 'viewers' in self.config['benchmark']:
            viewer_config_summary = self.config['benchmark']['viewers']
        
        # Données complètes
        complete_data = {
            **self.host_data,
            "timestamp": time.time(),
            "benchmark_running": self.benchmark_running,
            "first_frame_received": self.first_frame_received,
            "host_status": host_status,
            "viewer_config": viewer_config_summary,
            "workers": workers_data
        }
        
        # Sauvegarder
        filepath = os.path.join(self.output_dir, "benchmark_info.json")
        with open(filepath, 'w') as f:
            json.dump(complete_data, f, indent=2)
    
    async def periodic_save(self):
        """Sauvegarde périodique des données"""
        while self.benchmark_running:
            await self.save_host_data()
            await asyncio.sleep(self.save_interval)
    
    async def run_benchmark(self):
        """Lance le benchmark complet"""
        print(f"[Controller] 🚀 Starting benchmark {self.benchmark_id}")
        
        try:
            # 1. Démarrer le serveur WebSocket
            await self.start_websocket_server()
            
            # 2. Attendre que des workers se connectent
            print(f"[Controller] ⏳ Waiting for workers to connect...")
            while not self.workers:
                await asyncio.sleep(1)
            await asyncio.sleep(10)  # Attendre un peu plus pour d'autres connexions
            
            print(f"[Controller] ✅ {len(self.workers)} worker(s) connected")
            
            # 3. Créer la room
            await self.create_room()
            
            # 4. Démarrer le host
            await self.start_host()
            
            # 5. Démarrer les viewers sur tous les workers
            await self.start_viewers_on_workers()
            
            # 5. Démarrer la sauvegarde périodique
            self.benchmark_running = True
            self.save_task = asyncio.create_task(self.periodic_save())
            
            # 6. Attendre la première frame pour démarrer les frames rouges
            print(f"[Controller] ⏳ Waiting for first frame reception...")
            while not self.first_frame_received:
                await asyncio.sleep(0.5)
            
            # 7. Laisser tourner pendant la durée configurée
            duration = self.config['benchmark']['duration']
            print(f"[Controller] ⏰ Running benchmark for {duration} seconds...")
            await asyncio.sleep(duration)
            
        except KeyboardInterrupt:
            print(f"\n[Controller] 🛑 Interrupted by user")
        
        finally:
            # Arrêter tout proprement
            await self.stop_benchmark()
    
    async def stop_benchmark(self):
        """Arrête le benchmark proprement"""
        print(f"[Controller] 🛑 Stopping benchmark...")
        
        self.benchmark_running = False
        
        # Arrêter les viewers
        await self.stop_viewers_on_workers()
        
        # Arrêter le host
        await self.stop_host()
        
        # Arrêter la sauvegarde périodique
        if self.save_task:
            self.save_task.cancel()
        
        # Sauvegarde finale
        await self.save_host_data()
        
        # Fermer le serveur WebSocket
        if self.ws_server:
            self.ws_server.close()
            await self.ws_server.wait_closed()
        
        print(f"[Controller] ✅ Benchmark stopped. Results in {self.output_dir}/")


async def main():
    """Point d'entrée principal"""
    parser = argparse.ArgumentParser(description="Controller pour benchmark distribué WebSocket")
    parser.add_argument("--config", default="config.yaml", help="Fichier de configuration YAML")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.config):
        print(f"❌ Configuration file not found: {args.config}")
        sys.exit(1)
    
    print("=" * 60)
    print("🧠 Benchmark Controller")
    print(f"📁 Config: {args.config}")
    print("=" * 60)
    
    # Créer et lancer le controller
    controller = BenchmarkController(args.config)
    
    try:
        await controller.run_benchmark()
    except Exception as e:
        print(f"[Controller] ❌ Fatal error: {e}")
        await controller.stop_benchmark()


if __name__ == "__main__":
    asyncio.run(main())