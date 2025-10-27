#!/usr/bin/env python3
"""
Worker pour le benchmark distribué.
Ce script doit être lancé sur chaque machine worker.

Usage:
    python worker.py --port 8080 --controller-host localhost --controller-ws-port 9000
"""
import asyncio
import argparse
import time
import sys
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import threading

# Ajouter le chemin pour importer viewer_distributed
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from viewer_distributed import DistributedViewer
from utils.websocket_client import WebSocketReportingClient
from utils.system_metrics import SystemMetricsCollector

app = Flask(__name__)
CORS(app)


class ViewerWorkerManager:
    """Gestionnaire des viewers sur un worker"""
    
    def __init__(self, worker_id: str, ws_client: WebSocketReportingClient, metrics_interval: float = 5.0):
        self.worker_id = worker_id
        self.viewers = {}  # {viewer_id: DistributedViewer}
        self.loop = None
        self.thread = None
        self.tasks = {}  # {viewer_id: asyncio.Task}
        self._lock = threading.Lock()
        
        # WebSocket client pour envoyer au Controller
        self.ws_client = ws_client
        
        # Collecteur de métriques système
        self.metrics_collector = SystemMetricsCollector()
        self.metrics_interval = metrics_interval
        self.metrics_task = None
        self.collecting_metrics = False
        
    def start_event_loop(self):
        """Démarre la boucle d'événements asyncio dans un thread"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        print("[Worker] 🔄 Asyncio event loop started")
        self.loop.run_forever()
    
    def ensure_loop_running(self):
        """S'assure que la boucle d'événements est en cours d'exécution"""
        if self.thread is None or not self.thread.is_alive():
            self.thread = threading.Thread(target=self.start_event_loop, daemon=True)
            self.thread.start()
            time.sleep(0.5)  # Laisser le temps à la boucle de démarrer
    
    def _on_detection_callback_sync(self, detection: dict):
        """Callback synchrone appelé quand un viewer détecte une frame rouge"""
        # Envoyer la coroutine dans la boucle asyncio de manière thread-safe
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.ws_client.send_detection(detection),
                self.loop
            )
    
    async def _metrics_collection_loop(self):
        """Boucle de collecte et envoi des métriques système"""
        print(f"[Worker] 📊 Starting metrics collection (interval: {self.metrics_interval}s)")
        self.collecting_metrics = True
        
        while self.collecting_metrics:
            try:
                # Collecter les métriques
                metrics = self.metrics_collector.collect_metrics()
                
                # Envoyer au Controller
                await self.ws_client.send_metrics(metrics)
                
                # Attendre l'intervalle configuré
                await asyncio.sleep(self.metrics_interval)
            
            except Exception as e:
                print(f"[Worker] ⚠️  Error in metrics collection: {e}")
                await asyncio.sleep(self.metrics_interval)
        
        print(f"[Worker] 📊 Metrics collection stopped")
    
    def start_metrics_collection(self):
        """Démarre la collecte de métriques"""
        if self.metrics_task is None or self.metrics_task.done():
            self.ensure_loop_running()
            self.metrics_task = asyncio.run_coroutine_threadsafe(
                self._metrics_collection_loop(),
                self.loop
            )
    
    def stop_metrics_collection(self):
        """Arrête la collecte de métriques"""
        self.collecting_metrics = False
        if self.metrics_task:
            try:
                self.metrics_task.result(timeout=2.0)
            except:
                pass
    
    def start_viewers(
        self,
        count: int,
        viewer_url: str,
        stun_url: str,
        red_threshold: float,
        start_ids: int
    ) -> dict:
        """Démarre plusieurs viewers"""
        self.ensure_loop_running()
        
        with self._lock:
            started_ids = []
            
            for i in range(count):
                viewer_id = f"viewer_{start_ids + i}"
                
                if viewer_id in self.viewers:
                    print(f"[Worker] ⚠️  Viewer {viewer_id} already exists")
                    continue
                
                viewer = DistributedViewer(
                    viewer_id=viewer_id,
                    red_threshold=red_threshold,
                    url=viewer_url,
                    stun_url=stun_url,
                    on_detection_callback=self._on_detection_callback_sync
                )
                
                self.viewers[viewer_id] = viewer
                
                # Lancer le viewer dans la boucle asyncio
                future = asyncio.run_coroutine_threadsafe(viewer.run(), self.loop)
                self.tasks[viewer_id] = future
                
                started_ids.append(viewer_id)
                print(f"[Worker] ✅ Started viewer {viewer_id}")
            
            # Démarrer la collecte de métriques si c'est le premier démarrage
            if not self.collecting_metrics:
                self.start_metrics_collection()
            
            return {
                "status": "started",
                "count": len(started_ids),
                "viewer_ids": started_ids
            }
    
    def get_status(self) -> dict:
        """Récupère le statut de tous les viewers"""
        with self._lock:
            viewers_status = []
            for viewer_id, viewer in self.viewers.items():
                viewers_status.append(viewer.get_status())
            
            total = len(self.viewers)
            connected = sum(1 for v in self.viewers.values() if v.connected)
            running = sum(1 for v in self.viewers.values() if v.running)
            
            return {
                "status": "ok",
                "total_viewers": total,
                "connected_viewers": connected,
                "running_viewers": running,
                "viewers": viewers_status
            }
    
    def get_metrics(self) -> dict:
        """Récupère les métriques agrégées"""
        with self._lock:
            if not self.viewers:
                return {"status": "no_viewers"}
            
            total_frames = sum(v.frame_count for v in self.viewers.values())
            total_red = sum(len(v.red_detections) for v in self.viewers.values())
            connected = sum(1 for v in self.viewers.values() if v.connected)
            
            viewers_list = []
            for viewer_id, viewer in self.viewers.items():
                viewers_list.append({
                    'viewer_id': viewer_id,
                    'frame_count': viewer.frame_count,
                    'red_detections': len(viewer.red_detections),
                    'connected': viewer.connected,
                    'first_frame_received': viewer.first_frame_timestamp is not None,
                    'first_frame_timestamp': viewer.first_frame_timestamp
                })
            
            return {
                "status": "ok",
                "total_viewers": len(self.viewers),
                "connected_viewers": connected,
                "total_frames": total_frames,
                "total_red_detections": total_red,
                "viewers": viewers_list
            }
    
    def get_timestamps(self, viewer_id: str) -> dict:
        """Récupère les timestamps d'un viewer spécifique"""
        with self._lock:
            viewer = self.viewers.get(viewer_id)
            if viewer:
                return viewer.get_timestamps_data()
            return {"error": "viewer_not_found"}
    
    def stop_all(self) -> dict:
        """Arrête tous les viewers"""
        with self._lock:
            stopped_ids = []
            
            # Arrêter la collecte de métriques
            self.stop_metrics_collection()
            
            for viewer_id, viewer in self.viewers.items():
                try:
                    # Arrêter le viewer via asyncio
                    asyncio.run_coroutine_threadsafe(viewer.stop(), self.loop)
                    stopped_ids.append(viewer_id)
                    print(f"[Worker] 🛑 Stopped viewer {viewer_id}")
                except Exception as e:
                    print(f"[Worker] ⚠️  Error stopping {viewer_id}: {e}")
            
            # Attendre un peu que les viewers se terminent
            time.sleep(2)
            
            # Nettoyer
            self.viewers.clear()
            self.tasks.clear()
            
            return {
                "status": "stopped",
                "count": len(stopped_ids),
                "viewer_ids": stopped_ids
            }


