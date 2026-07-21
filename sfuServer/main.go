package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Global SFU server instance
var sfuServer *SFUServer

func main() {
	// Load environment variables from .env file FIRST
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: No .env file found, using default values")
	}

	// NOW create the SFU server instance with the loaded environment variables
	sfuServer = NewSFUServer()

	mux := newServerMux()

	// Get configuration from environment variables
	enableHTTPS := getEnvAsBool("ENABLE_HTTPS", false)

	log.Printf("SFU Server URL: %s", sfuServer.serverURL)
	if sfuServer.controlPlaneURL != "" {
		log.Printf("Connected to Control Plane: %s", sfuServer.controlPlaneURL)
	} else {
		log.Println("Warning: No control plane configured, cluster functionality will be limited")
	}

	if enableHTTPS {
		// HTTPS Configuration
		certFile := getEnv("CERT_FILE", "cert.pem")
		keyFile := getEnv("KEY_FILE", "key.pem")
		httpsPort := getEnv("HTTPS_PORT", "443")

		fmt.Printf("Server listening on :%s (HTTPS)\n", httpsPort)
		log.Fatal(http.ListenAndServeTLS(":"+httpsPort, certFile, keyFile, mux))
	} else {
		// HTTP Configuration
		httpPort := getEnv("SERVER_PORT", "8090")

		fmt.Printf("Server listening on :%s (HTTP)\n", httpPort)
		log.Fatal(http.ListenAndServe(":"+httpPort, mux))
	}
}

func newServerMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealthCheck)
	mux.HandleFunc("/room/create", handleCreateRoom)
	mux.HandleFunc("/room/sync-create", handleSyncCreateRoom)
	mux.HandleFunc("/room/get", handleGetRoom)
	mux.HandleFunc("/room/exists", handleRoomExists)
	mux.HandleFunc("/room/delete", handleDeleteRoom)
	mux.HandleFunc("/room/viewers", handleRoomViewerCount)
	mux.HandleFunc("/stream-status", handleStreamStatus)
	mux.HandleFunc("/whip", handleWHIP)
	mux.HandleFunc("/whip/resource/", handleWHIPResource)
	mux.HandleFunc("/viewer", handleViewer)
	mux.HandleFunc("/recorder", handleRecorder)
	mux.HandleFunc("/promote", handlePromoteViewer)
	mux.HandleFunc("/demote", handleDemotePublisher)
	mux.HandleFunc("/cascade/subscribe", handleCascadeSubscribe)
	mux.HandleFunc("/cascade/publish", handleCascadePublish)
	mux.HandleFunc("/cascade/disconnect", handleCascadeDisconnect)
	mux.HandleFunc("/cascade/remove-downstream", handleCascadeRemoveDownstream)
	mux.Handle("/", http.FileServer(http.Dir(".")))
	return mux
}

// getEnv gets an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

// getEnvAsBool gets an environment variable as a boolean or returns a default value
func getEnvAsBool(key string, defaultValue bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	boolValue, err := strconv.ParseBool(value)
	if err != nil {
		log.Printf("Warning: Invalid boolean value for %s: %s, using default: %v\n", key, value, defaultValue)
		return defaultValue
	}
	return boolValue
}
