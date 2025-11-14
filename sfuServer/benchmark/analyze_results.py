#!/usr/bin/env python3
"""
Analyseur des résultats de benchmark WebSocket
Analyse les fichiers JSON pour extraire des métriques et insights
"""

import json
import os
import glob
from datetime import datetime
from typing import Dict, List, Tuple, Any
import statistics
from collections import defaultdict, Counter


class BenchmarkAnalyzer:
    """Analyseur des résultats de benchmark"""
    
    def __init__(self, results_dir: str):
        self.results_dir = results_dir
        self.benchmark_info = None
        self.host_timestamps = None
        self.worker_detections = {}
        
        self.load_data()
    
    def load_data(self):
        """Charge toutes les données du benchmark"""
        print(f"📂 Chargement des données depuis {self.results_dir}")
        
        # Charger benchmark_info.json
        benchmark_path = os.path.join(self.results_dir, "benchmark_info.json")
        if os.path.exists(benchmark_path):
            with open(benchmark_path, 'r') as f:
                self.benchmark_info = json.load(f)
            print(f"✅ benchmark_info.json chargé")
        
        # Charger host_timestamps.json
        host_path = os.path.join(self.results_dir, "host_timestamps.json")
        if os.path.exists(host_path):
            with open(host_path, 'r') as f:
                self.host_timestamps = json.load(f)
            print(f"✅ host_timestamps.json chargé")
        
        # Charger les détections de tous les workers
        worker_dirs = glob.glob(os.path.join(self.results_dir, "worker_*"))
        for worker_dir in worker_dirs:
            worker_id = os.path.basename(worker_dir)
            self.worker_detections[worker_id] = []
            
            detection_files = glob.glob(os.path.join(worker_dir, "detections_*.json"))
            detection_files.sort()  # Trier par timestamp
            
            for detection_file in detection_files:
                with open(detection_file, 'r') as f:
                    data = json.load(f)
                    self.worker_detections[worker_id].extend(data.get('detections', []))
            
            print(f"✅ {len(self.worker_detections[worker_id])} détections chargées pour {worker_id}")
    
    def get_analysis_options(self) -> Dict[str, str]:
        """Retourne les options d'analyse disponibles"""
        return {
            "1": "📊 Vue d'ensemble générale",
            "2": "⏱️  Analyse de latence (Host → Viewers)",
            "3": "🎯 Détections et validation (diagonal encoding)",
            "4": "📈 Performance temporelle et débit",
            "5": "👥 Comparaison entre workers",
            "6": "🔴 Analyse des frames rouges (séquences)",
            "7": "⚡ Statistiques de qualité réseau",
            "8": "📋 Rapport complet (toutes les analyses)",
            "9": "💾 Export CSV pour analyse externe",
            "10": "📊 Graphiques et visualisations"
        }
    
    def general_overview(self):
        """Analyse 1: Vue d'ensemble générale"""
        print("\n" + "="*60)
        print("📊 VUE D'ENSEMBLE GÉNÉRALE")
        print("="*60)
        
        if not self.benchmark_info:
            print("❌ Pas de données benchmark_info")
            return
        
        # Infos de base
        print(f"🔍 Benchmark ID: {self.benchmark_info['benchmark_id']}")
        
        # Durée
        if self.benchmark_info.get('start_time') and self.benchmark_info.get('end_time'):
            duration = self.benchmark_info['end_time'] - self.benchmark_info['start_time']
            print(f"⏱️  Durée totale: {duration:.1f} secondes")
        
        if self.benchmark_info.get('benchmark_start_time'):
            red_duration = self.benchmark_info['end_time'] - self.benchmark_info['benchmark_start_time'] 
            print(f"🔴 Durée avec frames rouges: {red_duration:.1f} secondes")
        
        # Configuration
        config = self.benchmark_info.get('config', {})
        benchmark_config = config.get('benchmark', {})
        print(f"🎥 Résolution: {benchmark_config['host']['width']}x{benchmark_config['host']['height']} @ {benchmark_config['host']['fps']} FPS")
        print(f"🎯 Total viewers configurés: {benchmark_config['total_viewers']}")
        print(f"🔴 Intervalle frames rouges: {benchmark_config['red_interval']}s")
        print(f"🔢 Méthode encodage: {benchmark_config['encoding_method']}")
        
        # Workers
        workers = self.benchmark_info.get('workers', {})
        print(f"👥 Workers connectés: {len(workers)}")
        for worker_id, worker_info in workers.items():
            print(f"   • {worker_id}: {worker_info['ip']} ({worker_info['status']})")
        
        # Host stats
        if self.host_timestamps:
            session_info = self.host_timestamps.get('session_info', {})
            print(f"🎬 Frames générées: {session_info.get('frames_generated', 0)}")
            print(f"🔴 Frames rouges envoyées: {session_info.get('total_red_frames', 0)}")
            print(f"📉 Frames droppées: {session_info.get('frames_dropped', 0)}")
            print(f"⚠️  Erreurs de timing: {session_info.get('timing_errors', 0)}")
        
        # Détections totales
        total_detections = sum(len(detections) for detections in self.worker_detections.values())
        print(f"🎯 Total détections reçues: {total_detections}")
        
        for worker_id, detections in self.worker_detections.items():
            valid_count = sum(1 for d in detections if d.get('is_valid', False))
            print(f"   • {worker_id}: {len(detections)} détections ({valid_count} valides)")
    
    def latency_analysis(self):
        """Analyse 2: Analyse de latence"""
        print("\n" + "="*60)
        print("⏱️  ANALYSE DE LATENCE")
        print("="*60)
        
        if not self.host_timestamps or not self.worker_detections:
            print("❌ Données manquantes pour l'analyse de latence")
            return
        
        # Récupérer les timestamps d'envoi du host
        red_timestamps = self.host_timestamps.get('red_timestamps', [])
        host_sends = {rt['sequence_number']: rt['timestamp'] for rt in red_timestamps}
        
        # Calculer les latences pour chaque worker
        all_latencies = []
        worker_latencies = {}
        
        for worker_id, detections in self.worker_detections.items():
            worker_latencies[worker_id] = []
            
            for detection in detections:
                seq = detection['sequence_number']
                recv_time = detection['timestamp']
                
                if seq in host_sends:
                    send_time = host_sends[seq]
                    latency = (recv_time - send_time) * 1000  # en ms
                    
                    if 0 <= latency <= 10000:  # Filtrer les valeurs aberrantes
                        all_latencies.append(latency)
                        worker_latencies[worker_id].append(latency)
        
        if not all_latencies:
            print("❌ Aucune latence calculable")
            return
        
        # Statistiques globales
        print(f"📊 Statistiques globales de latence:")
        print(f"   • Échantillons: {len(all_latencies)}")
        print(f"   • Moyenne: {statistics.mean(all_latencies):.1f} ms")
        print(f"   • Médiane: {statistics.median(all_latencies):.1f} ms")
        print(f"   • Min: {min(all_latencies):.1f} ms")
        print(f"   • Max: {max(all_latencies):.1f} ms")
        print(f"   • Écart-type: {statistics.stdev(all_latencies):.1f} ms")
        
        # Percentiles
        all_latencies.sort()
        p50 = all_latencies[len(all_latencies)//2]
        p95 = all_latencies[int(len(all_latencies)*0.95)]
        p99 = all_latencies[int(len(all_latencies)*0.99)]
        print(f"   • P50: {p50:.1f} ms")
        print(f"   • P95: {p95:.1f} ms") 
        print(f"   • P99: {p99:.1f} ms")
        
        # Par worker
        print(f"\n📊 Latences par worker:")
        for worker_id, latencies in worker_latencies.items():
            if latencies:
                print(f"   • {worker_id}:")
                print(f"     - Échantillons: {len(latencies)}")
                print(f"     - Moyenne: {statistics.mean(latencies):.1f} ms")
                print(f"     - Médiane: {statistics.median(latencies):.1f} ms")
    
    def detection_validation_analysis(self):
        """Analyse 3: Détections et validation"""
        print("\n" + "="*60)
        print("🎯 DÉTECTIONS ET VALIDATION (DIAGONAL)")
        print("="*60)
        
        total_detections = 0
        valid_detections = 0
        invalid_detections = 0
        sequence_coverage = set()
        error_types = Counter()
        
        for worker_id, detections in self.worker_detections.items():
            worker_valid = 0
            worker_invalid = 0
            
            for detection in detections:
                total_detections += 1
                sequence_coverage.add(detection['sequence_number'])
                
                if detection.get('is_valid', False):
                    valid_detections += 1
                    worker_valid += 1
                else:
                    invalid_detections += 1
                    worker_invalid += 1
                    
                    # Analyser le type d'erreur
                    rgb = detection.get('rgb', [255, 0, 255])
                    if len(rgb) >= 3:
                        r, g, b = rgb[0], rgb[1], rgb[2]
                        if r < 240:
                            error_types['R_too_low'] += 1
                        elif (g + b) != 255:
                            deviation = abs((g + b) - 255)
                            if deviation <= 2:
                                error_types['slight_compression'] += 1
                            elif deviation <= 5:
                                error_types['moderate_compression'] += 1
                            else:
                                error_types['major_corruption'] += 1
                        elif g % 2 != 0:
                            error_types['G_not_even'] += 1
                        else:
                            error_types['other'] += 1
            
            print(f"👥 {worker_id}: {len(detections)} détections ({worker_valid} valides, {worker_invalid} invalides)")
        
        # Statistiques globales
        print(f"\n📊 Statistiques de validation:")
        print(f"   • Total détections: {total_detections}")
        print(f"   • Valides: {valid_detections} ({valid_detections/total_detections*100:.1f}%)")
        print(f"   • Invalides: {invalid_detections} ({invalid_detections/total_detections*100:.1f}%)")
        print(f"   • Séquences détectées: {len(sequence_coverage)}")
        print(f"   • Range séquences: {min(sequence_coverage) if sequence_coverage else 'N/A'} - {max(sequence_coverage) if sequence_coverage else 'N/A'}")
        
        # Types d'erreurs
        if error_types:
            print(f"\n🔍 Types d'erreurs détectées:")
            for error_type, count in error_types.most_common():
                print(f"   • {error_type}: {count} ({count/invalid_detections*100:.1f}%)")
    
    def performance_analysis(self):
        """Analyse 4: Performance temporelle"""
        print("\n" + "="*60)
        print("📈 PERFORMANCE TEMPORELLE")
        print("="*60)
        
        # Analyser le débit de détections dans le temps
        time_buckets = defaultdict(int)  # timestamp -> count
        
        for worker_id, detections in self.worker_detections.items():
            for detection in detections:
                # Grouper par seconde
                bucket = int(detection['timestamp'])
                time_buckets[bucket] += 1
        
        if time_buckets:
            timestamps = sorted(time_buckets.keys())
            detection_rates = [time_buckets[ts] for ts in timestamps]
            
            print(f"📊 Débit de détections:")
            print(f"   • Durée analysée: {len(timestamps)} secondes")
            print(f"   • Détections/seconde moyen: {statistics.mean(detection_rates):.1f}")
            print(f"   • Détections/seconde max: {max(detection_rates)}")
            print(f"   • Détections/seconde min: {min(detection_rates)}")
            
            # Identifier les périodes de forte/faible activité
            high_activity = [ts for ts in timestamps if time_buckets[ts] > statistics.mean(detection_rates) * 1.5]
            low_activity = [ts for ts in timestamps if time_buckets[ts] < statistics.mean(detection_rates) * 0.5]
            
            print(f"   • Périodes haute activité: {len(high_activity)} secondes")
            print(f"   • Périodes faible activité: {len(low_activity)} secondes")
    
    def worker_comparison(self):
        """Analyse 5: Comparaison entre workers"""
        print("\n" + "="*60)
        print("👥 COMPARAISON ENTRE WORKERS")
        print("="*60)
        
        worker_stats = {}
        
        for worker_id, detections in self.worker_detections.items():
            if not detections:
                continue
                
            valid_count = sum(1 for d in detections if d.get('is_valid', False))
            timestamps = [d['timestamp'] for d in detections]
            sequences = [d['sequence_number'] for d in detections]
            
            worker_stats[worker_id] = {
                'total_detections': len(detections),
                'valid_detections': valid_count,
                'invalid_detections': len(detections) - valid_count,
                'validity_rate': valid_count / len(detections) * 100,
                'first_detection': min(timestamps),
                'last_detection': max(timestamps),
                'duration': max(timestamps) - min(timestamps),
                'unique_sequences': len(set(sequences)),
                'detection_rate': len(detections) / (max(timestamps) - min(timestamps)) if len(detections) > 1 else 0
            }
        
        # Afficher la comparaison
        for worker_id, stats in worker_stats.items():
            print(f"\n🤖 {worker_id}:")
            print(f"   • Détections totales: {stats['total_detections']}")
            print(f"   • Taux de validité: {stats['validity_rate']:.1f}%")
            print(f"   • Séquences uniques: {stats['unique_sequences']}")
            print(f"   • Durée active: {stats['duration']:.1f}s")
            print(f"   • Débit: {stats['detection_rate']:.2f} détections/s")
    
    def red_frames_analysis(self):
        """Analyse 6: Frames rouges et séquences"""
        print("\n" + "="*60)
        print("🔴 ANALYSE DES FRAMES ROUGES")
        print("="*60)
        
        if not self.host_timestamps:
            print("❌ Pas de données host_timestamps")
            return
            
        # Analyser les séquences envoyées par le host
        red_timestamps = self.host_timestamps.get('red_timestamps', [])
        sent_sequences = set(rt['sequence_number'] for rt in red_timestamps)
        
        # Analyser les séquences reçues par les viewers
        received_sequences = set()
        sequence_reception = defaultdict(int)  # seq -> count receptions
        
        for worker_id, detections in self.worker_detections.items():
            for detection in detections:
                seq = detection['sequence_number']
                received_sequences.add(seq)
                sequence_reception[seq] += 1
        
        # Calculer les statistiques
        missing_sequences = sent_sequences - received_sequences
        extra_sequences = received_sequences - sent_sequences
        
        print(f"📤 Séquences envoyées par le host: {len(sent_sequences)}")
        print(f"📥 Séquences reçues par les viewers: {len(received_sequences)}")
        print(f"✅ Séquences correctement reçues: {len(sent_sequences & received_sequences)}")
        print(f"❌ Séquences perdues: {len(missing_sequences)}")
        print(f"⚠️  Séquences inattendues: {len(extra_sequences)}")
        
        if sent_sequences:
            reception_rate = len(sent_sequences & received_sequences) / len(sent_sequences) * 100
            print(f"📊 Taux de réception: {reception_rate:.1f}%")
        
        # Analyser la distribution des réceptions
        if sequence_reception:
            reception_counts = list(sequence_reception.values())
            print(f"\n📊 Distribution des réceptions:")
            print(f"   • Moyenne par séquence: {statistics.mean(reception_counts):.1f}")
            print(f"   • Min réceptions: {min(reception_counts)}")
            print(f"   • Max réceptions: {max(reception_counts)}")
            
        # Séquences les plus/moins bien reçues
        if sequence_reception:
            sorted_by_reception = sorted(sequence_reception.items(), key=lambda x: x[1])
            print(f"\n🔝 Séquences les mieux reçues:")
            for seq, count in sorted_by_reception[-5:]:
                print(f"   • Seq {seq}: {count} réceptions")
                
            print(f"\n🔻 Séquences les moins bien reçues:")
            for seq, count in sorted_by_reception[:5]:
                print(f"   • Seq {seq}: {count} réceptions")


def main():
    """Point d'entrée principal"""
    
    # Localiser le dossier de résultats
    results_dir = "./benchmark_results"
    if not os.path.exists(results_dir):
        print(f"❌ Dossier {results_dir} introuvable")
        return
    
    # Créer l'analyseur
    analyzer = BenchmarkAnalyzer(results_dir)
    
    print("\n" + "="*60)
    print("🧪 ANALYSEUR DE RÉSULTATS BENCHMARK")
    print("="*60)
    
    # Afficher les options
    options = analyzer.get_analysis_options()
    print("\nChoix d'analyses disponibles:")
    for key, description in options.items():
        print(f"  {key}. {description}")
    
    print(f"\n💡 Données chargées:")
    if analyzer.benchmark_info:
        print(f"   ✅ benchmark_info.json")
    if analyzer.host_timestamps:
        print(f"   ✅ host_timestamps.json")
    for worker_id, detections in analyzer.worker_detections.items():
        print(f"   ✅ {worker_id}: {len(detections)} détections")
    
    print(f"\n🎯 Que veux-tu analyser ? (1-10 ou 'all' pour tout) : ", end='')
    
    # Pour le moment, afficher un aperçu de chaque analyse
    print("all\n")
    
    # Exécuter toutes les analyses pour démonstration
    analyzer.general_overview()
    analyzer.latency_analysis()
    analyzer.detection_validation_analysis()
    analyzer.performance_analysis()
    analyzer.worker_comparison()
    analyzer.red_frames_analysis()
    
    print(f"\n✅ Analyse terminée!")
    print(f"💡 Options supplémentaires disponibles:")
    print(f"   • Export CSV (option 9)")
    print(f"   • Graphiques (option 10)")
    print(f"   • Analyses personnalisées sur demande")


if __name__ == "__main__":
    main()