# Instance globale du gestionnaire (sera initialisé dans main())
worker_manager = None
ws_client_global = None


# ==============================
# Routes Flask
# ==============================

@app.route("/ping", methods=["GET"])
def ping():
    """Endpoint de santé"""
    ws_stats = ws_client_global.get_stats() if ws_client_global else {}
    return jsonify({
        "status": "ok", 
        "timestamp": time.time(),
        "websocket": ws_stats
    })


@app.route("/time", methods=["GET"])
def get_time():
    """Retourne le timestamp actuel du worker"""
    return jsonify({"timestamp": time.time()})


@app.route("/start", methods=["POST"])
def start_viewers():
    """Démarre les viewers sur ce worker"""
    data = request.get_json(force=True)
    
    count = int(data.get("count", 1))
    viewer_url = data.get("viewer_url", "http://localhost:8090/viewer")
    stun_url = data.get("stun_url", "stun:stun.l.google.com:19302")
    red_threshold = float(data.get("red_threshold", 128.0))
    start_ids = int(data.get("start_ids", 1))
    
    result = worker_manager.start_viewers(
        count=count,
        viewer_url=viewer_url,
        stun_url=stun_url,
        red_threshold=red_threshold,
        start_ids=start_ids
    )
    
    return jsonify(result)


@app.route("/status", methods=["GET"])
def status():
    """Retourne le statut des viewers"""
    return jsonify(worker_manager.get_status())


