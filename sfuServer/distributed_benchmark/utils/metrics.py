"""
Module de collecte et d'agrégation des métriques du benchmark distribué.
"""
import json
import os
import time
from typing import Dict, List, Any
from datetime import datetime


class MetricsCollector:
    """Collecteur de métriques pour le benchmark distribué"""
    
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self.metrics_history = []
        self.start_time = None
        
    def start_collection(self):
        """Démarre la collecte des métriques"""
        self.start_time = time.time()
        
    def add_metrics_snapshot(self, workers_metrics: Dict[str, Dict[str, Any]]):
        """Ajoute un snapshot des métriques de tous les workers"""
        snapshot = {
            'timestamp': time.time(),
            'relative_time': time.time() - self.start_time if self.start_time else 0,
            'workers': workers_metrics
        }
        self.metrics_history.append(snapshot)
    
    def get_aggregated_metrics(self) -> Dict[str, Any]:
        """Calcule les métriques agrégées de tous les workers"""
        if not self.metrics_history:
            return {}
        
        latest = self.metrics_history[-1]
        
        total_viewers = 0
        total_connected = 0
        total_red_detections = 0
        all_first_frames = []
        
        for worker_ip, metrics in latest['workers'].items():
            if metrics.get('status') == 'ok':
                total_viewers += metrics.get('total_viewers', 0)
                total_connected += metrics.get('connected_viewers', 0)
                total_red_detections += metrics.get('total_red_detections', 0)
                
                viewers = metrics.get('viewers', [])
                for viewer in viewers:
                    if viewer.get('first_frame_received'):
                        all_first_frames.append(viewer.get('first_frame_timestamp', 0))
        
        return {
            'total_viewers': total_viewers,
            'connected_viewers': total_connected,
            'total_red_detections': total_red_detections,
            'connection_rate': total_connected / max(1, total_viewers) * 100,
            'first_frame_received': len(all_first_frames),
            'avg_first_frame_time': sum(all_first_frames) / len(all_first_frames) if all_first_frames else 0
        }
    
    def print_metrics_summary(self, workers_metrics: Dict[str, Dict[str, Any]]):
        """Affiche un résumé des métriques en temps réel"""
        print("\n" + "="*80)
        print(f"📊 Metrics Summary - {datetime.now().strftime('%H:%M:%S')}")
        print("="*80)
        
        for worker_ip, metrics in workers_metrics.items():
            if metrics.get('status') == 'error':
                print(f"❌ Worker {worker_ip}: ERROR - {metrics.get('message', 'Unknown error')}")
                continue
            
            total = metrics.get('total_viewers', 0)
            connected = metrics.get('connected_viewers', 0)
            red_det = metrics.get('total_red_detections', 0)
            
            print(f"🖥️  Worker {worker_ip}:")
            print(f"   Viewers: {connected}/{total} connected ({connected/max(1,total)*100:.1f}%)")
            print(f"   Red frames detected: {red_det}")
            
            viewers = metrics.get('viewers', [])
            if viewers:
                frames_received = [v.get('frame_count', 0) for v in viewers]
                avg_frames = sum(frames_received) / len(frames_received) if frames_received else 0
                print(f"   Avg frames/viewer: {avg_frames:.1f}")
        
        # Agrégation globale
        aggregated = self.get_aggregated_metrics()
        print(f"\n🌐 Global:")
        print(f"   Total viewers: {aggregated.get('connected_viewers', 0)}/{aggregated.get('total_viewers', 0)}")
        print(f"   Total red detections: {aggregated.get('total_red_detections', 0)}")
        print(f"   Connection rate: {aggregated.get('connection_rate', 0):.1f}%")
        print("="*80 + "\n")
    
    def save_timestamps(self, viewer_id: str, timestamps_data: Dict[str, Any]):
        """Sauvegarde les timestamps d'un viewer"""
        timestamp_file = os.path.join(self.output_dir, f"viewer_{viewer_id}_timestamps.json")
        with open(timestamp_file, 'w') as f:
            json.dump(timestamps_data, f, indent=2)
        print(f"[MetricsCollector] 💾 Saved timestamps for viewer {viewer_id}")
    
    def save_host_timestamps(self, host_data: Dict[str, Any]):
        """Sauvegarde les timestamps du host"""
        timestamp_file = os.path.join(self.output_dir, "host_timestamps.json")
        with open(timestamp_file, 'w') as f:
            json.dump(host_data, f, indent=2)
        print(f"[MetricsCollector] 💾 Saved host timestamps")
    
    def save_metrics_history(self):
        """Sauvegarde l'historique complet des métriques"""
        history_file = os.path.join(self.output_dir, "metrics_history.json")
        with open(history_file, 'w') as f:
            json.dump(self.metrics_history, f, indent=2)
        print(f"[MetricsCollector] 💾 Saved metrics history")
    
    def save_final_report(self, test_info: Dict[str, Any]):
        """Génère et sauvegarde le rapport final du test"""
        report_file = os.path.join(self.output_dir, "test_report.json")
        
        report = {
            'test_info': test_info,
            'metrics_history': self.metrics_history,
            'final_aggregated': self.get_aggregated_metrics()
        }
        
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"[MetricsCollector] 💾 Saved final report")
        
        # Générer un résumé texte
        self._generate_text_summary(report)
    
    def _generate_text_summary(self, report: Dict[str, Any]):
        """Génère un résumé texte du test"""
        summary_file = os.path.join(self.output_dir, "test_summary.txt")
        
        with open(summary_file, 'w') as f:
            f.write("="*80 + "\n")
            f.write("DISTRIBUTED BENCHMARK TEST SUMMARY\n")
            f.write("="*80 + "\n\n")
            
            test_info = report.get('test_info', {})
            f.write(f"Start Time: {test_info.get('start_time', 'N/A')}\n")
            f.write(f"End Time: {test_info.get('end_time', 'N/A')}\n")
            f.write(f"Duration: {test_info.get('duration', 0)} seconds\n")
            f.write(f"Total Viewers: {test_info.get('total_viewers', 0)}\n")
            f.write(f"Workers: {test_info.get('num_workers', 0)}\n\n")
            
            final = report.get('final_aggregated', {})
            f.write("Final Metrics:\n")
            f.write(f"  - Connected viewers: {final.get('connected_viewers', 0)}/{final.get('total_viewers', 0)}\n")
            f.write(f"  - Connection rate: {final.get('connection_rate', 0):.2f}%\n")
            f.write(f"  - Total red detections: {final.get('total_red_detections', 0)}\n")
            f.write(f"  - Viewers with first frame: {final.get('first_frame_received', 0)}\n")
            
            if test_info.get('errors'):
                f.write("\n⚠️  Errors:\n")
                for error in test_info['errors']:
                    f.write(f"  - {error}\n")
            
            f.write("\n" + "="*80 + "\n")
        
        print(f"[MetricsCollector] 💾 Saved text summary")


def distribute_viewers(total_viewers: int, num_workers: int, worker_ips: List[str]) -> Dict[str, int]:
    """
    Distribue équitablement les viewers entre les workers.
    
    Args:
        total_viewers: Nombre total de viewers à distribuer
        num_workers: Nombre de workers disponibles
        worker_ips: Liste des IPs des workers
        
    Returns:
        Dictionnaire {worker_ip: nombre_de_viewers}
    """
    if num_workers == 0:
        return {}
    
    base_count = total_viewers // num_workers
    remainder = total_viewers % num_workers
    
    distribution = {}
    for i, ip in enumerate(worker_ips):
        # Les premiers workers prennent un viewer supplémentaire si nécessaire
        distribution[ip] = base_count + (1 if i < remainder else 0)
    
    return distribution
