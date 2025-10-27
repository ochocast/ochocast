#!/usr/bin/env python3
"""
Script d'analyse pour le benchmark distribué.
Analyse les résultats du benchmark distribué et génère des rapports/graphiques.

Usage:
    python analyse_distributed.py <input_dir> <output_dir>
    
Exemple:
    python analyse_distributed.py ./distributed_benchmark_data ./analysis_results
"""
import json
import os
import sys
import argparse
import glob
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime

# Réutiliser les fonctions du script d'analyse original
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from benchmark.rework.analyse import (
    fix_sequence_number_decoding,
    analyze_latencies,
    plot_latency_per_viewer,
    plot_average_latency,
    plot_host_timing_accuracy,
    plot_aggregated_errors,
    generate_detailed_report
)


def load_data_websocket(data_dir):
    """
    Charge les données depuis le nouveau format WebSocket (viewer_detections/*.json).
    Transforme les données au format attendu par les fonctions d'analyse originales.
    """
    # Charger host_timestamps.json
    host_path = os.path.join(data_dir, 'host_timestamps.json')
    if not os.path.exists(host_path):
        raise FileNotFoundError(f"Le fichier host_timestamps.json n'a pas été trouvé dans {data_dir}")

    with open(host_path, 'r') as f:
        host_data = json.load(f)

    # Charger les détections des viewers depuis viewer_detections/
    detections_dir = os.path.join(data_dir, 'viewer_detections')
    viewers_data = {}
    
    if os.path.exists(detections_dir):
        # Nouveau format WebSocket
        detection_files = glob.glob(os.path.join(detections_dir, '*_detections.json'))
        
        for detection_file in detection_files:
            filename = os.path.basename(detection_file)
            viewer_id = filename.replace('_detections.json', '').replace('viewer_', '')
            
            with open(detection_file, 'r') as f:
                detection_data = json.load(f)
            
            # Transformer au format attendu par analyze_latencies
            # Le nouveau format a: {viewer_id, total_detections, detections: [...]}
            # L'ancien format attendu: {session_info: {...}, red_detections: [...]}
            
            viewers_data[viewer_id] = {
                'session_info': {
                    'start_time': host_data.get('session_info', {}).get('start_time', datetime.now().isoformat()),
                    'viewer_id': detection_data.get('viewer_id', viewer_id)
                },
                'red_detections': detection_data.get('detections', [])
            }
            
            print(f"[Analysis] ✅ Loaded {len(detection_data.get('detections', []))} detections for viewer {viewer_id}")
    else:
        # Ancien format (fallback)
        viewer_files = [f for f in os.listdir(data_dir) if f.startswith('viewer_') and f.endswith('_timestamps.json')]
        for viewer_file in viewer_files:
            viewer_id = viewer_file.replace('viewer_', '').replace('_timestamps.json', '')
            with open(os.path.join(data_dir, viewer_file), 'r') as f:
                viewers_data[viewer_id] = json.load(f)

    if not viewers_data:
        print(f"[Analysis] ⚠️  No viewer data found in {data_dir}")
        print(f"[Analysis] Checked: {detections_dir}")
    
    return host_data, viewers_data


def load_worker_metrics(data_dir):
    """Charge les métriques système des workers"""
    metrics_dir = os.path.join(data_dir, 'worker_metrics')
    
    if not os.path.exists(metrics_dir):
        print(f"[Analysis] ⚠️  No worker metrics directory found")
        return {}
    
    worker_metrics = {}
    
    for metrics_file in glob.glob(os.path.join(metrics_dir, '*_metrics.json')):
        try:
            with open(metrics_file, 'r') as f:
                data = json.load(f)
                worker_id = data.get('worker_id')
                if worker_id:
                    worker_metrics[worker_id] = data
                    print(f"[Analysis] ✅ Loaded metrics for {worker_id}")
        except Exception as e:
            print(f"[Analysis] ⚠️  Error loading {metrics_file}: {e}")
    
    return worker_metrics


