package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	// Get SFU base URL from environment variable, fallback to default
	sfuDefault := os.Getenv("SFU_BASE_URL")
	if sfuDefault == "" {
		sfuDefault = "http://localhost:8090"
	}

	// Command-line flags
	httpAddr := flag.String("http", "", "HTTP server address (e.g. :8080). If set, runs as HTTP server")
	roomID := flag.String("room", "live-event-001", "SFU room ID to record (CLI mode only)")
	roomKey := flag.String("key", "", "SFU room key (empty if auth disabled)")
	sfuBaseURL := flag.String("sfu", sfuDefault, "SFU base URL (CLI mode only, env: SFU_BASE_URL)")
	outputDir := flag.String("output", "./recordings", "Output directory for recordings")
	flag.Parse()

	// HTTP Server Mode
	if *httpAddr != "" {
		runHTTPServer(*httpAddr, *outputDir)
		return
	}

	// CLI Mode (original behavior)
	runCLIMode(*roomID, *roomKey, *sfuBaseURL, *outputDir)
}

// runHTTPServer starts the HTTP server mode
func runHTTPServer(addr, outputDir string) {
	log.Println("Live Recorder - HTTP Server Mode")
	log.Printf("Output directory: %s", outputDir)

	server := NewRecordingServer(outputDir)

	// Handle graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		log.Println("\nShutdown signal received...")

		// Stop all active recordings
		server.mu.Lock()
		for roomID, session := range server.sessions {
			if session.isRecording {
				log.Printf("Stopping recording for room: %s", roomID)
				session.Stop()
			}
		}
		server.mu.Unlock()

		os.Exit(0)
	}()

	// Register HTTP handlers
	mux := http.NewServeMux()
	mux.HandleFunc("/recording/start", server.handleStart)
	mux.HandleFunc("/recording/stop", server.handleStop)
	mux.HandleFunc("/recording/status", server.handleStatus)
	mux.HandleFunc("/health", server.handleHealth)

	log.Printf("[HTTP] Starting server on %s", addr)
	log.Println("[HTTP] Endpoints:")
	log.Println("  POST /recording/start  - Start recording")
	log.Println("  POST /recording/stop   - Stop recording")
	log.Println("  GET  /recording/status - Get status")
	log.Println("  GET  /health           - Health check")

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[ERROR] HTTP server failed: %v", err)
	}
}

// runCLIMode runs the original CLI mode for manual recording
func runCLIMode(roomID, roomKey, sfuBaseURL, outputDir string) {
	log.Println("Live Recorder - CLI Mode")
	log.Printf("Room ID: %s", roomID)
	log.Printf("SFU Base URL: %s", sfuBaseURL)
	log.Printf("Output directory: %s", outputDir)
	log.Println("Recording directly to MP4 with synchronized A/V")

	// Create recording session (use roomID as eventID for filename)
	// In CLI mode, no auto-publish (no backend/keycloak config)
	session, err := NewRecordingSession(RecordingConfig{
		EventID:    roomID,
		RoomID:     roomID,
		RoomKey:    roomKey,
		SfuBaseURL: sfuBaseURL,
		OutputDir:  outputDir,
	})
	if err != nil {
		log.Fatalf("[ERROR] Failed to create recording session: %v", err)
	}

	// Check stream status before starting
	log.Println("Checking stream status...")
	active, err := session.CheckStreamStatus()
	if err != nil {
		log.Printf("[WARN] Could not check stream status: %v", err)
		log.Println("[WARN] Continuing anyway - stream might start later...")
	} else if !active {
		log.Println("[WARN] Stream is not currently active in the room")
		log.Println("[WARN] The recorder will connect and wait for the stream to start...")
	} else {
		log.Println("Stream is active - ready to record!")
	}

	// Start recording
	if err := session.StartRecording(); err != nil {
		log.Fatalf("[ERROR] Failed to start recording: %v", err)
	}

	log.Println("Recording started. Press Ctrl+C to stop.")

	// Wait for interrupt signal (Ctrl+C)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("\nInterrupt received, stopping recording...")

	// Stop recording
	if err := session.Stop(); err != nil {
		log.Fatalf("[ERROR] Failed to stop recording: %v", err)
	}

	log.Println("Recording completed successfully!")
}
