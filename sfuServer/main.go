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
var sfuServer = NewSFUServer()

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: No .env file found, using default values")
	}

	// Register HTTP handlers
	http.HandleFunc("/health", handleHealthCheck)
	http.HandleFunc("/room/create", handleCreateRoom)
	http.HandleFunc("/room/get", handleGetRoom)
	http.HandleFunc("/room/delete", handleDeleteRoom)
	http.HandleFunc("/whip", handleWHIP)
	http.HandleFunc("/viewer", handleViewer)
	http.Handle("/", http.FileServer(http.Dir(".")))

	// Get configuration from environment variables
	enableHTTPS := getEnvAsBool("ENABLE_HTTPS", false)
	
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