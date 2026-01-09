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

	// Register HTTP handlers
	http.HandleFunc("/health", handleHealthCheck)
	http.HandleFunc("/room/create", handleCreateRoom)
	http.HandleFunc("/room/sync-create", handleSyncCreateRoom)
	http.HandleFunc("/room/get", handleGetRoom)
	http.HandleFunc("/room/exists", handleRoomExists)
	http.HandleFunc("/room/delete", handleDeleteRoom)
	http.HandleFunc("/stream-status", handleStreamStatus)
	http.HandleFunc("/whip", handleWHIP)
	http.HandleFunc("/viewer", handleViewer)
	http.HandleFunc("/promote", handlePromoteViewer)
	http.HandleFunc("/demote", handleDemotePublisher)
	http.HandleFunc("/cascade/subscribe", handleCascadeSubscribe)
	http.HandleFunc("/cascade/request-subscribe", handleCascadeRequestSubscribe)
	http.HandleFunc("/cascade/publish", handleCascadePublish)
	http.HandleFunc("/cascade/disconnect", handleCascadeDisconnect)
	http.HandleFunc("/cascade/remove-downstream", handleCascadeRemoveDownstream)
	http.HandleFunc("/cluster/register", handleClusterRegister)
	http.HandleFunc("/cluster/peers", handleClusterPeers)
	http.Handle("/", http.FileServer(http.Dir(".")))

	// Get configuration from environment variables
	enableHTTPS := getEnvAsBool("ENABLE_HTTPS", false)
	sfuMode := getEnv("SFU_MODE", "hybrid")

	log.Printf("SFU Server Mode: %s", sfuMode)
	log.Printf("SFU Server URL: %s", sfuServer.serverURL)

	// Register peer SFUs from environment variable
	if sfuMode == "hybrid" {
		peerURLs := getEnv("PEER_SFU_URLS", "")
		if peerURLs != "" {
			log.Printf("Parsing peer URLs from env: %s", peerURLs)
			peers := splitAndTrim(peerURLs, ",")
			registeredCount := 0
			for _, peerURL := range peers {
				if peerURL != "" && peerURL != sfuServer.serverURL {
					sfuServer.RegisterPeerSFU(peerURL)
					registeredCount++
				} else if peerURL == sfuServer.serverURL {
					log.Printf("Skipping self URL: %s", peerURL)
				}
			}
			log.Printf("Registered %d peer SFU(s) out of %d parsed", registeredCount, len(peers))
		} else {
			log.Println("No peer SFUs configured (running in single-server mode)")
		}
	}

	if enableHTTPS {
		// HTTPS Configuration
		certFile := getEnv("CERT_FILE", "cert.pem")
		keyFile := getEnv("KEY_FILE", "key.pem")
		httpsPort := getEnv("HTTPS_PORT", "443")

		fmt.Printf("Server listening on :%s (HTTPS)\n", httpsPort)
		log.Fatal(http.ListenAndServeTLS(":"+httpsPort, certFile, keyFile, nil))
	} else {
		// HTTP Configuration
		httpPort := getEnv("SERVER_PORT", "8090")

		fmt.Printf("Server listening on :%s (HTTP)\n", httpPort)
		log.Fatal(http.ListenAndServe(":"+httpPort, nil))
	}
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
