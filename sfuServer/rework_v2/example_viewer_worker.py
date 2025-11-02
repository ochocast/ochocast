#!/usr/bin/env python3
"""
Example: Using DistributedViewer with a worker thread to process detections.
"""

import asyncio
import time
import threading
from viewer import DistributedViewer


def worker_thread(viewer):
    """
    Worker thread qui récupère les détections de la queue.
    Simule un worker qui traite les détections en arrière-plan.
    """
    print(f"[Worker] Started for viewer {viewer.viewer_id}")
    
    while viewer.running or not viewer.detection_queue.empty():
        try:
            # Récupérer une détection (bloque jusqu'à 1 seconde)
            detection = viewer.get_detection(block=True, timeout=1.0)
            
            if detection:
                # Traiter la détection
                print(f"[Worker] Processing detection:")
                print(f"  - Viewer: {detection['viewer_id']}")
                print(f"  - Sequence: {detection['sequence_number']}")
                print(f"  - Valid: {detection['is_valid']}")
                print(f"  - Timestamp: {detection['timestamp']:.6f}")
                print(f"  - Relative time: {detection['relative_time']:.3f}s")
                
                # Ici tu pourrais:
                # - Envoyer au controller
                # - Sauvegarder en base de données
                # - Calculer la latence
                # - etc.
                
        except Exception as e:
            # Queue empty timeout - normal
            pass
    
    print(f"[Worker] Stopped for viewer {viewer.viewer_id}")


async def main():
    """Example d'utilisation du viewer avec un worker"""
    
    print("=" * 60)
    print("Example: DistributedViewer with Worker Thread")
    print("=" * 60)
    
    # Créer le viewer
    viewer = DistributedViewer(
        viewer_id="viewer_001",
        url="http://localhost:7880/whep",
        stun_url="stun:stun.l.google.com:19302",
        encoding_method="simple",  # ou "diagonal"
        detection_queue_size=100
    )
    
    print(f"\n✓ Viewer created: {viewer.viewer_id}")
    print(f"  - Encoding: {viewer.encoding_method}")
    print(f"  - Max sequence: {viewer.encoding_info['max_sequence']}")
    
    # Démarrer le worker dans un thread séparé
    worker = threading.Thread(
        target=worker_thread,
        args=(viewer,),
        daemon=True
    )
    worker.start()
    print("\n✓ Worker thread started")
    
    # Démarrer le viewer
    print("\n✓ Starting viewer...")
    viewer_task = asyncio.create_task(viewer.run())
    
    # Attendre quelques secondes pour la connexion
    await asyncio.sleep(2)
    
    # Vérifier le statut
    status = viewer.get_status()
    print(f"\n✓ Viewer status:")
    print(f"  - Connected: {status['connected']}")
    print(f"  - Running: {status['running']}")
    print(f"  - First frame received: {status['first_frame_received']}")
    
    # Laisser tourner pendant X secondes
    print("\n⏳ Streaming for 30 seconds...")
    await asyncio.sleep(30)
    
    # Arrêter le viewer
    print("\n✓ Stopping viewer...")
    await viewer.stop()
    await viewer_task
    
    # Attendre que le worker finisse de vider la queue
    print("\n✓ Waiting for worker to finish...")
    worker.join(timeout=5.0)
    
    # Statistiques finales
    final_status = viewer.get_status()
    print(f"\n✅ Final statistics:")
    print(f"  - Total frames: {final_status['frame_count']}")
    print(f"  - Red detections: {final_status['red_detections']}")
    print(f"  - Dropped detections: {final_status['dropped_detections']}")
    print(f"  - Queue size: {final_status['queue_size']}")


if __name__ == "__main__":
    print("\nNote: This requires a running SFU server at http://localhost:7880")
    print("Press Ctrl+C to stop\n")
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n✓ Interrupted by user")
