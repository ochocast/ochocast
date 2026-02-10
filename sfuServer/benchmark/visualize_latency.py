#!/usr/bin/env python3
"""
Visualisations des latences du benchmark WebSocket
Crée des graphiques pour analyser les performances de latence
"""

import json
import os
import glob
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
import statistics
from datetime import datetime, timedelta
from collections import defaultdict
import seaborn as sns

# Configuration matplotlib
plt.style.use('default')
sns.set_palette("husl")


class LatencyVisualizer:
    """Créateur de visualisations de latence"""
    
    def __init__(self, results_dir: str):
        self.results_dir = results_dir
        self.benchmark_info = None
        self.host_timestamps = None
        self.worker_detections = {}
        self.latency_data = []
        
        self.load_data()
        self.calculate_latencies()
    
    def load_data(self):
        """Charge les données du benchmark"""
        print(f"📂 Chargement des données depuis {self.results_dir}")
        
        # Charger benchmark_info.json
        benchmark_path = os.path.join(self.results_dir, "benchmark_info.json")
        if os.path.exists(benchmark_path):
            with open(benchmark_path, 'r') as f:
                self.benchmark_info = json.load(f)
        
        # Charger host_timestamps.json
        host_path = os.path.join(self.results_dir, "host_timestamps.json")
        if os.path.exists(host_path):
            with open(host_path, 'r') as f:
                self.host_timestamps = json.load(f)
        
        # Charger les détections
        worker_dirs = glob.glob(os.path.join(self.results_dir, "worker_*"))
        for worker_dir in worker_dirs:
            worker_id = os.path.basename(worker_dir)
            self.worker_detections[worker_id] = []
            
            detection_files = glob.glob(os.path.join(worker_dir, "detections_*.json"))
            detection_files.sort()
            
            for detection_file in detection_files:
                with open(detection_file, 'r') as f:
                    data = json.load(f)
                    self.worker_detections[worker_id].extend(data.get('detections', []))
    
    def calculate_latencies(self):
        """Calcule les latences pour chaque détection"""
        if not self.host_timestamps or not self.worker_detections:
            print("❌ Données manquantes pour calculer les latences")
            return
        
        # Récupérer les timestamps d'envoi du host
        red_timestamps = self.host_timestamps.get('red_timestamps', [])
        host_sends = {rt['sequence_number']: rt['timestamp'] for rt in red_timestamps}
        
        # Calculer les latences
        for worker_id, detections in self.worker_detections.items():
            for detection in detections:
                seq = detection['sequence_number']
                recv_time = detection['timestamp']
                
                if seq in host_sends:
                    send_time = host_sends[seq]
                    latency = (recv_time - send_time) * 1000  # en ms
                    
                    if 0 <= latency <= 10000:  # Filtrer les valeurs aberrantes
                        self.latency_data.append({
                            'timestamp': recv_time,
                            'latency_ms': latency,
                            'sequence': seq,
                            'worker_id': worker_id,
                            'viewer_id': detection['viewer_id'],
                            'is_valid': detection.get('is_valid', False)
                        })
        
        print(f"✅ {len(self.latency_data)} latences calculées")
    
    def plot_latency_timeline(self):
        """Graphique 1: Timeline des latences"""
        if not self.latency_data:
            return
            
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(15, 10))
        
        # Données par worker
        worker_data = defaultdict(lambda: {'times': [], 'latencies': [], 'valid': []})
        start_time = min(d['timestamp'] for d in self.latency_data)
        
        for data in self.latency_data:
            relative_time = data['timestamp'] - start_time
            worker_data[data['worker_id']]['times'].append(relative_time)
            worker_data[data['worker_id']]['latencies'].append(data['latency_ms'])
            worker_data[data['worker_id']]['valid'].append(data['is_valid'])
        
        # Graphique 1: Latences par worker dans le temps
        colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728']
        for i, (worker_id, data) in enumerate(worker_data.items()):
            color = colors[i % len(colors)]
            ax1.scatter(data['times'], data['latencies'], 
                       label=worker_id, alpha=0.7, s=30, color=color)
            
            # Ligne de tendance mobile (moyenne sur 10 points)
            if len(data['latencies']) >= 10:
                window_size = min(10, len(data['latencies']))
                moving_avg = []
                moving_times = []
                for j in range(len(data['latencies']) - window_size + 1):
                    avg_latency = np.mean(data['latencies'][j:j+window_size])
                    avg_time = np.mean(data['times'][j:j+window_size])
                    moving_avg.append(avg_latency)
                    moving_times.append(avg_time)
                
                ax1.plot(moving_times, moving_avg, color=color, linewidth=2, alpha=0.8)
        
        ax1.set_xlabel('Temps relatif (secondes)')
        ax1.set_ylabel('Latence (ms)')
        ax1.set_title('📈 Timeline des Latences par Worker')
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        # Graphique 2: Latences valides vs invalides
        valid_times = [d['timestamp'] - start_time for d in self.latency_data if d['is_valid']]
        valid_latencies = [d['latency_ms'] for d in self.latency_data if d['is_valid']]
        invalid_times = [d['timestamp'] - start_time for d in self.latency_data if not d['is_valid']]
        invalid_latencies = [d['latency_ms'] for d in self.latency_data if not d['is_valid']]
        
        ax2.scatter(valid_times, valid_latencies, label='Détections valides', 
                   color='green', alpha=0.7, s=30)
        ax2.scatter(invalid_times, invalid_latencies, label='Détections invalides', 
                   color='red', alpha=0.7, s=30)
        
        ax2.set_xlabel('Temps relatif (secondes)')
        ax2.set_ylabel('Latence (ms)')
        ax2.set_title('🎯 Latences: Détections Valides vs Invalides')
        ax2.legend()
        ax2.grid(True, alpha=0.3)
        
        plt.tight_layout()
        return fig
    
    def plot_latency_distribution(self):
        """Graphique 2: Distribution des latences"""
        if not self.latency_data:
            return
            
        fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(15, 10))
        
        all_latencies = [d['latency_ms'] for d in self.latency_data]
        
        # Histogramme global
        ax1.hist(all_latencies, bins=50, alpha=0.7, color='skyblue', edgecolor='black')
        ax1.axvline(np.mean(all_latencies), color='red', linestyle='--', 
                   label=f'Moyenne: {np.mean(all_latencies):.1f}ms')
        ax1.axvline(np.median(all_latencies), color='orange', linestyle='--', 
                   label=f'Médiane: {np.median(all_latencies):.1f}ms')
        ax1.set_xlabel('Latence (ms)')
        ax1.set_ylabel('Fréquence')
        ax1.set_title('📊 Distribution Globale des Latences')
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        # Box plot par worker
        worker_latencies = []
        worker_labels = []
        for worker_id in sorted(self.worker_detections.keys()):
            worker_lats = [d['latency_ms'] for d in self.latency_data if d['worker_id'] == worker_id]
            if worker_lats:
                worker_latencies.append(worker_lats)
                worker_labels.append(worker_id)
        
        if worker_latencies:
            ax2.boxplot(worker_latencies, labels=worker_labels)
            ax2.set_ylabel('Latence (ms)')
            ax2.set_title('📦 Box Plot par Worker')
            ax2.grid(True, alpha=0.3)
        
        # Percentiles
        percentiles = [50, 75, 90, 95, 99]
        perc_values = [np.percentile(all_latencies, p) for p in percentiles]
        
        ax3.bar([f'P{p}' for p in percentiles], perc_values, color='lightcoral', alpha=0.7)
        ax3.set_ylabel('Latence (ms)')
        ax3.set_title('📊 Percentiles des Latences')
        ax3.grid(True, alpha=0.3)
        
        # CDF (Cumulative Distribution Function)
        sorted_latencies = sorted(all_latencies)
        cdf_y = np.arange(1, len(sorted_latencies) + 1) / len(sorted_latencies)
        
        ax4.plot(sorted_latencies, cdf_y, linewidth=2, color='purple')
        ax4.axvline(100, color='red', linestyle='--', alpha=0.7, label='100ms')
        ax4.axvline(500, color='orange', linestyle='--', alpha=0.7, label='500ms')
        ax4.axvline(1000, color='red', linestyle='--', alpha=0.7, label='1000ms')
        ax4.set_xlabel('Latence (ms)')
        ax4.set_ylabel('Probabilité cumulative')
        ax4.set_title('📈 CDF des Latences (SLA)')
        ax4.legend()
        ax4.grid(True, alpha=0.3)
        
        plt.tight_layout()
        return fig
    
    def plot_latency_heatmap(self):
        """Graphique 3: Heatmap latences par séquence et worker"""
        if not self.latency_data:
            return
            
        # Créer une matrice latences par séquence et worker
        sequences = sorted(set(d['sequence'] for d in self.latency_data))
        workers = sorted(set(d['worker_id'] for d in self.latency_data))
        
        # Matrice de latences moyennes
        latency_matrix = np.full((len(sequences), len(workers)), np.nan)
        count_matrix = np.zeros((len(sequences), len(workers)))
        
        for data in self.latency_data:
            seq_idx = sequences.index(data['sequence'])
            worker_idx = workers.index(data['worker_id'])
            
            if np.isnan(latency_matrix[seq_idx, worker_idx]):
                latency_matrix[seq_idx, worker_idx] = data['latency_ms']
                count_matrix[seq_idx, worker_idx] = 1
            else:
                # Moyenne des latences pour cette combo séquence/worker
                current_avg = latency_matrix[seq_idx, worker_idx]
                current_count = count_matrix[seq_idx, worker_idx]
                new_avg = (current_avg * current_count + data['latency_ms']) / (current_count + 1)
                latency_matrix[seq_idx, worker_idx] = new_avg
                count_matrix[seq_idx, worker_idx] += 1
        
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 8))
        
        # Heatmap des latences
        im1 = ax1.imshow(latency_matrix, cmap='RdYlBu_r', aspect='auto', interpolation='nearest')
        ax1.set_xlabel('Workers')
        ax1.set_ylabel('Séquences')
        ax1.set_title('🌡️ Heatmap Latences (ms)')
        ax1.set_xticks(range(len(workers)))
        ax1.set_xticklabels(workers, rotation=45)
        
        # Afficher seulement quelques séquences pour lisibilité
        if len(sequences) > 20:
            step = len(sequences) // 10
            seq_ticks = range(0, len(sequences), step)
            seq_labels = [sequences[i] for i in seq_ticks]
        else:
            seq_ticks = range(len(sequences))
            seq_labels = sequences
        
        ax1.set_yticks(seq_ticks)
        ax1.set_yticklabels(seq_labels)
        
        plt.colorbar(im1, ax=ax1, label='Latence (ms)')
        
        # Heatmap du nombre de détections
        im2 = ax2.imshow(count_matrix, cmap='Blues', aspect='auto', interpolation='nearest')
        ax2.set_xlabel('Workers')
        ax2.set_ylabel('Séquences')
        ax2.set_title('📊 Heatmap Nombre Détections')
        ax2.set_xticks(range(len(workers)))
        ax2.set_xticklabels(workers, rotation=45)
        ax2.set_yticks(seq_ticks)
        ax2.set_yticklabels(seq_labels)
        
        plt.colorbar(im2, ax=ax2, label='Nombre détections')
        
        plt.tight_layout()
        return fig
    
    def plot_latency_stats(self):
        """Graphique 4: Statistiques détaillées"""
        if not self.latency_data:
            return
            
        fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(15, 10))
        
        # Stats par worker
        worker_stats = {}
        for worker_id in sorted(self.worker_detections.keys()):
            worker_lats = [d['latency_ms'] for d in self.latency_data if d['worker_id'] == worker_id]
            if worker_lats:
                worker_stats[worker_id] = {
                    'mean': np.mean(worker_lats),
                    'median': np.median(worker_lats),
                    'std': np.std(worker_lats),
                    'p95': np.percentile(worker_lats, 95),
                    'count': len(worker_lats)
                }
        
        # Comparaison moyennes/médianes par worker
        workers = list(worker_stats.keys())
        means = [worker_stats[w]['mean'] for w in workers]
        medians = [worker_stats[w]['median'] for w in workers]
        
        x = np.arange(len(workers))
        width = 0.35
        
        ax1.bar(x - width/2, means, width, label='Moyenne', alpha=0.8)
        ax1.bar(x + width/2, medians, width, label='Médiane', alpha=0.8)
        ax1.set_xlabel('Workers')
        ax1.set_ylabel('Latence (ms)')
        ax1.set_title('📊 Moyenne vs Médiane par Worker')
        ax1.set_xticks(x)
        ax1.set_xticklabels(workers)
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        # Écart-type par worker
        stds = [worker_stats[w]['std'] for w in workers]
        ax2.bar(workers, stds, color='orange', alpha=0.7)
        ax2.set_xlabel('Workers')
        ax2.set_ylabel('Écart-type (ms)')
        ax2.set_title('📊 Variabilité par Worker')
        ax2.grid(True, alpha=0.3)
        
        # SLA Compliance
        all_latencies = [d['latency_ms'] for d in self.latency_data]
        sla_thresholds = [50, 100, 200, 500, 1000]
        sla_compliance = []
        
        for threshold in sla_thresholds:
            compliance = sum(1 for lat in all_latencies if lat <= threshold) / len(all_latencies) * 100
            sla_compliance.append(compliance)
        
        ax3.bar([f'{t}ms' for t in sla_thresholds], sla_compliance, 
               color=['green', 'lightgreen', 'yellow', 'orange', 'red'], alpha=0.7)
        ax3.set_xlabel('Seuil SLA')
        ax3.set_ylabel('% Respect SLA')
        ax3.set_title('🎯 SLA Compliance')
        ax3.set_ylim(0, 100)
        ax3.grid(True, alpha=0.3)
        
        # Evolution temporelle de la latence (moyenne mobile)
        times = [d['timestamp'] for d in self.latency_data]
        latencies = [d['latency_ms'] for d in self.latency_data]
        
        # Trier par timestamp
        sorted_data = sorted(zip(times, latencies))
        sorted_times, sorted_latencies = zip(*sorted_data)
        
        # Moyenne mobile sur 20 points
        window_size = min(20, len(sorted_latencies))
        if len(sorted_latencies) >= window_size:
            moving_avg = []
            moving_times = []
            start_time = min(sorted_times)
            
            for i in range(len(sorted_latencies) - window_size + 1):
                avg_lat = np.mean(sorted_latencies[i:i+window_size])
                avg_time = (sorted_times[i + window_size//2] - start_time)
                moving_avg.append(avg_lat)
                moving_times.append(avg_time)
            
            ax4.plot(moving_times, moving_avg, linewidth=2, color='blue')
            ax4.set_xlabel('Temps relatif (s)')
            ax4.set_ylabel('Latence moyenne mobile (ms)')
            ax4.set_title('📈 Évolution Latence (Moyenne Mobile)')
            ax4.grid(True, alpha=0.3)
        
        plt.tight_layout()
        return fig
    
    def create_all_visualizations(self):
        """Crée toutes les visualisations et les sauvegarde"""
        if not self.latency_data:
            print("❌ Aucune donnée de latence disponible")
            return
        
        print(f"\n🎨 Création des visualisations de latence...")
        
        # Créer le dossier de sortie
        output_dir = os.path.join(self.results_dir, "visualizations")
        os.makedirs(output_dir, exist_ok=True)
        
        figures = []
        
        # 1. Timeline des latences
        print("📈 Création timeline des latences...")
        fig1 = self.plot_latency_timeline()
        if fig1:
            fig1.savefig(os.path.join(output_dir, "latency_timeline.png"), dpi=300, bbox_inches='tight')
            figures.append(("Timeline des latences", "latency_timeline.png"))
        
        # 2. Distribution des latences  
        print("📊 Création distribution des latences...")
        fig2 = self.plot_latency_distribution()
        if fig2:
            fig2.savefig(os.path.join(output_dir, "latency_distribution.png"), dpi=300, bbox_inches='tight')
            figures.append(("Distribution des latences", "latency_distribution.png"))
        
        # 3. Heatmap
        print("🌡️ Création heatmap latences...")
        fig3 = self.plot_latency_heatmap()
        if fig3:
            fig3.savefig(os.path.join(output_dir, "latency_heatmap.png"), dpi=300, bbox_inches='tight')
            figures.append(("Heatmap latences", "latency_heatmap.png"))
        
        # 4. Statistiques détaillées
        print("📊 Création statistiques détaillées...")
        fig4 = self.plot_latency_stats()
        if fig4:
            fig4.savefig(os.path.join(output_dir, "latency_stats.png"), dpi=300, bbox_inches='tight')
            figures.append(("Statistiques détaillées", "latency_stats.png"))
        
        # Afficher les statistiques résumées
        self.print_summary_stats()
        
        print(f"\n✅ Visualisations créées dans {output_dir}/")
        for title, filename in figures:
            print(f"   📊 {title}: {filename}")
        
        return figures
    
    def print_summary_stats(self):
        """Affiche un résumé des statistiques de latence"""
        if not self.latency_data:
            return
            
        all_latencies = [d['latency_ms'] for d in self.latency_data]
        
        print(f"\n📊 RÉSUMÉ STATISTIQUES LATENCE")
        print(f"=" * 50)
        print(f"📈 Échantillons total: {len(all_latencies)}")
        print(f"⚡ Latence moyenne: {np.mean(all_latencies):.1f} ms")
        print(f"🎯 Latence médiane: {np.median(all_latencies):.1f} ms")
        print(f"📊 Écart-type: {np.std(all_latencies):.1f} ms")
        print(f"⬇️  Latence min: {min(all_latencies):.1f} ms")
        print(f"⬆️  Latence max: {max(all_latencies):.1f} ms")
        
        print(f"\n🎯 PERCENTILES:")
        for p in [50, 90, 95, 99]:
            value = np.percentile(all_latencies, p)
            print(f"   P{p}: {value:.1f} ms")
        
        print(f"\n🎯 SLA COMPLIANCE:")
        for threshold in [100, 500, 1000]:
            compliance = sum(1 for lat in all_latencies if lat <= threshold) / len(all_latencies) * 100
            print(f"   ≤ {threshold}ms: {compliance:.1f}%")


def main():
    """Point d'entrée principal"""
    results_dir = "./benchmark_results"
    
    if not os.path.exists(results_dir):
        print(f"❌ Dossier {results_dir} introuvable")
        return
    
    print("🎨 VISUALISATION DES LATENCES")
    print("=" * 50)
    
    # Créer le visualiseur
    visualizer = LatencyVisualizer(results_dir)
    
    # Créer toutes les visualisations
    figures = visualizer.create_all_visualizations()
    
    if figures:
        print(f"\n🖼️  {len(figures)} graphiques créés avec succès!")
        print(f"💡 Ouvre les fichiers PNG pour voir les résultats")
    else:
        print(f"\n❌ Aucune visualisation créée")


if __name__ == "__main__":
    main()