@app.route("/metrics", methods=["GET"])
def metrics():
    """Retourne les métriques des viewers"""
    return jsonify(worker_manager.get_metrics())


@app.route("/timestamps/<viewer_id>", methods=["GET"])
def get_timestamps(viewer_id):
    """Retourne les timestamps d'un viewer spécifique"""
    data = worker_manager.get_timestamps(viewer_id)
    if "error" in data:
        return jsonify(data), 404
    return jsonify(data)


@app.route("/stop", methods=["POST"])
def stop_all():
    """Arrête tous les viewers"""
    result = worker_manager.stop_all()
    return jsonify(result)


def main():
    global worker_manager, ws_client_global
    
    parser = argparse.ArgumentParser(description="Worker for distributed WebRTC benchmark")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--controller-host", type=str, default="localhost", help="Controller host for WebSocket")
    parser.add_argument("--controller-ws-port", type=int, default=9000, help="Controller WebSocket port")
    parser.add_argument("--metrics-interval", type=float, default=5.0, help="Metrics collection interval (seconds)")
    args = parser.parse_args()
    
    # Créer le worker_id basé sur le host et port
    worker_id = f"{args.host}:{args.port}"
    
    print("="*80)
    print("🚀 Distributed Benchmark Worker")
    print("="*80)
    print(f"Worker ID: {worker_id}")
    print(f"HTTP Server: {args.host}:{args.port}")
    print(f"Controller WebSocket: ws://{args.controller_host}:{args.controller_ws_port}")
    print(f"Metrics interval: {args.metrics_interval}s")
    print("="*80 + "\n")
    
    # Initialiser le client WebSocket
    ws_client_global = WebSocketReportingClient(
        controller_host=args.controller_host,
        controller_port=args.controller_ws_port,
        worker_id=worker_id
    )
    
    # Initialiser le gestionnaire de viewers
    worker_manager = ViewerWorkerManager(
        worker_id=worker_id,
        ws_client=ws_client_global,
        metrics_interval=args.metrics_interval
    )
    
    # Démarrer le client WebSocket dans un thread séparé
    def start_ws_client():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(ws_client_global.start())
        # Garder la boucle active
        try:
            loop.run_forever()
        except KeyboardInterrupt:
            loop.run_until_complete(ws_client_global.stop())
    
    ws_thread = threading.Thread(target=start_ws_client, daemon=True)
    ws_thread.start()
    
    # Attendre que le WebSocket se connecte
    time.sleep(2)
    
    print("✅ Worker ready to receive viewer tasks from controller\n")
    
    # Démarrer Flask
    try:
        app.run(host=args.host, port=args.port, threaded=True)
    except KeyboardInterrupt:
        print("\n🛑 Shutting down worker...")
        if ws_client_global:
            # Arrêter le client WebSocket
            loop = asyncio.new_event_loop()
            loop.run_until_complete(ws_client_global.stop())


if __name__ == "__main__":
    main()
