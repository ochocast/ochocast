package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	bootstrap "whip-server/deploy"
	"whip-server/internal/autoscaler"
	"whip-server/internal/provider/scaleway"
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
	if err := cp.SetPublicURL(os.Getenv("SFU_CONTROL_PLANE_URL")); err != nil {
		log.Fatalf("[CP] invalid public URL: %v", err)
	}

	// Enable on-demand SFU autoscaling when Scaleway credentials are present.
	// Without them the control-plane behaves as before (hard-fails room creation
	// when no SFU is registered).
	if err := wireAutoscaler(cp); err != nil {
		log.Printf("[CP] on-demand autoscaler disabled: %v", err)
	}

	// Register HTTP handlers with CORS middleware
	http.HandleFunc("/health", corsMiddleware(handleHealth))
	http.HandleFunc("/control/register_sfu", corsMiddleware(cp.HandleRegisterSFU))
	http.HandleFunc("/control/heartbeat", corsMiddleware(cp.HandleHeartbeat))
	http.HandleFunc("/control/join_host", corsMiddleware(cp.HandleJoinHost))
	http.HandleFunc("/control/join_viewer", corsMiddleware(cp.HandleJoinViewer))
	http.HandleFunc("/control/topology", corsMiddleware(cp.HandleGetTopology))
	http.HandleFunc("/control/operator_status", corsMiddleware(cp.HandleOperatorStatus))
	http.HandleFunc("/room/create", corsMiddleware(cp.HandleCreateRoom))
	http.HandleFunc("/room/exists", corsMiddleware(cp.HandleRoomExists))
	http.HandleFunc("/room/status", corsMiddleware(cp.HandleRoomStatus)) // Poll provisioning -> ready/failed
	http.HandleFunc("/room/viewers", corsMiddleware(cp.HandleRoomViewerCount))
	http.HandleFunc("/whip", corsMiddleware(cp.HandleWHIP))                   // Proxy WHIP to ingestion SFU
	http.HandleFunc("/viewer", corsMiddleware(cp.HandleViewer))               // Proxy viewer to optimal SFU
	http.HandleFunc("/recorder", corsMiddleware(cp.HandleRecorder))           // Return ingestion SFU for recorder
	http.HandleFunc("/stream-status", corsMiddleware(cp.HandleStreamStatus))  // Check stream status
	http.HandleFunc("/whip/resource/", corsMiddleware(cp.HandleWHIPResource)) // Terminate a WHIP publishing session

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
		w.Header().Set("Access-Control-Expose-Headers", "Location, Link")

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

// wireAutoscaler builds the Scaleway-backed autoscaler from environment/secret
// config and attaches it to the control-plane, sharing the control-plane's
// lifecycle store. It also starts the background startup-timeout reaper and the
// reconcile/orphan-cleanup janitor. Returns an error (autoscaler stays off) when
// credentials or the store are unavailable.
//
// ponytail: config straight from env for now; task 7.4 moves the secret values
// to injected Kubernetes Secrets, but the read sites stay the same.
func wireAutoscaler(cp *controlplane.ControlPlane) error {
	if os.Getenv("SCW_ACCESS_KEY") == "" {
		return fmt.Errorf("SCW_ACCESS_KEY not set")
	}
	store := cp.LifecycleStore()
	if store == nil {
		return fmt.Errorf("lifecycle store unavailable; refusing to run autoscaler without durable worker records")
	}

	adapter, err := scaleway.New(scaleway.Config{
		AccessKey:       os.Getenv("SCW_ACCESS_KEY"),
		SecretKey:       os.Getenv("SCW_SECRET_KEY"),
		ProjectID:       os.Getenv("SCW_DEFAULT_PROJECT_ID"),
		Zone:            getEnv("SCW_DEFAULT_ZONE", "fr-par-1"),
		CommercialType:  getEnv("SFU_WORKER_TYPE", "DEV1-S"),
		ImageID:         os.Getenv("SFU_WORKER_IMAGE_ID"),
		SecurityGroupID: os.Getenv("SFU_WORKER_SECURITY_GROUP_ID"),
	})
	if err != nil {
		return err
	}

	workerBootstrap := bootstrap.WorkerConfig{
		ImageTag:        os.Getenv("SFU_IMAGE_TAG"),
		ControlPlaneURL: firstNonEmpty(os.Getenv("SFU_CONTROL_PLANE_URL"), os.Getenv("CONTROL_PLANE_URL")),
		Registry:        os.Getenv("SFU_REGISTRY"),
		RegistryUser:    os.Getenv("SFU_REGISTRY_USERNAME"),
		RegistryPass:    os.Getenv("SFU_REGISTRY_PASSWORD"),
		SFUPort:         getEnv("SFU_WORKER_PORT", "8090"),
		ICERelayOnly:    envBool("ICE_RELAY_ONLY", true),
		EnableICETCP:    envBool("ENABLE_ICE_TCP", false),
		STUNServers:     os.Getenv("STUN_SERVERS"),
		TURNServer:      os.Getenv("TURN_SERVER"),
		TURNUsername:    os.Getenv("TURN_USERNAME"),
		TURNPassword:    os.Getenv("TURN_PASSWORD"),
	}
	if err := workerBootstrap.Validate(); err != nil {
		return fmt.Errorf("worker bootstrap config: %w", err)
	}

	maxWorkers := 1
	if v, err := strconv.Atoi(os.Getenv("SFU_MAX_WORKERS")); err == nil && v > 0 {
		maxWorkers = v
	}
	prov := autoscaler.New(store, adapter, autoscaler.Config{
		MaxWorkers: maxWorkers,
		ImageTag:   workerBootstrap.ImageTag,
		ManagedTag: getEnv("SFU_MANAGED_TAG", "sfu-worker"),
		RenderUserData: func(sfuID, roomID string) string {
			return workerBootstrap.Render(sfuID, roomID)
		},
	})
	cp.SetProvisioner(prov)
	http.Handle("/metrics", prov.MetricsHandler())

	ctx := context.Background()
	go prov.Run(ctx) // startup-timeout reaping (task 4.3)
	go janitor(ctx, prov)

	log.Printf("[CP] on-demand SFU autoscaler enabled (max_workers=%d)", maxWorkers)
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func envBool(key string, defaultValue bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return defaultValue
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return defaultValue
	}
	return parsed
}

// janitor periodically reconciles worker records against the cloud and cleans up
// aged orphans (tasks 4.4/4.5).
func janitor(ctx context.Context, prov *autoscaler.Provisioner) {
	t := time.NewTicker(5 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if n, err := prov.CleanupOrphans(ctx); err != nil {
				log.Printf("[CP] reconcile/orphan-cleanup: %v", err)
			} else if n > 0 {
				log.Printf("[CP] orphan cleanup removed %d resource(s)", n)
			}
		}
	}
}
