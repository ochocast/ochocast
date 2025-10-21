import json
import os
import argparse
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime

def load_data(data_dir):
    """
    Charge les données du host et des viewers depuis le dossier spécifié.
    """
    host_path = os.path.join(data_dir, 'host_timestamps.json')
    if not os.path.exists(host_path):
        raise FileNotFoundError(f"Le fichier host_timestamps.json n'a pas été trouvé dans {data_dir}")

    with open(host_path, 'r') as f:
        host_data = json.load(f)

    viewer_files = [f for f in os.listdir(data_dir) if f.startswith('viewer_') and f.endswith('_timestamps.json')]
    viewers_data = {}
    for viewer_file in viewer_files:
        viewer_id = viewer_file.replace('viewer_', '').replace('_timestamps.json', '')
        with open(os.path.join(data_dir, viewer_file), 'r') as f:
            viewers_data[viewer_id] = json.load(f)

    return host_data, viewers_data

def fix_sequence_number_decoding(viewer_data):
    """
    Corrige le décodage des numéros de séquence des viewers en utilisant la logique correcte.
    """
    fixed_detections = []
    
    for detection in viewer_data['red_detections']:
        # Récupérer les valeurs BGR
        b, g, r = detection['mean_bgr']
        
        # Vérifier si c'est bien une frame rouge
        if r > 128 and r > b + 50 and r > g + 50:
            # Décoder le numéro de séquence selon la logique du host
            seq_low = int(round(g))
            seq_high = int(round(b))
            correct_sequence = seq_low + (seq_high << 8)
            
            # Valider le numéro de séquence
            if 1 <= correct_sequence <= 65535:
                # Mettre à jour avec le bon numéro de séquence
                detection['sequence_number'] = correct_sequence
                detection['original_sequence'] = detection.get('sequence_number', 0)  # Garder l'original pour debug
                fixed_detections.append(detection)
            else:
                print(f"[Debug] Invalid sequence number {correct_sequence} from BGR({b:.1f}, {g:.1f}, {r:.1f})")
        else:
            print(f"[Debug] Not a red frame: BGR({b:.1f}, {g:.1f}, {r:.1f})")
    
    return fixed_detections

def analyze_latencies(host_data, viewers_data):
    """
    Analyse les latences, les erreurs de mesure et les temps de connexion.
    """
    host_timestamps = {item['sequence_number']: item['timestamp'] for item in host_data['red_timestamps'] if 'timestamp' in item}
    
    all_latencies = []
    latencies_per_viewer = {}
    connection_times = []
    errors = {'missing_frames': {}, 'duplicate_frames': {}, 'invalid_latency_frames': {}, 'decoding_errors': {}}

    host_start_time = datetime.fromisoformat(host_data['session_info']['start_time'])
    host_sequences = set(host_timestamps.keys())

    print(f"[Debug] Host sent sequences: {sorted(host_sequences)}")

    for viewer_id, viewer_data in viewers_data.items():
        print(f"\n[Debug] Analyzing viewer {viewer_id}")
        
        viewer_latencies = []
        latencies_per_viewer[viewer_id] = []
        errors['missing_frames'][viewer_id] = []
        errors['duplicate_frames'][viewer_id] = []
        errors['invalid_latency_frames'][viewer_id] = []
        errors['decoding_errors'][viewer_id] = []
        
        # Temps de connexion
        viewer_start_time = datetime.fromisoformat(viewer_data['session_info']['start_time'])
        connection_time = (viewer_start_time - host_start_time).total_seconds()
        connection_times.append(connection_time)

        # Corriger le décodage des numéros de séquence
        fixed_detections = fix_sequence_number_decoding(viewer_data)
        
        print(f"[Debug] Original detections: {len(viewer_data['red_detections'])}, Fixed: {len(fixed_detections)}")
        
        # Regrouper les détections par numéro de séquence pour gérer les doublons
        detections_by_seq = {}
        for detection in fixed_detections:
            seq = detection['sequence_number']
            if seq not in detections_by_seq:
                detections_by_seq[seq] = []
            detections_by_seq[seq].append(detection)

        print(f"[Debug] Detected sequences: {sorted(detections_by_seq.keys())}")

        # Identifier les doublons
        for seq, items in detections_by_seq.items():
            if len(items) > 1:
                errors['duplicate_frames'][viewer_id].append(seq)
                print(f"[Debug] Duplicate sequence {seq}: {len(items)} detections")

        # Analyse des latences et erreurs
        for seq in sorted(list(host_sequences)):
            if seq not in detections_by_seq:
                errors['missing_frames'][viewer_id].append(seq)
                continue

            # Trouver la première latence valide
            latency_found = False
            for item in detections_by_seq[seq]:
                if 'timestamp' in item:
                    latency = item['timestamp'] - host_timestamps[seq]
                    if latency > 0:
                        viewer_latencies.append(latency)
                        latencies_per_viewer[viewer_id].append({'sequence': seq, 'latency': latency})
                        latency_found = True
                        print(f"[Debug] Seq {seq}: latency = {latency*1000:.1f}ms")
                        break # On a trouvé une latence valide, on passe à la séquence suivante
            
            if not latency_found:
                errors['invalid_latency_frames'][viewer_id].append(seq)

        if viewer_latencies:
            all_latencies.extend(viewer_latencies)
        
        print(f"[Debug] Viewer {viewer_id} summary:")
        print(f"  - Valid latencies: {len(viewer_latencies)}")
        print(f"  - Missing frames: {len(errors['missing_frames'][viewer_id])}")
        print(f"  - Duplicate frames: {len(errors['duplicate_frames'][viewer_id])}")

    avg_latency = np.mean(all_latencies) if all_latencies else 0
    avg_connection_time = np.mean(connection_times) if connection_times else 0

    return avg_latency, avg_connection_time, latencies_per_viewer, errors

