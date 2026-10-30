package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// setCORSHeaders sets CORS headers for cross-origin requests
func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Recording-Timestamp, X-Recording-Signature")
}

// handleStart handles POST /recording/start
func (s *RecordingServer) handleStart(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !requireSignature(s, w, r) {
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
	// The recorder only ever records the SFU of its configuration
	// (RECORDER_SFU_URL: the local SFU on a worker), never a URL from a request.
	if s.sfuURL == "" {
		log.Printf("[CONFIG] RECORDER_SFU_URL is not set — cannot record")
		http.Error(w, "Recorder SFU not configured", http.StatusServiceUnavailable)
		return
	}

	outputDir := s.defaultOutput

	s.mu.Lock()
	defer s.mu.Unlock()

	// A recording started now would be killed at the end of the shutdown.
	if s.shuttingDown {
		http.Error(w, "Recorder shutting down", http.StatusServiceUnavailable)
		return
	}

	// Check if already recording THIS room (but allow different rooms)
	if existingSession, exists := s.sessions[req.RoomID]; exists && existingSession.isRecording {
		http.Error(w, "Recording already in progress for this room", http.StatusConflict)
		return
	}

	// Create new recording session — all sensitive config comes from server env vars only
	session, err := NewRecordingSession(RecordingConfig{
		EventID:      req.RoomID,
		RoomID:       req.RoomID,
		RoomKey:      req.RoomKey,
		SfuBaseURL:   s.sfuURL,
		OutputDir:    outputDir,
		BackendURL:   s.backendURL,
		TrackID:      req.TrackID,
		SharedSecret: s.sharedSecret,
		Uploads:      &s.uploads,
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

	if !requireSignature(s, w, r) {
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

	// 409: the recording already ended (stopped by a WebRTC failure or an
	// earlier stop); the backend treats it as already stopped.
	session, exists := s.sessions[req.RoomID]
	if !exists || !session.isRecording {
		s.mu.Unlock()
		http.Error(w, "No recording in progress for this room", http.StatusConflict)
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

	if !requireSignature(s, w, r) {
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
		ActiveCount:    len(sessions),
		Sessions:       sessions,
		PendingUploads: s.uploads.pending.Load(),
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

// Upload retries: a failed publish is retried, then the file is left to the
// stale-recording cleanup (see cleanupStaleRecordings).
var publishRetryDelays = []time.Duration{10 * time.Second, 30 * time.Second, 2 * time.Minute}

// errPermanent marks a backend rejection that a retry cannot fix (4xx).
type errPermanent struct{ error }

// segmentMeta is sent with each segment so the backend can judge it.
type segmentMeta struct {
	Duration    float64 // recorded media duration, seconds
	Problematic bool    // likely truncated or unusable
}

// publishAsync uploads the segment in the background. uploads tracks it: a
// shutdown waits for it and the status reports it to the control plane.
func publishAsync(uploads *uploadTracker, backendURL, trackID, filePath, sharedSecret string, meta segmentMeta) {
	uploads.start()
	go func() {
		defer uploads.done()
		if err := publishWithRetry(backendURL, trackID, filePath, sharedSecret, meta); err != nil {
			log.Printf("[ERROR] Failed to publish recording to backend, kept for %s at %s: %v", recordingRetention(), filePath, err)
		} else {
			log.Printf("[HTTP] Recording published successfully for track: %s", trackID)
		}
	}()
}

// publishWithRetry publishes the segment, retrying network errors and 5xx
// responses. The local file is deleted once the backend has accepted it.
func publishWithRetry(backendURL, trackID, filePath, sharedSecret string, meta segmentMeta) error {
	var err error
	for attempt := 0; ; attempt++ {
		if err = publishToBackend(backendURL, trackID, filePath, sharedSecret, meta); err == nil {
			if rmErr := os.Remove(filePath); rmErr != nil {
				log.Printf("[WARN] Could not delete temp file %s: %v", filePath, rmErr)
			}
			return nil
		}
		var permanent errPermanent
		if errors.As(err, &permanent) || attempt >= len(publishRetryDelays) {
			return err
		}
		log.Printf("[PUBLISH] Attempt %d failed (%v), retrying in %s", attempt+1, err, publishRetryDelays[attempt])
		time.Sleep(publishRetryDelays[attempt])
	}
}

// publishToBackend streams the recorded MP4 file to the backend. The multipart
// body is produced while it is sent (io.Pipe), so memory stays constant
// whatever the length of the live (about 2 GB per hour at 4.5 Mbit/s).
func publishToBackend(backendURL, trackID, filePath, sharedSecret string, meta segmentMeta) error {
	log.Printf("[PUBLISH] Sending recording to backend: %s (track: %s)", backendURL, trackID)

	file, err := os.Open(filePath)
	if err != nil {
		return errPermanent{fmt.Errorf("failed to open file: %w", err)}
	}
	defer file.Close()

	fileInfo, err := file.Stat()
	if err != nil {
		return fmt.Errorf("failed to get file info: %w", err)
	}
	log.Printf("[PUBLISH] File size: %.2f MB", float64(fileInfo.Size())/1024/1024)

	body, writer := io.Pipe()
	form := multipart.NewWriter(writer)
	go func() {
		writer.CloseWithError(func() error {
			// Fields first, so the backend has them before the file.
			for _, field := range [][2]string{
				{"trackId", trackID},
				{"duration", strconv.FormatFloat(meta.Duration, 'f', 3, 64)},
				{"problematic", strconv.FormatBool(meta.Problematic)},
			} {
				if err := form.WriteField(field[0], field[1]); err != nil {
					return err
				}
			}
			part, err := form.CreateFormFile("file", filepath.Base(filePath))
			if err != nil {
				return err
			}
			if _, err := io.Copy(part, file); err != nil {
				return fmt.Errorf("failed to stream file: %w", err)
			}
			return form.Close()
		}())
	}()

	// Raccordement US-1: recordings are now registered as unlisted segments
	// instead of being auto-published as a public video.
	publishURL := fmt.Sprintf("%s/api/recordings/segments", backendURL)
	req, err := http.NewRequest("POST", publishURL, body)
	if err != nil {
		body.Close()
		return errPermanent{fmt.Errorf("failed to create request: %w", err)}
	}
	req.Header.Set("Content-Type", form.FormDataContentType())

	// Add shared secret header (always required by the backend publish endpoint)
	if sharedSecret != "" {
		req.Header.Set("X-Recording-Secret", sharedSecret)
	}

	log.Printf("[PUBLISH] Sending POST to %s", publishURL)

	resp, err := publishClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		err := fmt.Errorf("backend returned status %d: %s", resp.StatusCode, string(respBody))
		if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != http.StatusRequestTimeout && resp.StatusCode != http.StatusTooManyRequests {
			return errPermanent{err}
		}
		return err
	}

	log.Printf("[PUBLISH] Backend response: %s", string(respBody))
	return nil
}

// publishClient bounds one upload attempt; a one-hour live is about 2 GB.
var publishClient = &http.Client{Timeout: 30 * time.Minute}

// cleanupStaleRecordings deletes recordings left in dir (failed uploads,
// sessions without a track) once they are older than retention, so the disk
// cannot fill up. Files being recorded are written continuously and stay fresh.
func cleanupStaleRecordings(dir string, retention time.Duration) {
	matches, err := filepath.Glob(filepath.Join(dir, "recording-*.mp4"))
	if err != nil {
		log.Printf("[CLEANUP] Cannot list %s: %v", dir, err)
		return
	}
	for _, path := range matches {
		info, err := os.Stat(path)
		if err != nil || time.Since(info.ModTime()) < retention {
			continue
		}
		if err := os.Remove(path); err != nil {
			log.Printf("[CLEANUP] Could not delete %s: %v", path, err)
			continue
		}
		log.Printf("[CLEANUP] Deleted stale recording %s (%.2f MB, last written %s)", path, float64(info.Size())/1024/1024, info.ModTime().Format(time.RFC3339))
	}
}

// recordingRetention reads RECORDING_RETENTION_HOURS (default 24 h): the time
// left to recover a recording whose upload failed before it is deleted.
func recordingRetention() time.Duration {
	if hours, err := strconv.Atoi(os.Getenv("RECORDING_RETENTION_HOURS")); err == nil && hours > 0 {
		return time.Duration(hours) * time.Hour
	}
	return 24 * time.Hour
}