def plot_worker_metrics(worker_metrics, output_dir):
    """Crée des graphiques des métriques système des workers"""
    if not worker_metrics:
        print("[Analysis] ⚠️  No worker metrics to plot")
        return
    
    for worker_id, data in worker_metrics.items():
        metrics_history = data.get('metrics_history', [])
        if not metrics_history:
            continue
        
        # Extraire les données temporelles
        timestamps = [m['timestamp'] for m in metrics_history]
        relative_times = [t - timestamps[0] for t in timestamps]
        
        cpu_percent = [m['cpu']['percent'] for m in metrics_history]
        mem_percent = [m['memory']['percent'] for m in metrics_history]
        net_recv_mbps = [m['network']['recv_mbps'] for m in metrics_history]
        net_sent_mbps = [m['network']['sent_mbps'] for m in metrics_history]
        
        # Créer le graphique 3 sous-graphiques
        fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 10))
        
        # CPU
        ax1.plot(relative_times, cpu_percent, color='blue', linewidth=2)
        ax1.set_ylabel('CPU Usage (%)', fontsize=12)
        ax1.set_title(f'Worker {worker_id} - System Metrics', fontsize=14)
        ax1.grid(True, alpha=0.3)
        ax1.set_ylim(0, 100)
        
        # Moyenne et max CPU
        summary = data.get('summary', {})
        if summary:
            cpu_mean = summary.get('cpu_mean', 0)
            cpu_max = summary.get('cpu_max', 0)
            ax1.axhline(y=cpu_mean, color='blue', linestyle='--', alpha=0.5, label=f'Mean: {cpu_mean:.1f}%')
            ax1.legend(loc='upper right')
        
        # Mémoire
        ax2.plot(relative_times, mem_percent, color='green', linewidth=2)
        ax2.set_ylabel('Memory Usage (%)', fontsize=12)
        ax2.grid(True, alpha=0.3)
        ax2.set_ylim(0, 100)
        
        if summary:
            mem_mean = summary.get('memory_mean', 0)
            mem_max = summary.get('memory_max', 0)
            ax2.axhline(y=mem_mean, color='green', linestyle='--', alpha=0.5, label=f'Mean: {mem_mean:.1f}%')
            ax2.legend(loc='upper right')
        
        # Réseau
        ax3.plot(relative_times, net_recv_mbps, color='orange', linewidth=2, label='Download')
        ax3.plot(relative_times, net_sent_mbps, color='red', linewidth=2, label='Upload')
        ax3.set_xlabel('Time (s)', fontsize=12)
        ax3.set_ylabel('Network (Mbps)', fontsize=12)
        ax3.grid(True, alpha=0.3)
        ax3.legend(loc='upper right')
        
        plt.tight_layout()
        
        # Nom de fichier safe
        safe_worker_id = worker_id.replace(':', '_').replace('.', '_')
        plt.savefig(os.path.join(output_dir, f'worker_metrics_{safe_worker_id}.png'), dpi=300)
        plt.close()
        
        print(f"[Analysis] 📊 Metrics graph saved for {worker_id}")


def plot_workers_comparison(worker_metrics, output_dir):
    """Compare les métriques entre tous les workers"""
    if not worker_metrics or len(worker_metrics) < 2:
        return
    
    # Extraire les résumés
    workers = []
    cpu_means = []
    cpu_maxs = []
    mem_means = []
    mem_maxs = []
    
    for worker_id, data in worker_metrics.items():
        summary = data.get('summary', {})
        if summary:
            workers.append(worker_id)
            cpu_means.append(summary.get('cpu_mean', 0))
            cpu_maxs.append(summary.get('cpu_max', 0))
            mem_means.append(summary.get('memory_mean', 0))
            mem_maxs.append(summary.get('memory_max', 0))
    
    if not workers:
        return
    
    # Créer le graphique de comparaison
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
    
    x = np.arange(len(workers))
    width = 0.35
    
    # CPU
    ax1.bar(x - width/2, cpu_means, width, label='Mean', color='skyblue', alpha=0.8)
    ax1.bar(x + width/2, cpu_maxs, width, label='Max', color='navy', alpha=0.8)
    ax1.set_xlabel('Worker', fontsize=12)
    ax1.set_ylabel('CPU Usage (%)', fontsize=12)
    ax1.set_title('CPU Usage Comparison', fontsize=14)
    ax1.set_xticks(x)
    ax1.set_xticklabels(workers, rotation=45, ha='right')
    ax1.legend()
    ax1.grid(axis='y', alpha=0.3)
    
    # Mémoire
    ax2.bar(x - width/2, mem_means, width, label='Mean', color='lightgreen', alpha=0.8)
    ax2.bar(x + width/2, mem_maxs, width, label='Max', color='darkgreen', alpha=0.8)
    ax2.set_xlabel('Worker', fontsize=12)
    ax2.set_ylabel('Memory Usage (%)', fontsize=12)
    ax2.set_title('Memory Usage Comparison', fontsize=14)
    ax2.set_xticks(x)
    ax2.set_xticklabels(workers, rotation=45, ha='right')
    ax2.legend()
    ax2.grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'workers_comparison.png'), dpi=300)
    plt.close()
    
    print(f"[Analysis] 📊 Workers comparison graph saved")