def plot_latency_per_viewer(latencies_per_viewer, output_dir):
    """
    Crée un graphique avec une ligne de latence par viewer.
    """
    plt.figure(figsize=(14, 8))
    
    colors = ['blue', 'red', 'green', 'orange', 'purple', 'brown', 'pink', 'gray', 'olive', 'cyan']
    
    for i, (viewer_id, latencies) in enumerate(latencies_per_viewer.items()):
        if latencies:
            sequences = [item['sequence'] for item in latencies]
            values = [item['latency'] * 1000 for item in latencies] # en ms
            color = colors[i % len(colors)]
            plt.plot(sequences, values, marker='o', linestyle='-', label=f'Viewer {viewer_id}', 
                    color=color, markersize=4, linewidth=1.5)
    
    plt.title('Latence par Viewer', fontsize=14)
    plt.xlabel('Numéro de Séquence de Trame', fontsize=12)
    plt.ylabel('Latence (ms)', fontsize=12)
    plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'latency_per_viewer.png'), dpi=300, bbox_inches='tight')
    plt.close()

def plot_average_latency(latencies_per_viewer, output_dir):
    """
    Crée un graphique de la latence moyenne de toutes les viewers.
    """
    all_lats = {}
    for viewer_id, latencies in latencies_per_viewer.items():
        for lat in latencies:
            seq = lat['sequence']
            if seq not in all_lats:
                all_lats[seq] = []
            all_lats[seq].append(lat['latency'])

    if not all_lats:
        print("[Warning] No latency data available for average plot")
        return

    avg_lats = {seq: np.mean(vals) for seq, vals in all_lats.items()}
    std_lats = {seq: np.std(vals) for seq, vals in all_lats.items()}
    
    sequences = sorted(avg_lats.keys())
    avg_values = [avg_lats[seq] * 1000 for seq in sequences] # en ms
    std_values = [std_lats[seq] * 1000 for seq in sequences] # en ms

    plt.figure(figsize=(12, 6))
    plt.errorbar(sequences, avg_values, yerr=std_values, marker='o', linestyle='-', 
                color='b', capsize=3, capthick=1, elinewidth=1)
    plt.title('Latence Moyenne (tous viewers)', fontsize=14)
    plt.xlabel('Numéro de Séquence de Trame', fontsize=12)
    plt.ylabel('Latence Moyenne (ms)', fontsize=12)
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'average_latency.png'), dpi=300)
    plt.close()

def plot_host_timing_accuracy(host_data, output_dir):
    """
    Crée un graphique montrant la précision du timing côté host.
    """
    timing_errors = host_data['performance_stats']['timing_errors_ms']
    sequences = list(range(2, len(timing_errors) + 2))  # Commence à 2 car le premier n'a pas d'erreur
    
    plt.figure(figsize=(12, 6))
    plt.plot(sequences, timing_errors, marker='o', linestyle='-', color='red', markersize=4)
    plt.axhline(y=np.mean(timing_errors), color='blue', linestyle='--', alpha=0.7, 
                label=f'Moyenne: {np.mean(timing_errors):.1f}ms')
    plt.title('Précision du Timing - Host', fontsize=14)
    plt.xlabel('Numéro de Séquence de Trame', fontsize=12)
    plt.ylabel('Erreur de Timing (ms)', fontsize=12)
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'host_timing_accuracy.png'), dpi=300)
    plt.close()

