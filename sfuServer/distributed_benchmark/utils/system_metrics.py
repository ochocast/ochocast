"""
Module pour collecter les métriques système (CPU, RAM, réseau) des workers.
"""
import psutil
import time
from typing import Dict, Optional


class SystemMetricsCollector:
    """Collecteur de métriques système pour un worker"""
    
    def __init__(self):
        self.network_baseline = None
        self.last_network_check = None
        self._initialize_network_baseline()
    
    def _initialize_network_baseline(self):
        """Initialise les valeurs de base pour le calcul réseau"""
        net_io = psutil.net_io_counters()
        self.network_baseline = {
            'bytes_sent': net_io.bytes_sent,
            'bytes_recv': net_io.bytes_recv,
            'timestamp': time.time()
        }
        self.last_network_check = self.network_baseline.copy()
    
    def collect_metrics(self) -> Dict:
        """
        Collecte toutes les métriques système du worker.
        
        Returns:
            dict: Métriques système complètes
        """
        timestamp = time.time()
        
        # CPU
        cpu_percent = psutil.cpu_percent(interval=0.1)
        cpu_count = psutil.cpu_count()
        
        # RAM
        memory = psutil.virtual_memory()
        memory_mb = memory.used / (1024 * 1024)
        memory_percent = memory.percent
        memory_available_mb = memory.available / (1024 * 1024)
        memory_total_mb = memory.total / (1024 * 1024)
        
        # Réseau
        net_io = psutil.net_io_counters()
        
        # Calcul des totaux depuis le début
        total_sent_mb = (net_io.bytes_sent - self.network_baseline['bytes_sent']) / (1024 * 1024)
        total_recv_mb = (net_io.bytes_recv - self.network_baseline['bytes_recv']) / (1024 * 1024)
        
        # Calcul des vitesses instantanées (depuis le dernier check)
        time_delta = timestamp - self.last_network_check['timestamp']
        
        if time_delta > 0:
            bytes_sent_delta = net_io.bytes_sent - self.last_network_check['bytes_sent']
            bytes_recv_delta = net_io.bytes_recv - self.last_network_check['bytes_recv']
            
            # Conversion en Mbps
            network_sent_mbps = (bytes_sent_delta * 8) / (time_delta * 1_000_000)
            network_recv_mbps = (bytes_recv_delta * 8) / (time_delta * 1_000_000)
        else:
            network_sent_mbps = 0.0
            network_recv_mbps = 0.0
        
        # Mise à jour du dernier check
        self.last_network_check = {
            'bytes_sent': net_io.bytes_sent,
            'bytes_recv': net_io.bytes_recv,
            'timestamp': timestamp
        }
        
        # Disque (optionnel, peut être utile)
        disk = psutil.disk_usage('/')
        disk_percent = disk.percent
        
        return {
            'timestamp': timestamp,
            'cpu': {
                'percent': round(cpu_percent, 2),
                'count': cpu_count
            },
            'memory': {
                'used_mb': round(memory_mb, 2),
                'percent': round(memory_percent, 2),
                'available_mb': round(memory_available_mb, 2),
                'total_mb': round(memory_total_mb, 2)
            },
            'network': {
                'total_sent_mb': round(total_sent_mb, 2),
                'total_recv_mb': round(total_recv_mb, 2),
                'sent_mbps': round(network_sent_mbps, 3),
                'recv_mbps': round(network_recv_mbps, 3)
            },
            'disk': {
                'percent': round(disk_percent, 2)
            }
        }
    
    def get_process_metrics(self, pid: Optional[int] = None) -> Dict:
        """
        Collecte les métriques d'un processus spécifique.
        Utile pour monitorer un viewer individuel.
        
        Args:
            pid: Process ID (None = processus courant)
            
        Returns:
            dict: Métriques du processus
        """
        try:
            process = psutil.Process(pid)
            
            return {
                'pid': process.pid,
                'cpu_percent': round(process.cpu_percent(interval=0.1), 2),
                'memory_mb': round(process.memory_info().rss / (1024 * 1024), 2),
                'memory_percent': round(process.memory_percent(), 2),
                'num_threads': process.num_threads(),
                'status': process.status()
            }
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None


class MetricsAggregator:
    """Agrège les métriques de plusieurs viewers/workers"""
    
    def __init__(self):
        self.metrics_history = []
    
    def add_snapshot(self, metrics: Dict):
        """Ajoute un snapshot de métriques à l'historique"""
        self.metrics_history.append(metrics)
    
    def get_history(self):
        """Retourne l'historique complet"""
        return self.metrics_history
    
    def get_summary_stats(self) -> Dict:
        """Calcule des statistiques résumées sur l'historique"""
        if not self.metrics_history:
            return {}
        
        cpu_values = [m['cpu']['percent'] for m in self.metrics_history if 'cpu' in m]
        memory_values = [m['memory']['percent'] for m in self.metrics_history if 'memory' in m]
        
        import numpy as np
        
        return {
            'cpu': {
                'mean': round(np.mean(cpu_values), 2) if cpu_values else 0,
                'max': round(np.max(cpu_values), 2) if cpu_values else 0,
                'min': round(np.min(cpu_values), 2) if cpu_values else 0,
                'std': round(np.std(cpu_values), 2) if cpu_values else 0
            },
            'memory': {
                'mean': round(np.mean(memory_values), 2) if memory_values else 0,
                'max': round(np.max(memory_values), 2) if memory_values else 0,
                'min': round(np.min(memory_values), 2) if memory_values else 0,
                'std': round(np.std(memory_values), 2) if memory_values else 0
            },
            'duration': self.metrics_history[-1]['timestamp'] - self.metrics_history[0]['timestamp'] if len(self.metrics_history) > 1 else 0,
            'samples': len(self.metrics_history)
        }
