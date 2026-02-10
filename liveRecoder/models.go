package main

import (
	"os"
	"sync"
)

// getEnv returns environment variable value or default if not set
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// StartRecordingRequest is the JSON body for POST /recording/start
type StartRecordingRequest struct {
	RoomID     string `json:"room_id"`
	RoomKey    string `json:"room_key"`
	SfuURL     string `json:"sfu_url"`
	OutputDir  string `json:"output_dir,omitempty"`
	BackendURL string `json:"backend_url,omitempty"` // Backend URL for auto-publish
	TrackID    string `json:"track_id,omitempty"`    // Track ID for video metadata
	// Keycloak authentication for publishing
	KeycloakURL          string `json:"keycloak_url,omitempty"`
	KeycloakClientID     string `json:"keycloak_client_id,omitempty"`
	KeycloakClientSecret string `json:"keycloak_client_secret,omitempty"`
	KeycloakUsername     string `json:"keycloak_username,omitempty"`
	KeycloakPassword     string `json:"keycloak_password,omitempty"`
}

// StopRecordingRequest is the JSON body for POST /recording/stop
type StopRecordingRequest struct {
	RoomID string `json:"room_id"`
}

// RecordingStatusResponse is the JSON response for GET /recording/status
type RecordingStatusResponse struct {
	Status   string `json:"status"` // "idle", "recording", "error"
	RoomID   string `json:"room_id,omitempty"`
	FilePath string `json:"file_path,omitempty"`
	Error    string `json:"error,omitempty"`
}

// SessionInfo contains information about an active recording session
type SessionInfo struct {
	RoomID   string `json:"room_id"`
	FilePath string `json:"file_path"`
	Status   string `json:"status"`
}

// MultiStatusResponse is the JSON response for GET /recording/status with multiple sessions
type MultiStatusResponse struct {
	ActiveCount int           `json:"active_count"`
	Sessions    []SessionInfo `json:"sessions"`
}

// RecordingServer manages the HTTP server and multiple recording sessions
type RecordingServer struct {
	sessions      map[string]*RecordingSession // roomID -> session
	mu            sync.Mutex
	defaultOutput string
	// Environment-based config for auto-publish (read from env vars)
	backendURL           string
	keycloakURL          string
	keycloakClientID     string
	keycloakClientSecret string
	keycloakUsername     string
	keycloakPassword     string
}

// NewRecordingServer creates a new HTTP server instance
func NewRecordingServer(defaultOutput string) *RecordingServer {
	return &RecordingServer{
		sessions:             make(map[string]*RecordingSession),
		defaultOutput:        defaultOutput,
		backendURL:           getEnv("BACKEND_PUBLIC_URL", ""),
		keycloakURL:          getEnv("KEYCLOAK_TOKEN_URL", ""),
		keycloakClientID:     getEnv("KEYCLOAK_CLIENT_ID", ""),
		keycloakClientSecret: getEnv("KEYCLOAK_CLIENT_SECRET", ""),
		keycloakUsername:     getEnv("RECORDING_USER_USERNAME", ""),
		keycloakPassword:     getEnv("RECORDING_USER_PASSWORD", ""),
	}
}
