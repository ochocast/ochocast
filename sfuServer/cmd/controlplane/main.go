package main

import (
	"log"
	"net/http"
	"os"
	"whip-server/pkg/controlplane"
)

func main() {
	log.Println("=== Control Plane Starting ===")

	// Configuration from environment
	port := getEnv("CONTROL_PLANE_PORT", "8090")
	maxFanout := 5            // Maximum children per SFU node
	rebalanceThreshold := 0.8 // 80% CPU/Memory triggers rebalance consideration

	// Create control plane instance
	cp := controlplane.NewControlPlane(maxFanout, rebalanceThreshold)

	// Register HTTP handlers with CORS middleware
	http.HandleFunc("/health", corsMiddleware(handleHealth))
	http.HandleFunc("/control/register_sfu", corsMiddleware(cp.HandleRegisterSFU))
	http.HandleFunc("/control/heartbeat", corsMiddleware(cp.HandleHeartbeat))
	http.HandleFunc("/control/join_host", corsMiddleware(cp.HandleJoinHost))
	http.HandleFunc("/control/join_viewer", corsMiddleware(cp.HandleJoinViewer))
	http.HandleFunc("/control/topology", corsMiddleware(cp.HandleGetTopology))
	http.HandleFunc("/room/create", corsMiddleware(cp.HandleCreateRoom))
	http.HandleFunc("/room/exists", corsMiddleware(cp.HandleRoomExists))
	http.HandleFunc("/room/viewers", corsMiddleware(cp.HandleRoomViewerCount))
	http.HandleFunc("/whip", corsMiddleware(cp.HandleWHIP))                  // Proxy WHIP to ingestion SFU
	http.HandleFunc("/viewer", corsMiddleware(cp.HandleViewer))              // Proxy viewer to optimal SFU
	http.HandleFunc("/recorder", corsMiddleware(cp.HandleRecorder))          // Return ingestion SFU for recorder
	http.HandleFunc("/stream-status", corsMiddleware(cp.HandleStreamStatus)) // Check stream status

	log.Printf("Control Plane listening on :%s", port)
	log.Printf("Configuration: maxFanout=%d, rebalanceThreshold=%.2f", maxFanout, rebalanceThreshold)

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// corsMiddleware adds CORS headers to all responses
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Handle preflight requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
