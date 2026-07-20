package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// setCORSHeaders sets CORS headers for cross-origin requests
func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Recording-Secret")
}

// requireSecret checks the X-Recording-Secret header against the configured shared secret.
// Returns true and continues if valid; writes 401 and returns false if invalid.
func requireSecret(s *RecordingServer, w http.ResponseWriter, r *http.Request) bool {
	if s.sharedSecret == "" {
		log.Printf("[SECURITY] RECORDING_SHARED_SECRET is not set — rejecting all requests")
		http.Error(w, "Recording endpoint not configured", http.StatusUnauthorized)
		return false
	}
	if r.Header.Get("X-Recording-Secret") != s.sharedSecret {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	return true
}

// handleStart handles POST /recording/start
func (s *RecordingServer) handleStart(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !requireSecret(s, w, r) {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req StartRecordingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.RoomID == "" {
		http.Error(w, "room_id is required", http.StatusBadRequest)
		return
	}
	if req.SfuURL == "" {
		http.Error(w, "sfu_url is required", http.StatusBadRequest)
		return
	}

	outputDir := s.defaultOutput

	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if already recording THIS room (but allow different rooms)
	if existingSession, exists := s.sessions[req.RoomID]; exists && existingSession.isRecording {
		http.Error(w, "Recording already in progress for this room", http.StatusConflict)
		return
	}

	// Create new recording session — all sensitive config comes from server env vars only
	session, err := NewRecordingSession(RecordingConfig{
		EventID:              req.RoomID,
		RoomID:               req.RoomID,
		RoomKey:              req.RoomKey,
		SfuBaseURL:           req.SfuURL,
		OutputDir:            outputDir,
		BackendURL:           s.backendURL,
		TrackID:              req.TrackID,
		SharedSecret:         s.sharedSecret,
		KeycloakURL:          s.keycloakURL,
		KeycloakClientID:     s.keycloakClientID,
		KeycloakClientSecret: s.keycloakClientSecret,
		KeycloakUsername:     s.keycloakUsername,
		KeycloakPassword:     s.keycloakPassword,
	})
	if err != nil {
		http.Error(w, "Failed to create session: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Start recording
	if err := session.StartRecording(); err != nil {
		http.Error(w, "Failed to start recording: "+err.Error(), http.StatusInternalServerError)
		return
	}

	s.sessions[req.RoomID] = session

	log.Printf("[HTTP] Recording started for room: %s (total active: %d)", req.RoomID, len(s.sessions))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "recording",
		"room_id":   req.RoomID,
		"file_path": session.mp4FilePath,
	})
}

// handleStop handles POST /recording/stop
func (s *RecordingServer) handleStop(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !requireSecret(s, w, r) {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body to get room_id
	var req StopRecordingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.RoomID == "" {
		http.Error(w, "room_id is required", http.StatusBadRequest)
		return
	}

	s.mu.Lock()

	session, exists := s.sessions[req.RoomID]
	if !exists || !session.isRecording {
		s.mu.Unlock()
		http.Error(w, "No recording in progress for this room", http.StatusBadRequest)
		return
	}

	filePath := session.mp4FilePath
	roomID := session.roomID

	if err := session.Stop(); err != nil {
		s.mu.Unlock()
		http.Error(w, "Failed to stop recording: "+err.Error(), http.StatusInternalServerError)
		return
	}

	delete(s.sessions, req.RoomID)
	s.mu.Unlock()

	log.Printf("[HTTP] Recording stopped for room: %s (remaining active: %d)", roomID, len(s.sessions))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "stopped",
		"room_id":   roomID,
		"file_path": filePath,
	})
}

// handleStatus handles GET /recording/status
// Optional query param: room_id (to get status of specific room)
func (s *RecordingServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !requireSecret(s, w, r) {
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if specific room_id requested
	roomID := r.URL.Query().Get("room_id")
	if roomID != "" {
		// Return status for specific room
		resp := RecordingStatusResponse{}
		if session, exists := s.sessions[roomID]; exists && session.isRecording {
			resp.Status = "recording"
			resp.RoomID = session.roomID
			resp.FilePath = session.mp4FilePath
		} else {
			resp.Status = "idle"
			resp.RoomID = roomID
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
		return
	}

	// Return status for all sessions
	sessions := make([]SessionInfo, 0, len(s.sessions))
	for _, session := range s.sessions {
		if session.isRecording {
			sessions = append(sessions, SessionInfo{
				RoomID:   session.roomID,
				FilePath: session.mp4FilePath,
				Status:   "recording",
			})
		}
	}

	resp := MultiStatusResponse{
		ActiveCount: len(sessions),
		Sessions:    sessions,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// handleHealth handles GET /health
func (s *RecordingServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// getKeycloakToken obtains an access token from Keycloak using password grant
func getKeycloakToken(keycloakURL, clientID, clientSecret, username, password string) (string, error) {
	log.Printf("[KEYCLOAK] Getting token from: %s", keycloakURL)

	data := url.Values{}
	data.Set("grant_type", "password")
	data.Set("client_id", clientID)
	if clientSecret != "" {
		data.Set("client_secret", clientSecret)
	}
	data.Set("username", username)
	data.Set("password", password)

	req, err := http.NewRequest("POST", keycloakURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("failed to create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to request token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("keycloak returned status %d: %s", resp.StatusCode, string(body))
	}

	var tokenResponse struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResponse); err != nil {
		return "", fmt.Errorf("failed to decode token response: %w", err)
	}

	log.Printf("[KEYCLOAK] Token obtained successfully")
	return tokenResponse.AccessToken, nil
}

// publishToBackend sends the recorded MP4 file to the backend for auto-publication
func publishToBackend(backendURL, trackID, filePath, token, sharedSecret string) error {
	log.Printf("[PUBLISH] Sending recording to backend: %s (track: %s)", backendURL, trackID)

	// Open the MP4 file
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// Get file info for logging
	fileInfo, err := file.Stat()
	if err != nil {
		return fmt.Errorf("failed to get file info: %w", err)
	}
	log.Printf("[PUBLISH] File size: %.2f MB", float64(fileInfo.Size())/1024/1024)

	// Create multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add the file
	part, err := writer.CreateFormFile("file", filepath.Base(filePath))
	if err != nil {
		return fmt.Errorf("failed to create form file: %w", err)
	}

	if _, err := io.Copy(part, file); err != nil {
		return fmt.Errorf("failed to copy file: %w", err)
	}

	// Add the trackId field
	if err := writer.WriteField("trackId", trackID); err != nil {
		return fmt.Errorf("failed to write trackId field: %w", err)
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("failed to close multipart writer: %w", err)
	}

	// Send the request
	publishURL := fmt.Sprintf("%s/api/recordings/publish", backendURL)
	req, err := http.NewRequest("POST", publishURL, body)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Add shared secret header (always required by the backend publish endpoint)
	if sharedSecret != "" {
		req.Header.Set("X-Recording-Secret", sharedSecret)
	}

	// Add Authorization header if token is provided
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	log.Printf("[PUBLISH] Sending POST to %s", publishURL)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("backend returned status %d: %s", resp.StatusCode, string(respBody))
	}

	log.Printf("[PUBLISH] Backend response: %s", string(respBody))
	return nil
}