def correlate_metrics_with_latency(worker_metrics, latencies_per_viewer, test_info, output_dir):
    """Corrèle les métriques système avec les latences"""
    if not worker_metrics or not test_info:
        return
    
    distribution = test_info.get('test_info', {}).get('distribution', {})
    if not distribution:
        return
    
    # Calculer la latence moyenne par worker
    worker_avg_latencies = {}
    
    for viewer_id, latencies in latencies_per_viewer.items():
        try:
            viewer_num = int(viewer_id.replace('viewer_', ''))
        except:
            continue
        
        # Trouver le worker correspondant
        current_count = 1
        for worker_ip, count in distribution.items():
            if viewer_num <= current_count + count - 1:
                if worker_ip not in worker_avg_latencies:
                    worker_avg_latencies[worker_ip] = []
                
                viewer_lats = [item['latency'] * 1000 for item in latencies]
                if viewer_lats:
                    worker_avg_latencies[worker_ip].append(np.mean(viewer_lats))
                break
            current_count += count
    
    # Calculer les moyennes finales
    workers = []
    avg_latencies = []
    cpu_means = []
    mem_means = []
    
    for worker_ip in distribution.keys():
        if worker_ip in worker_avg_latencies and worker_ip in worker_metrics:
            workers.append(worker_ip)
            avg_latencies.append(np.mean(worker_avg_latencies[worker_ip]))
            
            summary = worker_metrics[worker_ip].get('summary', {})
            cpu_means.append(summary.get('cpu_mean', 0))
            mem_means.append(summary.get('memory_mean', 0))
    
    if len(workers) < 2:
        return
    
    # Créer le graphique de corrélation
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
    
    # Latence vs CPU
    ax1.scatter(cpu_means, avg_latencies, s=100, alpha=0.6, color='blue')
    for i, worker in enumerate(workers):
        ax1.annotate(worker, (cpu_means[i], avg_latencies[i]), fontsize=8)
    ax1.set_xlabel('Average CPU Usage (%)', fontsize=12)
    ax1.set_ylabel('Average Latency (ms)', fontsize=12)
    ax1.set_title('Latency vs CPU Usage', fontsize=14)
    ax1.grid(True, alpha=0.3)
    
    # Latence vs Mémoire
    ax2.scatter(mem_means, avg_latencies, s=100, alpha=0.6, color='green')
    for i, worker in enumerate(workers):
        ax2.annotate(worker, (mem_means[i], avg_latencies[i]), fontsize=8)
    ax2.set_xlabel('Average Memory Usage (%)', fontsize=12)
    ax2.set_ylabel('Average Latency (ms)', fontsize=12)
    ax2.set_title('Latency vs Memory Usage', fontsize=14)
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'metrics_latency_correlation.png'), dpi=300)
    plt.close()
    
    print(f"[Analysis] 📊 Metrics-latency correlation graph saved")


def load_distributed_test_info(data_dir):
    """Charge les informations du test distribué"""
    report_path = os.path.join(data_dir, 'test_report.json')
    if os.path.exists(report_path):
        with open(report_path, 'r') as f:
            return json.load(f)
    return None


def plot_distribution_stats(test_info, output_dir):
    """Crée des graphiques sur la distribution des viewers"""
    if not test_info or 'distribution' not in test_info.get('test_info', {}):
        return
    
    distribution = test_info['test_info']['distribution']
    
    # Graphique en barres de la distribution
    plt.figure(figsize=(10, 6))
    workers = list(distribution.keys())
    counts = list(distribution.values())
    
    plt.bar(workers, counts, color='steelblue', alpha=0.7)
    plt.xlabel('Worker IP', fontsize=12)
    plt.ylabel('Nombre de Viewers', fontsize=12)
    plt.title('Distribution des Viewers par Worker', fontsize=14)
    plt.xticks(rotation=45, ha='right')
    plt.grid(axis='y', alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'distribution_per_worker.png'), dpi=300)
    plt.close()
    
    print(f"[Analysis] 📊 Distribution graph saved")