def plot_aggregated_errors(errors, output_dir):
    """
    Crée un diagramme en bâtons récapitulatif des erreurs pour tous les viewers.
    """
    missing_counts = {}
    dup_counts = {}
    
    # Compter les erreurs par frame
    for viewer_id, frames in errors['missing_frames'].items():
        for frame in frames:
            missing_counts[frame] = missing_counts.get(frame, 0) + 1

    for viewer_id, frames in errors['duplicate_frames'].items():
        for frame in frames:
            dup_counts[frame] = dup_counts.get(frame, 0) + 1

    all_error_frames = set(list(missing_counts.keys()) + list(dup_counts.keys()))
    
    if not all_error_frames:
        print("[Warning] No errors to plot")
        return

    sorted_frames = sorted(list(all_error_frames))
    x = np.arange(len(sorted_frames))
    width = 0.35

    missing_values = [missing_counts.get(frame, 0) for frame in sorted_frames]
    dup_values = [dup_counts.get(frame, 0) for frame in sorted_frames]

    fig, ax = plt.subplots(figsize=(15, 7))
    ax.bar(x - width/2, missing_values, width, label='Frames Manquantes', color='red', alpha=0.7)
    ax.bar(x + width/2, dup_values, width, label='Frames Dupliquées', color='orange', alpha=0.7)

    ax.set_xlabel('Numéro de Séquence de Trame', fontsize=12)
    ax.set_ylabel('Nombre de Viewers avec Erreur', fontsize=12)
    ax.set_title('Récapitulatif des Erreurs par Trame (tous viewers)', fontsize=14)
    ax.set_xticks(x)
    ax.set_xticklabels(sorted_frames, rotation=45, fontsize=8)
    ax.legend()
    ax.grid(axis='y', alpha=0.3)
    
    # S'assurer que l'axe Y a des graduations entières
    max_y = max(max(missing_values) if missing_values else [0], max(dup_values) if dup_values else [0])
    if max_y > 0:
        ax.set_yticks(np.arange(0, max_y + 1, 1))

    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'aggregated_errors.png'), dpi=300, bbox_inches='tight')
    plt.close()

def generate_detailed_report(host_data, viewers_data, latencies_per_viewer, errors, output_dir):
    """
    Génère un rapport détaillé en texte.
    """
    report_path = os.path.join(output_dir, 'detailed_report.txt')
    
    with open(report_path, 'w') as f:
        f.write("=== RAPPORT DÉTAILLÉ D'ANALYSE DE LATENCE ===\n\n")
        
        # Informations de session
        f.write("1. INFORMATIONS DE SESSION\n")
        f.write("-" * 40 + "\n")
        f.write(f"Période d'analyse: {host_data['session_info']['start_time']} à {host_data['session_info']['end_time']}\n")
        f.write(f"Résolution: {host_data['session_info']['resolution']}\n")
        f.write(f"FPS: {host_data['session_info']['fps']}\n")
        f.write(f"Intervalle entre frames rouges: {host_data['session_info']['red_interval']}s\n")
        f.write(f"Total frames rouges envoyées: {host_data['session_info']['total_red_frames']}\n")
        f.write(f"Nombre de viewers: {len(viewers_data)}\n\n")
        
        # Statistiques de latence
        f.write("2. STATISTIQUES DE LATENCE\n")
        f.write("-" * 40 + "\n")
        
        all_latencies = []
        for viewer_id, latencies in latencies_per_viewer.items():
            viewer_lats = [item['latency'] * 1000 for item in latencies]
            all_latencies.extend(viewer_lats)
            
            if viewer_lats:
                f.write(f"Viewer {viewer_id}:\n")
                f.write(f"  - Frames détectées: {len(viewer_lats)}\n")
                f.write(f"  - Latence moyenne: {np.mean(viewer_lats):.1f}ms\n")
                f.write(f"  - Latence médiane: {np.median(viewer_lats):.1f}ms\n")
                f.write(f"  - Latence min/max: {np.min(viewer_lats):.1f}ms / {np.max(viewer_lats):.1f}ms\n")
                f.write(f"  - Écart-type: {np.std(viewer_lats):.1f}ms\n\n")
        
        if all_latencies:
            f.write("GLOBAL (tous viewers):\n")
            f.write(f"  - Latence moyenne globale: {np.mean(all_latencies):.1f}ms\n")
            f.write(f"  - Latence médiane globale: {np.median(all_latencies):.1f}ms\n")
            f.write(f"  - Latence min/max globale: {np.min(all_latencies):.1f}ms / {np.max(all_latencies):.1f}ms\n")
            f.write(f"  - Écart-type global: {np.std(all_latencies):.1f}ms\n\n")
        
        # Erreurs
        f.write("3. ANALYSE DES ERREURS\n")
        f.write("-" * 40 + "\n")
        
        total_missing = sum(len(frames) for frames in errors['missing_frames'].values())
        total_duplicates = sum(len(frames) for frames in errors['duplicate_frames'].values())
        
        f.write(f"Total frames manquantes: {total_missing}\n")
        f.write(f"Total frames dupliquées: {total_duplicates}\n\n")
        
        for viewer_id in viewers_data.keys():
            missing = len(errors['missing_frames'][viewer_id])
            duplicates = len(errors['duplicate_frames'][viewer_id])
            
            f.write(f"Viewer {viewer_id}:\n")
            f.write(f"  - Frames manquantes: {missing}\n")
            f.write(f"  - Frames dupliquées: {duplicates}\n")
            
            if missing > 0:
                f.write(f"  - Séquences manquantes: {sorted(errors['missing_frames'][viewer_id])}\n")
            if duplicates > 0:
                f.write(f"  - Séquences dupliquées: {sorted(errors['duplicate_frames'][viewer_id])}\n")
            f.write("\n")
        
        # Précision du timing host
        f.write("4. PRÉCISION DU TIMING HOST\n")
        f.write("-" * 40 + "\n")
        timing_errors = host_data['performance_stats']['timing_errors_ms']
        f.write(f"Erreur moyenne de timing: {np.mean(timing_errors):.1f}ms\n")
        f.write(f"Erreur max de timing: {np.max(timing_errors):.1f}ms\n")
        f.write(f"Écart-type des erreurs: {np.std(timing_errors):.1f}ms\n")
        f.write(f"Frames droppées: {host_data['session_info']['frames_dropped']}\n")
        f.write(f"Taux de drop: {host_data['performance_stats']['frame_drop_rate']:.2f}%\n")

    print(f"Rapport détaillé sauvegardé: {report_path}")

