"""
Serveur WebSocket pour le Controller.
Reçoit les détections de frames et les métriques des workers en temps réel.
"""
import asyncio
import json
import websockets
from websockets.server import serve
from typing import Dict, Set, Callable, Optional
from datetime import datetime
import traceback


class WebSocketReportingServer:
    """Serveur WebSocket pour recevoir les rapports des workers"""
    
    def __init__(self, host: str = "0.0.0.0", port: int = 9000):
        self.host = host
        self.port = port
        self.server = None
        self.connected_workers: Dict[str, websockets.WebSocketServerProtocol] = {}
        self.running = False
        
        # Stockage des données reçues (en mémoire jusqu'à la fin)
        self.viewer_detections: Dict[str, list] = {}  # {viewer_id: [detections]}
        self.worker_metrics: Dict[str, list] = {}     # {worker_id: [metrics_snapshots]}
        
        # Callbacks pour traitement en temps réel (optionnel)
        self.on_detection_callback: Optional[Callable] = None
        self.on_metrics_callback: Optional[Callable] = None
        
        print(f"[WS Server] Initialized on {self.host}:{self.port}")
    
    def set_callbacks(self, on_detection: Optional[Callable] = None, on_metrics: Optional[Callable] = None):
        """Configure les callbacks pour traitement en temps réel"""
        self.on_detection_callback = on_detection
        self.on_metrics_callback = on_metrics
    
    async def handle_client(self, websocket: websockets.WebSocketServerProtocol, path: str):
        """Gère une connexion WebSocket d'un worker"""
        worker_id = None
        
        try:
            # Attendre le message d'identification
            init_message = await asyncio.wait_for(websocket.recv(), timeout=10.0)
            init_data = json.loads(init_message)
            
            if init_data.get('type') != 'worker_init':
                print(f"[WS Server] ❌ Invalid init message from {websocket.remote_address}")
                await websocket.close()
                return
            
            worker_id = init_data.get('worker_id')
            print(f"[WS Server] ✅ Worker connected: {worker_id} from {websocket.remote_address}")
            
            self.connected_workers[worker_id] = websocket
            
            # Envoyer confirmation
            await websocket.send(json.dumps({
                'type': 'init_ack',
                'status': 'connected',
                'timestamp': datetime.now().isoformat()
            }))
            
            # Boucle de réception des messages
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self._process_message(worker_id, data)
                except json.JSONDecodeError as e:
                    print(f"[WS Server] ⚠️  JSON decode error from {worker_id}: {e}")
                except Exception as e:
                    print(f"[WS Server] ⚠️  Error processing message from {worker_id}: {e}")
                    traceback.print_exc()
        
        except asyncio.TimeoutError:
            print(f"[WS Server] ⏱️  Timeout waiting for init from {websocket.remote_address}")
        except websockets.exceptions.ConnectionClosed:
            print(f"[WS Server] 🔌 Connection closed: {worker_id or websocket.remote_address}")
        except Exception as e:
            print(f"[WS Server] ❌ Error in connection handler: {e}")
            traceback.print_exc()
        finally:
            if worker_id and worker_id in self.connected_workers:
                del self.connected_workers[worker_id]
                print(f"[WS Server] 👋 Worker disconnected: {worker_id}")
    
    async def _process_message(self, worker_id: str, data: Dict):
        """Traite un message reçu d'un worker"""
        message_type = data.get('type')
        
        if message_type == 'red_detection':
            await self._handle_detection(worker_id, data)
        
        elif message_type == 'worker_metrics':
            await self._handle_metrics(worker_id, data)
        
        elif message_type == 'heartbeat':
            # Répondre au heartbeat
            worker_ws = self.connected_workers.get(worker_id)
            if worker_ws:
                await worker_ws.send(json.dumps({
                    'type': 'heartbeat_ack',
                    'timestamp': datetime.now().isoformat()
                }))
        
        else:
            print(f"[WS Server] ⚠️  Unknown message type from {worker_id}: {message_type}")
    
    async def _handle_detection(self, worker_id: str, data: Dict):
        """Traite une détection de frame rouge"""
        detection = data.get('detection', {})
        viewer_id = detection.get('viewer_id')
        
        if not viewer_id:
            print(f"[WS Server] ⚠️  Detection without viewer_id from {worker_id}")
            return
        
        # Stocker la détection
        if viewer_id not in self.viewer_detections:
            self.viewer_detections[viewer_id] = []
        
        self.viewer_detections[viewer_id].append(detection)
        
        # Log périodique (tous les 10 détections)
        count = len(self.viewer_detections[viewer_id])
        if count % 10 == 0:
            print(f"[WS Server] 🔴 {viewer_id}: {count} détections (worker: {worker_id})")
        
        # Callback optionnel
        if self.on_detection_callback:
            await self.on_detection_callback(worker_id, viewer_id, detection)
    
    async def _handle_metrics(self, worker_id: str, data: Dict):
        """Traite les métriques d'un worker"""
        metrics = data.get('metrics', {})
        
        # Stocker les métriques
        if worker_id not in self.worker_metrics:
            self.worker_metrics[worker_id] = []
        
        self.worker_metrics[worker_id].append(metrics)
        
        # Log périodique
        count = len(self.worker_metrics[worker_id])
        if count % 12 == 0:  # Toutes les minutes si intervalle 5s
            cpu = metrics.get('cpu', {}).get('percent', 0)
            mem = metrics.get('memory', {}).get('percent', 0)
            net_recv = metrics.get('network', {}).get('recv_mbps', 0)
            print(f"[WS Server] 📊 {worker_id}: CPU={cpu}%, MEM={mem}%, NET_IN={net_recv:.1f}Mbps")
        
        # Callback optionnel
        if self.on_metrics_callback:
            await self.on_metrics_callback(worker_id, metrics)
    
    async def start(self):
        """Démarre le serveur WebSocket"""
        if self.running:
            print("[WS Server] ⚠️  Server already running")
            return
        
        self.running = True
        print(f"[WS Server] 🚀 Starting WebSocket server on ws://{self.host}:{self.port}")
        
        self.server = await serve(
            self.handle_client,
            self.host,
            self.port,
            ping_interval=20,
            ping_timeout=10
        )
        
        print(f"[WS Server] ✅ WebSocket server running and ready to accept connections")
    
    async def stop(self):
        """Arrête le serveur WebSocket"""
        if not self.running:
            return
        
        print("[WS Server] 🛑 Stopping WebSocket server...")
        self.running = False
        
        # Fermer toutes les connexions
        for worker_id, ws in list(self.connected_workers.items()):
            try:
                await ws.close()
            except:
                pass
        
        self.connected_workers.clear()
        
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        
        print("[WS Server] ✅ WebSocket server stopped")
    
    def get_stats(self) -> Dict:
        """Retourne les statistiques du serveur"""
        return {
            'running': self.running,
            'connected_workers': len(self.connected_workers),
            'worker_ids': list(self.connected_workers.keys()),
            'total_viewers': len(self.viewer_detections),
            'total_detections': sum(len(detections) for detections in self.viewer_detections.values()),
            'viewers_with_data': list(self.viewer_detections.keys()),
            'workers_with_metrics': list(self.worker_metrics.keys())
        }
    
    def save_data_to_files(self, output_dir: str):
        """
        Enregistre toutes les données collectées dans des fichiers JSON.
        À appeler à la fin du benchmark ou en cas de crash.
        """
        import os
        
        print(f"\n[WS Server] 💾 Saving collected data to {output_dir}")
        
        # Créer les dossiers
        detections_dir = os.path.join(output_dir, 'viewer_detections')
        metrics_dir = os.path.join(output_dir, 'worker_metrics')
        os.makedirs(detections_dir, exist_ok=True)
        os.makedirs(metrics_dir, exist_ok=True)
        
        # Sauvegarder les détections par viewer
        for viewer_id, detections in self.viewer_detections.items():
            filepath = os.path.join(detections_dir, f'{viewer_id}_detections.json')
            with open(filepath, 'w') as f:
                json.dump({
                    'viewer_id': viewer_id,
                    'total_detections': len(detections),
                    'detections': detections
                }, f, indent=2)
            print(f"  ✅ Saved {len(detections)} detections for {viewer_id}")
        
        # Sauvegarder les métriques par worker
        for worker_id, metrics_list in self.worker_metrics.items():
            filepath = os.path.join(metrics_dir, f'{worker_id.replace(":", "_")}_metrics.json')
            
            # Calculer des statistiques résumées
            if metrics_list:
                cpu_values = [m['cpu']['percent'] for m in metrics_list if 'cpu' in m]
                mem_values = [m['memory']['percent'] for m in metrics_list if 'memory' in m]
                
                import numpy as np
                summary = {
                    'cpu_mean': round(np.mean(cpu_values), 2) if cpu_values else 0,
                    'cpu_max': round(np.max(cpu_values), 2) if cpu_values else 0,
                    'memory_mean': round(np.mean(mem_values), 2) if mem_values else 0,
                    'memory_max': round(np.max(mem_values), 2) if mem_values else 0,
                    'samples': len(metrics_list)
                }
            else:
                summary = {}
            
            with open(filepath, 'w') as f:
                json.dump({
                    'worker_id': worker_id,
                    'total_samples': len(metrics_list),
                    'summary': summary,
                    'metrics_history': metrics_list
                }, f, indent=2)
            print(f"  ✅ Saved {len(metrics_list)} metric samples for {worker_id}")
        
        print(f"[WS Server] ✅ Data saved successfully")
        print(f"  - {len(self.viewer_detections)} viewers")
        print(f"  - {len(self.worker_metrics)} workers")
        print(f"  - {sum(len(d) for d in self.viewer_detections.values())} total detections")