def plot_metrics_timeline(test_info, output_dir):
    """Crée un graphique de l'évolution des métriques dans le temps"""
    if not test_info or 'metrics_history' not in test_info:
        return
    
    history = test_info['metrics_history']
    if not history:
        return
    
    # Extraire les données temporelles
    timestamps = []
    total_connected = []
    total_red = []
    
    for snapshot in history:
        timestamps.append(snapshot['relative_time'])
        
        connected = 0
        red_count = 0
        
        for worker_ip, metrics in snapshot.get('workers', {}).items():
            if metrics.get('status') == 'ok':
                connected += metrics.get('connected_viewers', 0)
                red_count += metrics.get('total_red_detections', 0)
        
        total_connected.append(connected)
        total_red.append(red_count)
    
    # Créer le graphique
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8))
    
    # Graphique des viewers connectés
    ax1.plot(timestamps, total_connected, marker='o', linestyle='-', color='green', linewidth=2)
    ax1.set_xlabel('Temps (s)', fontsize=12)
    ax1.set_ylabel('Viewers Connectés', fontsize=12)
    ax1.set_title('Évolution des Viewers Connectés', fontsize=14)
    ax1.grid(True, alpha=0.3)
    
    # Graphique des détections de frames rouges
    ax2.plot(timestamps, total_red, marker='s', linestyle='-', color='red', linewidth=2)
    ax2.set_xlabel('Temps (s)', fontsize=12)
    ax2.set_ylabel('Détections de Frames Rouges', fontsize=12)
    ax2.set_title('Évolution des Détections (cumulé)', fontsize=14)
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'metrics_timeline.png'), dpi=300)
    plt.close()
    
    print(f"[Analysis] 📊 Timeline graph saved")


def plot_per_worker_performance(latencies_per_viewer, test_info, output_dir):
    """Crée un graphique comparant les performances par worker"""
    if not test_info or 'distribution' not in test_info.get('test_info', {}):
        return
    
    distribution = test_info['test_info']['distribution']
    
    # Regrouper les latences par worker
    worker_latencies = {}
    
    for viewer_id, latencies in latencies_per_viewer.items():
        # Extraire le numéro du viewer
        try:
            viewer_num = int(viewer_id.replace('viewer_', ''))
        except:
            continue
        
        # Trouver le worker correspondant
        current_count = 1
        for worker_ip, count in distribution.items():
            if viewer_num <= current_count + count - 1:
                if worker_ip not in worker_latencies:
                    worker_latencies[worker_ip] = []
                
                viewer_lats = [item['latency'] * 1000 for item in latencies]
                worker_latencies[worker_ip].extend(viewer_lats)
                break
            current_count += count
    
    # Créer le graphique en boîte à moustaches
    if worker_latencies:
        plt.figure(figsize=(12, 6))
        
        workers = list(worker_latencies.keys())
        data = [worker_latencies[w] for w in workers]
        
        bp = plt.boxplot(data, labels=workers, patch_artist=True)
        
        # Colorer les boîtes
        for patch in bp['boxes']:
            patch.set_facecolor('lightblue')
            patch.set_alpha(0.7)
        
        plt.xlabel('Worker IP', fontsize=12)
        plt.ylabel('Latence (ms)', fontsize=12)
        plt.title('Distribution des Latences par Worker', fontsize=14)
        plt.xticks(rotation=45, ha='right')
        plt.grid(axis='y', alpha=0.3)
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, 'latency_per_worker.png'), dpi=300)
        plt.close()
        
        print(f"[Analysis] 📊 Per-worker performance graph saved")
        
        # Afficher les stats par worker
        print("\n" + "="*60)
        print("STATISTIQUES PAR WORKER")
        print("-"*60)
        for worker_ip, lats in worker_latencies.items():
            if lats:
                print(f"{worker_ip}:")
                print(f"  - Latence moyenne: {np.mean(lats):.1f}ms")
                print(f"  - Latence médiane: {np.median(lats):.1f}ms")
                print(f"  - Latence min/max: {np.min(lats):.1f}ms / {np.max(lats):.1f}ms")
                print(f"  - Écart-type: {np.std(lats):.1f}ms")
                print(f"  - Mesures: {len(lats)}")
                print()