def main():
    parser = argparse.ArgumentParser(description="Analyse les données de benchmark de latence.")
    parser.add_argument('input_dir', type=str, help="Dossier contenant les fichiers de données JSON.")
    parser.add_argument('output_dir', type=str, help="Dossier où sauvegarder les analyses (graphiques, rapports).")
    args = parser.parse_args()

    if not os.path.exists(args.output_dir):
        os.makedirs(args.output_dir)

    try:
        host_data, viewers_data = load_data(args.input_dir)
    except FileNotFoundError as e:
        print(e)
        return

    avg_latency, avg_connection_time, latencies_per_viewer, errors = analyze_latencies(host_data, viewers_data)

    # Affichage des résultats
    print(f"\nAnalyse des données du dossier : {args.input_dir}")
    print("=" * 60)
    print("RÉSULTATS GÉNÉRAUX")
    print("-" * 30)
    print(f"Latence moyenne globale : {avg_latency * 1000:.1f} ms")
    print(f"Temps de connexion moyen des viewers : {avg_connection_time:.1f} secondes")
    
    print("\nERREURS DE MESURE")
    print("-" * 30)
    
    total_missing = sum(len(frames) for frames in errors['missing_frames'].values())
    total_duplicates = sum(len(frames) for frames in errors['duplicate_frames'].values())
    
    if total_missing == 0 and total_duplicates == 0:
        print("✅ Aucune erreur de mesure détectée.")
    else:
        print(f"❌ Total frames manquantes: {total_missing}")
        print(f"⚠️  Total frames dupliquées: {total_duplicates}")
        
        if errors['missing_frames']:
            print("\nFrames manquantes par viewer:")
            for viewer, frames in errors['missing_frames'].items():
                if frames:
                    print(f"  - Viewer {viewer}: {len(frames)} frames manquantes")
        
        if errors['duplicate_frames']:
            print("\nFrames dupliquées par viewer:")
            for viewer, frames in errors['duplicate_frames'].items():
                if frames:
                    print(f"  - Viewer {viewer}: {len(frames)} séquences dupliquées")

    # Génération des graphiques et rapport
    plot_latency_per_viewer(latencies_per_viewer, args.output_dir)
    plot_average_latency(latencies_per_viewer, args.output_dir)
    plot_host_timing_accuracy(host_data, args.output_dir)
    plot_aggregated_errors(errors, args.output_dir)
    generate_detailed_report(host_data, viewers_data, latencies_per_viewer, errors, args.output_dir)

    print(f"\n📊 Graphiques et rapport sauvegardés dans : {args.output_dir}")

if __name__ == '__main__':
    main()
