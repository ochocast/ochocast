package main

import (
	"os"
	"sync"
	"sync/atomic"
	"time"
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
	RoomID  string `json:"room_id"`
	RoomKey string `json:"room_key"`
	TrackID string `json:"track_id,omitempty"` // Track ID for video metadata
	// The SFU URL, BackendURL and OutputDir are intentionally NOT accepted
	// from the request body — they come from server env vars only, so a
	// caller cannot make the recorder connect anywhere else.
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
	// Segments still being uploaded: the control plane keeps the worker
	// while this or active_count is not 0.
	PendingUploads int64 `json:"pending_uploads"`
}

// RecordingServer manages the HTTP server and multiple recording sessions
type RecordingServer struct {
	sessions      map[string]*RecordingSession // roomID -> session
	mu            sync.Mutex
	defaultOutput string
	// Environment-based config (read from env vars only — never from request body)
	sharedSecret string // RECORDING_SHARED_SECRET — signs every request (auth.go)
	backendURL   string
	sfuURL       string // RECORDER_SFU_URL — the SFU this recorder records (local on a worker)
	uploads      uploadTracker
	shuttingDown bool // set by shutdown: no new recording may start
}

// uploadTracker counts the segment uploads still running, so a shutdown can
// wait for them and the status can report them.
type uploadTracker struct {
	wg      sync.WaitGroup
	pending atomic.Int64
}

func (u *uploadTracker) start() {
	u.wg.Add(1)
	u.pending.Add(1)
}

func (u *uploadTracker) done() {
	u.pending.Add(-1)
	u.wg.Done()
}

// wait reports whether every upload finished within grace.
func (u *uploadTracker) wait(grace time.Duration) bool {
	finished := make(chan struct{})
	go func() {
		u.wg.Wait()
		close(finished)
	}()
	select {
	case <-finished:
		return true
	case <-time.After(grace):
		return false
	}
}

// NewRecordingServer creates a new HTTP server instance
func NewRecordingServer(defaultOutput string) *RecordingServer {
	return &RecordingServer{
		sessions:      make(map[string]*RecordingSession),
		defaultOutput: defaultOutput,
		sharedSecret:  getEnv("RECORDING_SHARED_SECRET", ""),
		backendURL:    getEnv("BACKEND_PUBLIC_URL", ""),
		sfuURL:        getEnv("RECORDER_SFU_URL", ""),
	}
}
