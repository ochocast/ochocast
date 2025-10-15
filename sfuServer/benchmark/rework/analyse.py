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

def analyze_latencies(host_data, viewers_data):
    """
    Analyse les latences, les erreurs de mesure et les temps de connexion.
    """
    host_timestamps = {item['sequence_number']: item['timestamp'] for item in host_data['red_timestamps'] if 'timestamp' in item}
    
    all_latencies = []
    latencies_per_viewer = {}
    connection_times = []
    errors = {'missing_frames': {}, 'duplicate_frames': {}, 'invalid_latency_frames': {}}

    host_start_time = datetime.fromisoformat(host_data['session_info']['start_time'])

    for viewer_id, viewer_data in viewers_data.items():
        viewer_latencies = []
        latencies_per_viewer[viewer_id] = []
        errors['missing_frames'][viewer_id] = []
        errors['duplicate_frames'][viewer_id] = []
        errors['invalid_latency_frames'][viewer_id] = []
        
        # Temps de connexion
        viewer_start_time = datetime.fromisoformat(viewer_data['session_info']['start_time'])
        connection_time = (viewer_start_time - host_start_time).total_seconds()
        connection_times.append(connection_time)

        # Regrouper les détections par numéro de séquence pour gérer les doublons
        detections_by_seq = {}
        for item in viewer_data['red_detections']:
            seq = item['sequence_number']
            if seq not in detections_by_seq:
                detections_by_seq[seq] = []
            detections_by_seq[seq].append(item)

        # Identifier les doublons
        for seq, items in detections_by_seq.items():
            if len(items) > 1:
                errors['duplicate_frames'][viewer_id].append(seq)

        # Analyse des latences et erreurs
        host_sequences = set(host_timestamps.keys())
        
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
                        break # On a trouvé une latence valide, on passe à la séquence suivante
            
            if not latency_found:
                errors['invalid_latency_frames'][viewer_id].append(seq)

        if viewer_latencies:
            all_latencies.extend(viewer_latencies)

    avg_latency = np.mean(all_latencies) if all_latencies else 0
    avg_connection_time = np.mean(connection_times) if connection_times else 0

    return avg_latency, avg_connection_time, latencies_per_viewer, errors

def plot_latency_per_viewer(latencies_per_viewer, output_dir):
    """
    Crée un graphique avec une ligne de latence par viewer.
    """
    plt.figure(figsize=(12, 6))
    for viewer_id, latencies in latencies_per_viewer.items():
        if latencies:
            sequences = [item['sequence'] for item in latencies]
            values = [item['latency'] * 1000 for item in latencies] # en ms
            plt.plot(sequences, values, marker='o', linestyle='-', label=f'Viewer {viewer_id}')
    
    plt.title('Latence par Viewer')
    plt.xlabel('Numéro de Séquence de Trame')
    plt.ylabel('Latence (ms)')
    plt.legend()
    plt.grid(True)
    plt.savefig(os.path.join(output_dir, 'latency_per_viewer.png'))
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
        return

    avg_lats = {seq: np.mean(vals) for seq, vals in all_lats.items()}
    
    sequences = sorted(avg_lats.keys())
    avg_values = [avg_lats[seq] * 1000 for seq in sequences] # en ms

    plt.figure(figsize=(12, 6))
    plt.plot(sequences, avg_values, marker='o', linestyle='-', color='b')
    plt.title('Latence Moyenne (tous viewers)')
    plt.xlabel('Numéro de Séquence de Trame')
    plt.ylabel('Latence Moyenne (ms)')
    plt.grid(True)
    plt.savefig(os.path.join(output_dir, 'average_latency.png'))
    plt.close()


def plot_aggregated_errors(errors, output_dir):
    """
    Crée un diagramme en bâtons récapitulatif des erreurs pour tous les viewers.
    """
    dup_counts = {}
    inv_counts = {}
    all_error_frames = set()

    # Compter les erreurs par type et par trame
    for viewer_id, frames in errors['duplicate_frames'].items():
        for frame in frames:
            dup_counts[frame] = dup_counts.get(frame, 0) + 1
            all_error_frames.add(frame)

    for viewer_id, frames in errors['invalid_latency_frames'].items():
        for frame in frames:
            inv_counts[frame] = inv_counts.get(frame, 0) + 1
            all_error_frames.add(frame)

    if not all_error_frames:
        return

    sorted_frames = sorted(list(all_error_frames))
    x = np.arange(len(sorted_frames))
    width = 0.35

    dup_values = [dup_counts.get(frame, 0) for frame in sorted_frames]
    inv_values = [inv_counts.get(frame, 0) for frame in sorted_frames]

    fig, ax = plt.subplots(figsize=(15, 7))
    ax.bar(x - width/2, dup_values, width, label='Doublons', color='orange')
    ax.bar(x + width/2, inv_values, width, label='Latence Invalide', color='red')

    ax.set_xlabel('Numéro de Séquence de Trame')
    ax.set_ylabel('Nombre de Viewers avec Erreur')
    ax.set_title('Récapitulatif des Erreurs par Trame (tous viewers)')
    ax.set_xticks(x)
    ax.set_xticklabels(sorted_frames, rotation=90, fontsize=8)
    ax.legend()
    ax.grid(axis='y')
    
    # S'assurer que l'axe Y a des graduations entières
    max_y = max(max(dup_values) if dup_values else [0], max(inv_values) if inv_values else [0])
    if max_y > 0:
        ax.set_yticks(np.arange(0, max_y + 1, 1))

    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'aggregated_errors.png'))
    plt.close()


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
    print(f"Analyse des données du dossier : {args.input_dir}\n")
    print("--- RÉSULTATS GÉNÉRAUX ---")
    print(f"Latence moyenne globale : {avg_latency * 1000:.2f} ms")
    print(f"Temps de connexion moyen des viewers : {avg_connection_time:.2f} secondes")
    
    print("\n--- ERREURS DE MESURE ---")
    if not errors['missing_frames'] and not errors['duplicate_frames'] and not errors['invalid_latency_frames']:
        print("Aucune erreur de mesure détectée.")
    else:
        if errors['duplicate_frames']:
            print("\nTrames détectées en double (par viewer) :")
            for viewer, frames in errors['duplicate_frames'].items():
                if frames:
                    print(f"  - Viewer {viewer}: {len(frames)} trames ({sorted(frames)})")
        if errors['missing_frames']:
            print("\nTrames manquantes (non détectées par le viewer) :")
            for viewer, frames in errors['missing_frames'].items():
                if frames:
                    print(f"  - Viewer {viewer}: {len(frames)} trames manquantes")
        if errors['invalid_latency_frames']:
            print("\nTrames avec latence invalide (toutes détections) :")
            for viewer, frames in errors['invalid_latency_frames'].items():
                if frames:
                    print(f"  - Viewer {viewer}: {len(frames)} trames ({sorted(frames)})")

    # Génération des graphiques
    plot_latency_per_viewer(latencies_per_viewer, args.output_dir)
    plot_average_latency(latencies_per_viewer, args.output_dir)
    plot_aggregated_errors(errors, args.output_dir)

    print(f"\nGraphiques sauvegardés dans : {args.output_dir}")

if __name__ == '__main__':
    main()
