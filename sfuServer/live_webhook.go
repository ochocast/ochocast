package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

// US-5b: the SFU notifies the backend when a live starts / stops on a room, so
// the backend can start / stop the recorder of armed tracks (room_id == trackId).
// Only the origin (WHIP ingestion) notifies; edges never do.

const (
	// Tracks (audio + video) arrive a few ms apart. The recorder only gets the
	// tracks present when it joins, so wait for them before notifying.
	liveStartSettleTimeout = 3 * time.Second
	liveStartPollInterval  = 250 * time.Millisecond
	expectedLiveTracks     = 2
)

var liveWebhookClient = &http.Client{Timeout: 30 * time.Second}

// notifyLiveStarted waits for the host tracks to settle, then notifies the
// backend if the stream is still active.
func notifyLiveStarted(room *Room) {
	deadline := time.Now().Add(liveStartSettleTimeout)
	for time.Now().Before(deadline) {
		room.mu.RLock()
		count := len(room.Broadcasters)
		room.mu.RUnlock()
		if count >= expectedLiveTracks {
			break
		}
		time.Sleep(liveStartPollInterval)
	}

	room.mu.RLock()
	active := room.StreamActive
	room.mu.RUnlock()
	if !active {
		return
	}
	sendLiveEvent(room.ID, "started")
}

func notifyLiveStopped(roomID string) {
	sendLiveEvent(roomID, "stopped")
}

func sendLiveEvent(roomID, event string) {
	backendURL := os.Getenv("BACKEND_URL")
	secret := os.Getenv("SFU_WEBHOOK_SECRET")
	if backendURL == "" || secret == "" {
		log.Printf("[LIVE-EVENT][ROOM-%s] BACKEND_URL or SFU_WEBHOOK_SECRET not set, %s not notified", roomID, event)
		return
	}

	body, _ := json.Marshal(map[string]string{"roomId": roomID, "event": event})
	req, err := http.NewRequest(http.MethodPost, backendURL+"/api/recordings/live-events", bytes.NewReader(body))
	if err != nil {
		log.Printf("[LIVE-EVENT][ROOM-%s] Failed to build request: %v", roomID, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Sfu-Webhook-Secret", secret)

	resp, err := liveWebhookClient.Do(req)
	if err != nil {
		log.Printf("[LIVE-EVENT][ROOM-%s] Failed to notify %s: %v", roomID, event, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		log.Printf("[LIVE-EVENT][ROOM-%s] Backend answered %d to %s", roomID, resp.StatusCode, event)
		return
	}
	log.Printf("[LIVE-EVENT][ROOM-%s] Backend notified: %s", roomID, event)
}
