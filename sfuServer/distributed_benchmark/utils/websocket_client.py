"""
Client WebSocket pour les Workers.
Envoie les détections de frames et les métriques système au Controller.
"""
import asyncio
import json
import websockets
from websockets.client import WebSocketClientProtocol
from typing import Optional, Callable
from datetime import datetime
import traceback


class WebSocketReportingClient:
    """Client WebSocket pour envoyer les rapports au Controller"""
    
    def __init__(
        self, 
        controller_host: str, 
        controller_port: int, 
        worker_id: str,
        reconnect_delay: float = 5.0
    ):
        self.controller_host = controller_host
        self.controller_port = controller_port
        self.worker_id = worker_id
        self.reconnect_delay = reconnect_delay
        
        self.ws: Optional[WebSocketClientProtocol] = None
        self.connected = False
        self.running = False
        self.reconnect_task: Optional[asyncio.Task] = None
        
        # Files d'attente pour les messages à envoyer
        self.detection_queue = asyncio.Queue()
        self.metrics_queue = asyncio.Queue()
        
        print(f"[WS Client] Initialized for worker {worker_id}")
    
    async def connect(self):
        """Établit la connexion WebSocket avec le Controller"""
        uri = f"ws://{self.controller_host}:{self.controller_port}"
        
        try:
            print(f"[WS Client] Connecting to {uri}...")
            self.ws = await websockets.connect(
                uri,
                ping_interval=20,
                ping_timeout=10
            )
            
            # Envoyer le message d'identification
            await self.ws.send(json.dumps({
                'type': 'worker_init',
                'worker_id': self.worker_id,
                'timestamp': datetime.now().isoformat()
            }))
            
            # Attendre la confirmation
            response = await asyncio.wait_for(self.ws.recv(), timeout=5.0)
            data = json.loads(response)
            
            if data.get('type') == 'init_ack':
                self.connected = True
                print(f"[WS Client] ✅ Connected to Controller: {uri}")
                return True
            else:
                print(f"[WS Client] ❌ Unexpected init response: {data}")
                await self.ws.close()
                return False
        
        except (websockets.exceptions.WebSocketException, asyncio.TimeoutError, ConnectionRefusedError) as e:
            print(f"[WS Client] ❌ Connection failed: {e}")
            self.connected = False
            return False
        except Exception as e:
            print(f"[WS Client] ❌ Unexpected error during connection: {e}")
            traceback.print_exc()
            self.connected = False
            return False
    
    async def start(self):
        """Démarre le client WebSocket avec reconnexion automatique"""
        if self.running:
            print("[WS Client] ⚠️  Client already running")
            return
        
        self.running = True
        print(f"[WS Client] 🚀 Starting WebSocket client for worker {self.worker_id}")
        
        # Tâche de connexion/reconnexion
        self.reconnect_task = asyncio.create_task(self._connection_loop())
        
        # Tâches d'envoi
        asyncio.create_task(self._send_loop())
    
    async def _connection_loop(self):
        """Boucle de connexion avec reconnexion automatique"""
        while self.running:
            if not self.connected:
                success = await self.connect()
                
                if success:
                    # Démarrer la boucle de réception
                    asyncio.create_task(self._receive_loop())
                else:
                    # Attendre avant de réessayer
                    print(f"[WS Client] ⏳ Retrying connection in {self.reconnect_delay}s...")
                    await asyncio.sleep(self.reconnect_delay)
            else:
                # Vérifier la connexion toutes les secondes
                await asyncio.sleep(1.0)
    
    async def _receive_loop(self):
        """Boucle de réception des messages du Controller"""
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    message_type = data.get('type')
                    
                    if message_type == 'heartbeat_ack':
                        # Heartbeat confirmé
                        pass
                    else:
                        print(f"[WS Client] 📨 Received: {message_type}")
                
                except json.JSONDecodeError as e:
                    print(f"[WS Client] ⚠️  JSON decode error: {e}")
        
        except websockets.exceptions.ConnectionClosed:
            print(f"[WS Client] 🔌 Connection closed")
            self.connected = False
        except Exception as e:
            print(f"[WS Client] ❌ Error in receive loop: {e}")
            traceback.print_exc()
            self.connected = False
    
    async def _send_loop(self):
        """Boucle d'envoi des messages en attente"""
        while self.running:
            try:
                # Traiter les détections (haute priorité)
                while not self.detection_queue.empty() and self.connected:
                    detection = await self.detection_queue.get()
                    await self._send_detection(detection)
                
                # Traiter les métriques
                while not self.metrics_queue.empty() and self.connected:
                    metrics = await self.metrics_queue.get()
                    await self._send_metrics(metrics)
                
                # Attendre un peu avant la prochaine itération
                await asyncio.sleep(0.1)
            
            except Exception as e:
                print(f"[WS Client] ⚠️  Error in send loop: {e}")
                await asyncio.sleep(1.0)
    
    async def _send_detection(self, detection: dict):
        """Envoie une détection au Controller"""
        if not self.connected or not self.ws:
            # Remettre dans la queue si non connecté
            await self.detection_queue.put(detection)
            return
        
        try:
            message = json.dumps({
                'type': 'red_detection',
                'worker_id': self.worker_id,
                'detection': detection,
                'timestamp': datetime.now().isoformat()
            })
            await self.ws.send(message)
        
        except websockets.exceptions.ConnectionClosed:
            print(f"[WS Client] ⚠️  Connection closed while sending detection")
            self.connected = False
            # Remettre dans la queue
            await self.detection_queue.put(detection)
        except Exception as e:
            print(f"[WS Client] ⚠️  Error sending detection: {e}")
            # Remettre dans la queue
            await self.detection_queue.put(detection)
    
    async def _send_metrics(self, metrics: dict):
        """Envoie les métriques au Controller"""
        if not self.connected or not self.ws:
            # Ne pas remettre les métriques en queue (pas critique)
            return
        
        try:
            message = json.dumps({
                'type': 'worker_metrics',
                'worker_id': self.worker_id,
                'metrics': metrics,
                'timestamp': datetime.now().isoformat()
            })
            await self.ws.send(message)
        
        except websockets.exceptions.ConnectionClosed:
            print(f"[WS Client] ⚠️  Connection closed while sending metrics")
            self.connected = False
        except Exception as e:
            print(f"[WS Client] ⚠️  Error sending metrics: {e}")
    
    async def send_detection(self, detection: dict):
        """
        Envoie immédiatement une détection de frame rouge.
        Ajoute la détection à la queue pour envoi asynchrone.
        """
        await self.detection_queue.put(detection)
    
    async def send_metrics(self, metrics: dict):
        """
        Envoie les métriques système.
        Ajoute les métriques à la queue pour envoi asynchrone.
        """
        await self.metrics_queue.put(metrics)
    
    async def stop(self):
        """Arrête le client WebSocket"""
        print("[WS Client] 🛑 Stopping WebSocket client...")
        self.running = False
        
        # Attendre que les queues se vident (max 5s)
        try:
            await asyncio.wait_for(self._flush_queues(), timeout=5.0)
        except asyncio.TimeoutError:
            print("[WS Client] ⏱️  Timeout flushing queues")
        
        if self.reconnect_task:
            self.reconnect_task.cancel()
        
        if self.ws and not self.ws.closed:
            await self.ws.close()
        
        self.connected = False
        print("[WS Client] ✅ WebSocket client stopped")
    
    async def _flush_queues(self):
        """Vide les queues avant de fermer"""
        while not self.detection_queue.empty() or not self.metrics_queue.empty():
            if self.connected:
                await asyncio.sleep(0.1)
            else:
                break
    
    def get_stats(self) -> dict:
        """Retourne les statistiques du client"""
        return {
            'connected': self.connected,
            'running': self.running,
            'worker_id': self.worker_id,
            'pending_detections': self.detection_queue.qsize(),
            'pending_metrics': self.metrics_queue.qsize()
        }