def generate_viewer_csv_reports(viewers_data, latencies_per_viewer, output_dir):
    """Génère des fichiers CSV avec les détails de chaque détection pour chaque viewer"""
    csv_dir = os.path.join(output_dir, 'viewer_detections_csv')
    os.makedirs(csv_dir, exist_ok=True)
    
    print(f"[Analysis] 📊 Generating CSV reports for {len(viewers_data)} viewers...")
    
    for viewer_id in sorted(viewers_data.keys()):
        viewer = viewers_data[viewer_id]
        latencies = latencies_per_viewer.get(viewer_id, [])
        red_detections = viewer.get('red_detections', [])
        
        if not red_detections:
            continue
        
        csv_path = os.path.join(csv_dir, f'viewer_{viewer_id}_detections.csv')
        
        # Créer un dictionnaire de latences par séquence pour accès rapide
        latency_by_seq = {item['sequence']: item['latency'] for item in latencies}
        
        with open(csv_path, 'w', newline='') as csvfile:
            import csv
            writer = csv.writer(csvfile)
            
            # En-têtes
            writer.writerow([
                'Sequence_Number',
                'Timestamp_Viewer',
                'Latency_ms',
                'Latency_s',
                'Relative_Time_s',
                'Frame_Number',
                'Mean_B',
                'Mean_G',
                'Mean_R'
            ])
            
            # Données
            for detection in red_detections:
                seq = detection.get('sequence_number', 0)
                ts_viewer = detection.get('timestamp', 0)
                relative_time = detection.get('relative_time', 0)
                frame_num = detection.get('frame', 0)
                mean_bgr = detection.get('mean_bgr', [0, 0, 0])
                
                # Chercher la latence correspondante
                latency_s = latency_by_seq.get(seq)
                if latency_s is not None:
                    latency_ms = latency_s * 1000
                else:
                    latency_s = ''
                    latency_ms = ''
                
                writer.writerow([
                    seq,
                    f'{ts_viewer:.6f}',
                    f'{latency_ms:.3f}' if latency_ms else '',
                    f'{latency_s:.6f}' if latency_s else '',
                    f'{relative_time:.6f}',
                    frame_num,
                    f'{mean_bgr[0]:.2f}',
                    f'{mean_bgr[1]:.2f}',
                    f'{mean_bgr[2]:.2f}'
                ])
    
    print(f"[Analysis] ✅ CSV reports saved in: {csv_dir}")
    
    # Générer aussi un CSV global avec toutes les latences
    global_csv_path = os.path.join(output_dir, 'all_latencies.csv')
    with open(global_csv_path, 'w', newline='') as csvfile:
        import csv
        writer = csv.writer(csvfile)
        
        writer.writerow([
            'Viewer_ID',
            'Sequence_Number',
            'Latency_ms',
            'Latency_s'
        ])
        
        for viewer_id in sorted(viewers_data.keys()):
            latencies = latencies_per_viewer.get(viewer_id, [])
            for lat_info in latencies:
                writer.writerow([
                    viewer_id,
                    lat_info['sequence'],
                    f"{lat_info['latency'] * 1000:.3f}",
                    f"{lat_info['latency']:.6f}"
                ])
    
    print(f"[Analysis] ✅ Global latencies CSV saved: {global_csv_path}")


