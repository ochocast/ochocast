#!/usr/bin/env python3
"""
Controller pour le benchmark distribué.
Lance le host localement et distribue les viewers sur les workers distants.

Usage:
    python controller.py --config config.yaml
"""
import asyncio
import argparse
import time
import sys
import os
import yaml
import signal
from datetime import datetime

# Importer le Host du benchmark original
from host import Host


class DistributedBenchmarkController:
    """Controller pour orchestrer le benchmark distribué"""
    
    def __init__(self, config_path: str):
        self.config = self.load_config(config_path)
        self.host = None
        self.worker_pool = None
        self.metrics_collector = None
        self.viewer_distribution = {}
        self.viewer_ids_by_worker = {}
        self.errors = []
        
        # Serveur WebSocket pour recevoir les rapports des workers
        self.ws_server = None
        self.ws_server_task = None
        
    def load_config(self, config_path: str) -> dict:
        """Charge la configuration depuis le fichier YAML"""
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        print(f"[Controller] ✅ Loaded configuration from {config_path}")
        return config
    
    async def check_workers_availability(self) -> bool:
        """Vérifie que tous les workers sont disponibles"""
        print("\n[Controller] 🔍 Checking workers availability...")
        
        ping_results = await self.worker_pool.ping_all()
        
        all_available = True
        for worker_ip, available in ping_results.items():
            if available:
                print(f"  ✅ Worker {worker_ip}: available")
            else:
                print(f"  ❌ Worker {worker_ip}: NOT available")
                all_available = False
                self.errors.append(f"Worker {worker_ip} is not available")
        
        return all_available
    
    async def check_time_synchronization(self) -> bool:
        """Vérifie la synchronisation temporelle des workers"""
        if not self.config['sync'].get('ntp_check', True):
            print("[Controller] ⏭️  NTP check disabled")
            return True
        
        print("\n[Controller] ⏰ Checking time synchronization...")
        
        max_drift = self.config['sync'].get('max_time_drift', 1.0)
        drifts = await self.worker_pool.check_time_sync(max_drift)
        
        all_synced = True
        for worker_ip, drift in drifts.items():
            if drift == float('inf'):
                print(f"  ❌ Worker {worker_ip}: cannot get time")
                all_synced = False
                self.errors.append(f"Cannot get time from worker {worker_ip}")
            elif drift > max_drift:
                print(f"  ⚠️  Worker {worker_ip}: drift = {drift:.3f}s (max: {max_drift}s)")
                all_synced = False
                self.errors.append(f"Time drift too high for worker {worker_ip}: {drift:.3f}s")
            else:
                print(f"  ✅ Worker {worker_ip}: drift = {drift:.3f}s")
        
        if not all_synced:
            print("\n⚠️  WARNING: Some workers have time synchronization issues!")
            print("This may affect latency measurements. Consider synchronizing clocks with NTP.")
            response = input("Continue anyway? (y/n): ")
            return response.lower() == 'y'
        
        return True
    
    def calculate_distribution(self) -> dict:
        """Calcule la distribution des viewers entre les workers"""
        total_viewers = self.config['benchmark']['total_viewers']
        worker_ips = [w['ip'] for w in self.config['workers'] if w.get('enabled', True)]
        
        distribution = distribute_viewers(total_viewers, len(worker_ips), worker_ips)
        
        print("\n[Controller] 📊 Viewer distribution:")
        for worker_ip, count in distribution.items():
            print(f"  Worker {worker_ip}: {count} viewers")
        
        return distribution
    
    def start_host(self):
        """Démarre le host (streamer)"""
        print("\n[Controller] 🎥 Starting host (streamer)...")
        
        sfu_config = self.config['sfu']
        bench_config = self.config['benchmark']
        host_config = bench_config['host']
        metrics_config = self.config['metrics']
        
        self.host = Host(
            url=sfu_config['url'] + sfu_config['whip_endpoint'],
            stun_url=sfu_config['stun_url'],
            output=metrics_config['output_dir'],
            width=host_config['width'],
            height=host_config['height'],
            fps=host_config['fps'],
            red_interval=bench_config['red_interval'],
            token=host_config.get('token')
        )
        
        self.host.start()
        print("[Controller] ✅ Host started")
    
    async def wait_for_host_ready(self):
        """Attend que le host soit prêt"""
        startup_delay = self.config['sync'].get('startup_delay', 10)
        print(f"\n[Controller] ⏳ Waiting {startup_delay}s for host to be ready...")
        await asyncio.sleep(startup_delay)
    
    async def start_viewers_on_workers(self):
        """Démarre les viewers sur tous les workers"""
        print("\n[Controller] 🚀 Starting viewers on workers...")
        
        sfu_config = self.config['sfu']
        bench_config = self.config['benchmark']
        
        viewer_url = sfu_config['url'] + sfu_config['viewer_endpoint']
        stun_url = sfu_config['stun_url']
        red_threshold = bench_config['red_threshold']
        
        results = await self.worker_pool.start_all_viewers(
            distribution=self.viewer_distribution,
            viewer_url=viewer_url,
            stun_url=stun_url,
            red_threshold=red_threshold
        )
        
        # Construire la map viewer_id -> worker_ip
        for worker_ip, result in results.items():
            if result.get('status') == 'started':
                viewer_ids = result.get('viewer_ids', [])
                self.viewer_ids_by_worker[worker_ip] = viewer_ids
                print(f"  ✅ Worker {worker_ip}: {len(viewer_ids)} viewers started")
            else:
                print(f"  ❌ Worker {worker_ip}: failed to start viewers")
                self.errors.append(f"Failed to start viewers on worker {worker_ip}")
    
    async def wait_for_first_frame(self):
        """Attend qu'au moins un viewer reçoive une frame (sans timeout)"""
        print("\n[Controller] 🎬 Waiting for first frame to be received...")
        
        while True:
            statuses = await self.worker_pool.get_all_status()
            
            for worker_ip, status in statuses.items():
                if status.get('status') == 'ok':
                    viewers = status.get('viewers', [])
                    for viewer in viewers:
                        if viewer.get('first_frame_received'):
                            viewer_id = viewer.get('viewer_id')
                            print(f"[Controller] ✅ First frame received by {viewer_id}")
                            return True
            
            await asyncio.sleep(0.5)
    
    def start_latency_check(self):
        """Démarre la vérification de latence (frames rouges)"""
        print("\n[Controller] 🔴 Starting latency check (red frames)...")
        self.host.start_check_latency()
        print("[Controller] ✅ Latency check started")
    
    async def monitor_test(self, duration: int):
        """Monitore le test en temps réel"""
        print(f"\n[Controller] 📊 Monitoring test for {duration} seconds...")
        
        collection_interval = self.config['metrics'].get('collection_interval', 5)
        iterations = duration // collection_interval
        
        for i in range(iterations):
            await asyncio.sleep(collection_interval)
            
            # Collecter les métriques
            metrics = await self.worker_pool.get_all_metrics()
            self.metrics_collector.add_metrics_snapshot(metrics)
            self.metrics_collector.print_metrics_summary(metrics)
            
            # Vérifier les erreurs
            for worker_ip, metric in metrics.items():
                if metric.get('status') == 'error':
                    error_msg = f"Worker {worker_ip} error: {metric.get('message', 'unknown')}"
                    if error_msg not in self.errors:
                        self.errors.append(error_msg)
                        print(f"⚠️  {error_msg}")
    
    async def stop_all_viewers(self):
        """Arrête tous les viewers"""
        print("\n[Controller] 🛑 Stopping all viewers...")
        results = await self.worker_pool.stop_all()
        
        for worker_ip, result in results.items():
            if result.get('status') == 'stopped':
                count = result.get('count', 0)
                print(f"  ✅ Worker {worker_ip}: {count} viewers stopped")
            else:
                print(f"  ⚠️  Worker {worker_ip}: stop failed")
    
    async def stop_host(self):
        """Arrête le host"""
        print("\n[Controller] 🛑 Stopping host...")
        if self.host:
            # S'assurer que le stop_event est set
            if self.host.stop_event:
                self.host.stop_event.set()
            
            # Si le host tourne dans le même event loop
            if self.host.task and not self.host.task.done():
                try:
                    # Attendre que la tâche se termine avec timeout
                    await asyncio.wait_for(self.host.task, timeout=5.0)
                except asyncio.TimeoutError:
                    print("[Controller] ⚠️  Host task timeout, cancelling...")
                    self.host.task.cancel()
                    try:
                        await self.host.task
                    except asyncio.CancelledError:
                        pass
                except Exception as e:
                    print(f"[Controller] ⚠️  Error stopping host: {e}")
            
            # Fermer la connexion PeerConnection si elle existe
            if self.host.pc and self.host.pc.connectionState not in ("closed", "failed"):
                await self.host.pc.close()
            
            print("[Controller] ✅ Host stopped")
    
    async def collect_all_timestamps(self):
        """Collecte tous les timestamps de tous les viewers"""
        print("\n[Controller] 💾 Collecting timestamps from all viewers...")
        
        all_timestamps = await self.worker_pool.collect_all_timestamps(self.viewer_ids_by_worker)
        
        # Sauvegarder chaque viewer
        for viewer_id, timestamps in all_timestamps.items():
            self.metrics_collector.save_timestamps(viewer_id, timestamps)
        
        print(f"[Controller] ✅ Collected timestamps from {len(all_timestamps)} viewers")
        
        # Copier aussi les timestamps du host
        if self.host and self.host.track:
            # Calculer les timing errors
            timing_errors = []
            if len(self.host.track.red_timestamps) > 1:
                for i in range(1, len(self.host.track.red_timestamps)):
                    expected_interval = self.host.red_interval
                    actual_interval = self.host.track.red_timestamps[i]['timestamp'] - self.host.track.red_timestamps[i-1]['timestamp']
                    error = actual_interval - expected_interval
                    timing_errors.append(error)
            
            host_data = {
                'session_info': {
                    'start_time': datetime.fromtimestamp(self.host.track.start_time).isoformat() if self.host.track.start_time else None,
                    'end_time': datetime.fromtimestamp(self.host.track.end_time).isoformat() if self.host.track.end_time else None,
                    'red_interval': self.host.red_interval,
                    'fps': self.host.fps,
                    'resolution': f"{self.host.width}x{self.host.height}",
                    'total_red_frames': len(self.host.track.red_timestamps),
                    'total_frames': self.host.track.frame_count,
                    'frames_generated': self.host.track.frames_generated,
                    'frames_dropped': self.host.track.frames_dropped,
                    'timing_errors': self.host.track.timing_errors,
                    'avg_timing_error': sum(timing_errors) / len(timing_errors) if timing_errors else 0,
                    'max_timing_error': max(timing_errors) if timing_errors else 0,
                    'exit_error': bool(self.host.track.exit_error),
                    'exit_reason': str(self.host.track.exit_reason) if self.host.track.exit_reason else None,
                },
                'red_timestamps': self.host.track.red_timestamps,
                'performance_stats': {
                    'timing_errors_ms': [e * 1000 for e in timing_errors],
                    'frame_drop_rate': self.host.track.frames_dropped / max(1, self.host.track.frames_generated) * 100
                }
            }
            self.metrics_collector.save_host_timestamps(host_data)
    
    def generate_final_report(self):
        """Génère le rapport final"""
        print("\n[Controller] 📝 Generating final report...")
        
        test_info = {
            'start_time': datetime.now().isoformat(),
            'end_time': datetime.now().isoformat(),
            'duration': self.config['benchmark']['duration'],
            'total_viewers': self.config['benchmark']['total_viewers'],
            'num_workers': len([w for w in self.config['workers'] if w.get('enabled', True)]),
            'distribution': self.viewer_distribution,
            'sfu_url': self.config['sfu']['url'],
            'red_interval': self.config['benchmark']['red_interval'],
            'errors': self.errors
        }
        
        self.metrics_collector.save_final_report(test_info)
        self.metrics_collector.save_metrics_history()
        
        print("[Controller] ✅ Final report generated")
    
    async def run(self):
        """Lance le benchmark complet"""
        print("\n" + "="*80)
        print("🚀 DISTRIBUTED WEBRTC BENCHMARK")
        print("="*80)
        
        start_time = time.time()
        
        try:
            # 1. Initialiser le serveur WebSocket
            await self.start_websocket_server()
            
            # 2. Initialiser le pool de workers
            self.worker_pool = WorkerPool(
                workers_config=self.config['workers'],
                timeout=self.config['network']['timeout']
            )
            
            # 3. Vérifier la disponibilité des workers
            if not await self.check_workers_availability():
                print("\n❌ Some workers are not available. Aborting.")
                await self.cleanup()
                return
            
            # 4. Vérifier la synchronisation temporelle
            if not await self.check_time_synchronization():
                print("\n❌ Time synchronization check failed. Aborting.")
                await self.cleanup()
                return
            
            # 5. Calculer la distribution des viewers
            self.viewer_distribution = self.calculate_distribution()
            
            # 6. Initialiser le collecteur de métriques
            self.metrics_collector = MetricsCollector(
                self.config['metrics']['output_dir']
            )
            self.metrics_collector.start_collection()
            
            # 7. Démarrer le host
            self.start_host()
            
            # 8. Attendre que le host soit prêt
            await self.wait_for_host_ready()
            
            # 9. Démarrer les viewers sur les workers
            await self.start_viewers_on_workers()
            
            # 10. Attendre la première frame (optionnel, ne bloque pas)
            await self.wait_for_first_frame()
            
            # 11. Démarrer le latency check (frames rouges) - toujours le faire
            self.start_latency_check()
            
            # 12. Monitorer le test
            await self.monitor_test(self.config['benchmark']['duration'])
            
            # 13. Arrêter tous les viewers
            await self.stop_all_viewers()
            
            # 14. Arrêter le host
            await self.stop_host()
            
            # 15. Collecter tous les timestamps
            await self.collect_all_timestamps()
            
            # 16. Sauvegarder les données WebSocket
            await self.save_websocket_data()
            
            # 17. Générer le rapport final
            self.generate_final_report()
            
            # 18. Cleanup
            await self.cleanup()
            
            elapsed = time.time() - start_time
            print("\n" + "="*80)
            print(f"✅ BENCHMARK COMPLETED in {elapsed:.1f}s")
            print("="*80)
            
            if self.errors:
                print(f"\n⚠️  {len(self.errors)} errors occurred during the test:")
                for error in self.errors:
                    print(f"  - {error}")
            
            print(f"\n📁 Results saved to: {self.config['metrics']['output_dir']}")
            print("You can now run the analysis script to process the results.")
            
        except KeyboardInterrupt:
            print("\n\n⚠️  Interrupted by user!")
            await self.emergency_shutdown()
        except Exception as e:
            print(f"\n\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
            await self.emergency_shutdown()
    
    async def start_websocket_server(self):
        """Démarre le serveur WebSocket pour recevoir les rapports des workers"""
        ws_config = self.config.get('websocket', {})
        host = ws_config.get('host', '0.0.0.0')
        port = ws_config.get('port', 9000)
        
        print(f"\n[Controller] 🌐 Starting WebSocket server on {host}:{port}...")
        
        self.ws_server = WebSocketReportingServer(host=host, port=port)
        await self.ws_server.start()
        
        print(f"[Controller] ✅ WebSocket server ready")
    
    async def save_websocket_data(self):
        """Sauvegarde les données collectées via WebSocket"""
        if self.ws_server:
            print("\n[Controller] 💾 Saving WebSocket data...")
            output_dir = self.config['metrics']['output_dir']
            self.ws_server.save_data_to_files(output_dir)
            
            # Afficher les statistiques
            stats = self.ws_server.get_stats()
            print(f"[Controller] 📊 WebSocket Stats:")
            print(f"  - Total viewers with detections: {stats['total_viewers']}")
            print(f"  - Total detections collected: {stats['total_detections']}")
            print(f"  - Workers with metrics: {len(stats['workers_with_metrics'])}")
    
    async def cleanup(self):
        """Nettoyage propre de toutes les ressources"""
        print("\n[Controller] 🧹 Cleaning up...")
        
        if self.ws_server:
            await self.ws_server.stop()
    
    async def emergency_shutdown(self):
        """Arrêt d'urgence en cas d'interruption ou d'erreur"""
        print("\n[Controller] 🚨 Emergency shutdown...")
        
        try:
            # Sauvegarder les données WebSocket avant de tout arrêter
            if self.ws_server:
                print("[Controller] 💾 Emergency save of WebSocket data...")
                output_dir = self.config['metrics']['output_dir']
                self.ws_server.save_data_to_files(output_dir)
        except Exception as e:
            print(f"[Controller] ⚠️  Error during emergency save: {e}")
        
        # Arrêter les viewers et le host
        try:
            await self.stop_all_viewers()
        except:
            pass
        
        try:
            await self.stop_host()
        except:
            pass
        
        # Cleanup
        await self.cleanup()


def main():
    parser = argparse.ArgumentParser(description="Distributed WebRTC Benchmark Controller")
    parser.add_argument(
        "--config",
        type=str,
        default="config.yaml",
        help="Path to configuration file"
    )
    args = parser.parse_args()
    
    controller = DistributedBenchmarkController(args.config)
    asyncio.run(controller.run())


if __name__ == "__main__":
    main()
