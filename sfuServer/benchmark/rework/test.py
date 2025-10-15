import argparse
import time
from host import Host
from viewer import Viewer

def main():
    parser = argparse.ArgumentParser(description="Industrialized WebRTC benchmark script.")
    parser.add_argument("--viewers", type=int, default=1, help="Number of viewers to launch.")
    parser.add_argument("--duration", type=int, default=300, help="Duration of the test in seconds after latency check starts.")
    args = parser.parse_args()

    # Créer une instance de l'hôte
    host = Host(
        url="http://localhost:8090/whip",
        stun_url="stun:stun.l.google.com:19302",
        output="./benchmark_data",
        red_interval=3.0,  # Images rouges toutes les 3 secondes
        token=None  # Pas de token
    )

    # Créer les instances des viewers
    viewers = []
    for i in range(args.viewers):
        viewer = Viewer(
            viewer_id=f"viewer_{i+1}",
            red_threshold=128.0,
            output="./benchmark_data",
            url="http://localhost:8090/viewer",
            stun_url="stun:stun.l.google.com:19302"
        )
        viewers.append(viewer)

    # Démarrer le stream de l'hôte
    host.start()
    print("Host started.")

    # Attendre 10 secondes avant de démarrer les viewers
    time.sleep(10)

    # Démarrer tous les viewers
    for viewer in viewers:
        viewer.start()
    print(f"{len(viewers)} viewers started.")

    # Attendre que le premier viewer reçoive une image pour démarrer le test de latence
    print("Waiting for the first frame to be received by a viewer...")
    latency_check_started = False
    while not latency_check_started:
        for viewer in viewers:
            if viewer.first_frame_timestamp is not None:
                print(f"First frame received by {viewer.viewer_id}. Starting latency check.")
                host.start_check_latency()
                latency_check_started = True
                break
        if not latency_check_started:
            time.sleep(0.5) # Vérifier toutes les 500ms

    # Attendre la durée du test spécifiée
    print(f"Running test for {args.duration} seconds...")
    time.sleep(args.duration)

    # Arrêter tous les viewers
    for viewer in viewers:
        viewer.stop_sync()
    print("All viewers stopped.")

    # Arrêter l'hôte
    host.stop_sync()
    print("Host stopped.")

    print("Test terminé!")

if __name__ == "__main__":
    main()