def generate_distributed_report(host_data, viewers_data, latencies_per_viewer, errors, test_info, output_dir):
    """Génère un rapport détaillé pour le benchmark distribué"""
    report_path = os.path.join(output_dir, 'distributed_detailed_report.txt')
    
    # Générer aussi des CSV par viewer pour analyse approfondie
    generate_viewer_csv_reports(viewers_data, latencies_per_viewer, output_dir)
    
    with open(report_path, 'w') as f:
        f.write("=" * 80 + "\n")
        f.write("RAPPORT DÉTAILLÉ - BENCHMARK DISTRIBUÉ\n")
        f.write("=" * 80 + "\n\n")
        
        # Informations du test distribué
        if test_info:
            f.write("1. CONFIGURATION DU TEST DISTRIBUÉ\n")
            f.write("-" * 40 + "\n")
            
            ti = test_info.get('test_info', {})
            f.write(f"Début du test: {ti.get('start_time', 'N/A')}\n")
            f.write(f"Fin du test: {ti.get('end_time', 'N/A')}\n")
            f.write(f"Durée: {ti.get('duration', 0)} secondes\n")
            f.write(f"Nombre total de viewers: {ti.get('total_viewers', 0)}\n")
            f.write(f"Nombre de workers: {ti.get('num_workers', 0)}\n")
            f.write(f"URL SFU: {ti.get('sfu_url', 'N/A')}\n")
            f.write(f"Intervalle frames rouges: {ti.get('red_interval', 0)}s\n\n")
            
            f.write("Distribution des viewers:\n")
            distribution = ti.get('distribution', {})
            for worker_ip, count in distribution.items():
                f.write(f"  - {worker_ip}: {count} viewers\n")
            f.write("\n")
            
            # Erreurs du test
            test_errors = ti.get('errors', [])
            if test_errors:
                f.write("⚠️  Erreurs durant le test:\n")
                for error in test_errors:
                    f.write(f"  - {error}\n")
                f.write("\n")
        
        # Informations de session (du host)
        f.write("2. INFORMATIONS DE SESSION HOST\n")
        f.write("-" * 40 + "\n")
        f.write(f"Période d'analyse: {host_data['session_info']['start_time']} à {host_data['session_info']['end_time']}\n")
        f.write(f"Résolution: {host_data['session_info']['resolution']}\n")
        f.write(f"FPS: {host_data['session_info']['fps']}\n")
        f.write(f"Intervalle entre frames rouges: {host_data['session_info']['red_interval']}s\n")
        f.write(f"Total frames rouges envoyées: {host_data['session_info']['total_red_frames']}\n")
        f.write(f"Nombre de viewers: {len(viewers_data)}\n\n")
        
        # Statistiques de latence
        f.write("3. STATISTIQUES DE LATENCE GLOBALES\n")
        f.write("-" * 40 + "\n")
        
        all_latencies = []
        for viewer_id, latencies in latencies_per_viewer.items():
            viewer_lats = [item['latency'] * 1000 for item in latencies]
            all_latencies.extend(viewer_lats)
        
        if all_latencies:
            f.write(f"Latence moyenne globale: {np.mean(all_latencies):.1f}ms\n")
            f.write(f"Latence médiane globale: {np.median(all_latencies):.1f}ms\n")
            f.write(f"Latence min/max globale: {np.min(all_latencies):.1f}ms / {np.max(all_latencies):.1f}ms\n")
            f.write(f"Écart-type global: {np.std(all_latencies):.1f}ms\n")
            f.write(f"Percentile 95: {np.percentile(all_latencies, 95):.1f}ms\n")
            f.write(f"Percentile 99: {np.percentile(all_latencies, 99):.1f}ms\n\n")
        else:
            f.write("Aucune latence valide mesurée\n\n")
        
        # Erreurs
        f.write("4. ANALYSE DES ERREURS\n")
        f.write("-" * 40 + "\n")
        
        total_missing = sum(len(frames) for frames in errors['missing_frames'].values())
        total_duplicates = sum(len(frames) for frames in errors['duplicate_frames'].values())
        crashed_viewers = sum(1 for crashed in errors.get('crashed_viewers', {}).values() if crashed)
        
        f.write(f"Total frames manquantes: {total_missing}\n")
        f.write(f"Total frames dupliquées: {total_duplicates}\n")
        f.write(f"Viewers crashés: {crashed_viewers}\n")
        
        # Éviter division par zéro si pas de viewers
        if len(viewers_data) > 0:
            success_rate = (len(viewers_data) - crashed_viewers) / len(viewers_data) * 100
            f.write(f"Taux de succès: {success_rate:.1f}%\n\n")
        else:
            f.write(f"Taux de succès: N/A (aucun viewer)\n\n")
        
        # Précision du timing host
        f.write("5. PRÉCISION DU TIMING HOST\n")
        f.write("-" * 40 + "\n")
        
        timing_errors = host_data.get('performance_stats', {}).get('timing_errors_ms', [])
        if timing_errors:
            f.write(f"Erreur moyenne de timing: {np.mean(timing_errors):.1f}ms\n")
            f.write(f"Erreur max de timing: {np.max(timing_errors):.1f}ms\n")
            f.write(f"Écart-type des erreurs: {np.std(timing_errors):.1f}ms\n")
        else:
            f.write("Aucune donnée d'erreur de timing disponible\n")
        
        session_info = host_data.get('session_info', {})
        frames_dropped = session_info.get('frames_dropped', 0)
        frame_drop_rate = host_data.get('performance_stats', {}).get('frame_drop_rate', 0)
        
        f.write(f"Frames droppées: {frames_dropped}\n")
        f.write(f"Taux de drop: {frame_drop_rate:.2f}%\n\n")
        
        # Détails par viewer avec toutes les détections
        f.write("6. DÉTAILS PAR VIEWER (LATENCE ET DÉTECTIONS)\n")
        f.write("="*80 + "\n\n")
        
        for viewer_id in sorted(viewers_data.keys()):
            viewer = viewers_data[viewer_id]
            latencies = latencies_per_viewer.get(viewer_id, [])
            
            f.write(f"Viewer: {viewer_id}\n")
            f.write("-" * 80 + "\n")
            
            # Informations de session
            session_info = viewer.get('session_info', {})
            f.write(f"  Session:\n")
            f.write(f"    - Start: {session_info.get('start_time', 'N/A')}\n")
            f.write(f"    - First frame: {session_info.get('first_frame_timestamp', 'N/A')}\n")
            f.write(f"    - End: {session_info.get('end_time', 'N/A')}\n")
            f.write(f"    - Exit error: {session_info.get('exit_error', False)}\n")
            if session_info.get('exit_reason'):
                f.write(f"    - Exit reason: {session_info.get('exit_reason')}\n")
            f.write(f"    - Total détections: {session_info.get('total_red_detections', 0)}\n\n")
            
            # Statistiques de latence pour ce viewer
            if latencies:
                viewer_lats = [item['latency'] * 1000 for item in latencies]
                f.write(f"  Statistiques de latence:\n")
                f.write(f"    - Latence moyenne: {np.mean(viewer_lats):.1f}ms\n")
                f.write(f"    - Latence médiane: {np.median(viewer_lats):.1f}ms\n")
                f.write(f"    - Latence min/max: {np.min(viewer_lats):.1f}ms / {np.max(viewer_lats):.1f}ms\n")
                f.write(f"    - Écart-type: {np.std(viewer_lats):.1f}ms\n")
                f.write(f"    - P95: {np.percentile(viewer_lats, 95):.1f}ms\n")
                f.write(f"    - P99: {np.percentile(viewer_lats, 99):.1f}ms\n\n")
            else:
                f.write(f"  ⚠️  Aucune latence valide mesurée\n\n")
            
            # Détail de chaque détection avec timestamp et latence
            red_detections = viewer.get('red_detections', [])
            if red_detections:
                # Créer un dictionnaire de latences par séquence pour accès rapide
                latency_by_seq = {item['sequence']: item['latency'] for item in latencies}
                
                f.write(f"  Détections ({len(red_detections)} frames rouges):\n")
                f.write(f"    {'Seq':<6} {'Timestamp Viewer':<20} {'Latence (ms)':<15} {'Temps relatif (s)'}\n")
                f.write(f"    {'-'*6} {'-'*20} {'-'*15} {'-'*18}\n")
                
                for detection in red_detections:
                    seq = detection.get('sequence_number', 0)
                    ts_viewer = detection.get('timestamp', 0)
                    relative_time = detection.get('relative_time', 0)
                    
                    # Chercher la latence correspondante
                    latency_s = latency_by_seq.get(seq)
                    if latency_s is not None:
                        latency_ms = latency_s * 1000
                        f.write(f"    {seq:<6} {ts_viewer:<20.6f} {latency_ms:<15.1f} {relative_time:<18.3f}\n")
                    else:
                        f.write(f"    {seq:<6} {ts_viewer:<20.6f} {'N/A':<15} {relative_time:<18.3f}\n")
                
                f.write("\n")
            else:
                f.write(f"  ⚠️  Aucune détection enregistrée\n\n")
            
            # Erreurs spécifiques à ce viewer
            missing = errors['missing_frames'].get(viewer_id, [])
            duplicates = errors['duplicate_frames'].get(viewer_id, [])
            
            if missing or duplicates:
                f.write(f"  Erreurs:\n")
                if missing:
                    f.write(f"    - Frames manquantes: {len(missing)} - Séquences: {missing[:10]}")
                    if len(missing) > 10:
                        f.write(f" ... (+{len(missing)-10} autres)")
                    f.write("\n")
                if duplicates:
                    f.write(f"    - Frames dupliquées: {len(duplicates)} - Séquences: {duplicates[:10]}")
                    if len(duplicates) > 10:
                        f.write(f" ... (+{len(duplicates)-10} autres)")
                    f.write("\n")
            
            f.write("\n")
        
        # Métriques finales agrégées
        if test_info and 'final_aggregated' in test_info:
            f.write("7. MÉTRIQUES FINALES AGRÉGÉES\n")
            f.write("-" * 40 + "\n")
            
            final = test_info['final_aggregated']
            f.write(f"Viewers connectés: {final.get('connected_viewers', 0)}/{final.get('total_viewers', 0)}\n")
            f.write(f"Taux de connexion: {final.get('connection_rate', 0):.2f}%\n")
            f.write(f"Total détections frames rouges: {final.get('total_red_detections', 0)}\n")
            f.write(f"Viewers ayant reçu la première frame: {final.get('first_frame_received', 0)}\n")

    print(f"[Analysis] 📝 Rapport distribué détaillé sauvegardé: {report_path}")


def main():
    parser = argparse.ArgumentParser(description="Analyse les données du benchmark distribué.")
    parser.add_argument('input_dir', type=str, help="Dossier contenant les fichiers de données JSON.")
    parser.add_argument('output_dir', type=str, help="Dossier où sauvegarder les analyses (graphiques, rapports).")
    args = parser.parse_args()

    if not os.path.exists(args.output_dir):
        os.makedirs(args.output_dir)

    print("\n" + "="*80)
    print("🔍 ANALYSE DU BENCHMARK DISTRIBUÉ")
    print("="*80 + "\n")

    # Charger les données du test distribué
    test_info = load_distributed_test_info(args.input_dir)
    
    try:
        # Charger les données (host + viewers) - utilise le nouveau format WebSocket
        host_data, viewers_data = load_data_websocket(args.input_dir)
    except FileNotFoundError as e:
        print(f"❌ Erreur: {e}")
        return

    # Charger les métriques des workers
    worker_metrics = load_worker_metrics(args.input_dir)
    
    # Analyser les latences
    avg_latency, avg_connection_time, latencies_per_viewer, errors = analyze_latencies(host_data, viewers_data)

    # Affichage des résultats
    print(f"Analyse des données du dossier : {args.input_dir}")
    print("=" * 80)
    print("RÉSULTATS GÉNÉRAUX")
    print("-" * 40)
    print(f"Latence moyenne globale : {avg_latency * 1000:.1f} ms")
    print(f"Temps de connexion moyen des viewers : {avg_connection_time:.1f} secondes")
    
    if test_info:
        ti = test_info.get('test_info', {})
        print(f"Nombre de workers : {ti.get('num_workers', 'N/A')}")
        print(f"Total viewers : {ti.get('total_viewers', 'N/A')}")
    
    if worker_metrics:
        print(f"Métriques système collectées pour {len(worker_metrics)} worker(s)")
    
    print("\nERREURS DE MESURE")
    print("-" * 40)
    
    total_missing = sum(len(frames) for frames in errors['missing_frames'].values())
    total_duplicates = sum(len(frames) for frames in errors['duplicate_frames'].values())
    crashed_viewers = sum(1 for crashed in errors.get('crashed_viewers', {}).values() if crashed)
    
    if total_missing == 0 and total_duplicates == 0 and crashed_viewers == 0:
        print("✅ Aucune erreur de mesure détectée.")
    else:
        print(f"❌ Total frames manquantes: {total_missing}")
        print(f"⚠️  Total frames dupliquées: {total_duplicates}")
        print(f"💥 Viewers crashés: {crashed_viewers}")

    # Génération des graphiques
    print("\n" + "="*80)
    print("GÉNÉRATION DES GRAPHIQUES ET RAPPORTS")
    print("="*80 + "\n")
    
    plot_latency_per_viewer(latencies_per_viewer, args.output_dir)
    plot_average_latency(latencies_per_viewer, args.output_dir)
    
    # Vérifier que les données nécessaires existent avant d'appeler plot_host_timing_accuracy
    if 'performance_stats' in host_data and 'timing_errors_ms' in host_data['performance_stats']:
        plot_host_timing_accuracy(host_data, args.output_dir)
    else:
        print("[Analysis] ⚠️  Skipping host timing accuracy plot (no performance_stats data)")
    
    plot_aggregated_errors(errors, args.output_dir)
    
    # Graphiques spécifiques au distribué
    if test_info:
        plot_distribution_stats(test_info, args.output_dir)
        plot_metrics_timeline(test_info, args.output_dir)
        plot_per_worker_performance(latencies_per_viewer, test_info, args.output_dir)
    
    # Graphiques des métriques workers
    if worker_metrics:
        plot_worker_metrics(worker_metrics, args.output_dir)
        plot_workers_comparison(worker_metrics, args.output_dir)
        correlate_metrics_with_latency(worker_metrics, latencies_per_viewer, test_info, args.output_dir)
    
    # Rapports
    generate_detailed_report(host_data, viewers_data, latencies_per_viewer, errors, args.output_dir)
    generate_distributed_report(host_data, viewers_data, latencies_per_viewer, errors, test_info, args.output_dir)

    print(f"\n✅ Analyse terminée!")
    print(f"📊 Graphiques et rapports sauvegardés dans : {args.output_dir}")

if __name__ == '__main__':
    main()
