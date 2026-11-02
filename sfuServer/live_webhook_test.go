package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// newLiveRoom resets the SFU with one room whose stream is active or not.
func newLiveRoom(t *testing.T, roomID string, active bool) *Room {
	t.Helper()
	t.Setenv("CONTROL_PLANE_URL", "")
	sfuServer = NewSFUServer()
	if err := sfuServer.CreateRoomWithKey(roomID, "room-key"); err != nil {
		t.Fatal(err)
	}
	room, err := sfuServer.GetRoom(roomID)
	if err != nil {
		t.Fatal(err)
	}
	setStreamActive(room, active)
	return room
}

func setStreamActive(room *Room, active bool) {
	room.mu.Lock()
	room.StreamActive = active
	room.mu.Unlock()
}

// liveEventBackend points BACKEND_URL at a server that answers with handle
// and returns the number of events it received.
func liveEventBackend(t *testing.T, handle func(call int32, w http.ResponseWriter, event string)) *atomic.Int32 {
	t.Helper()
	calls := &atomic.Int32{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/recordings/live-events" || r.Header.Get("X-Sfu-Webhook-Secret") != "hook-secret" {
			t.Errorf("unexpected request %s (secret %q)", r.URL.Path, r.Header.Get("X-Sfu-Webhook-Secret"))
		}
		var body struct{ RoomID, Event string }
		json.NewDecoder(r.Body).Decode(&body)
		handle(calls.Add(1), w, body.Event)
	}))
	t.Cleanup(srv.Close)
	t.Setenv("BACKEND_URL", srv.URL)
	t.Setenv("SFU_WEBHOOK_SECRET", "hook-secret")

	saved := liveEventRetryDelays
	liveEventRetryDelays = []time.Duration{0, 0, 0, 0}
	t.Cleanup(func() { liveEventRetryDelays = saved })
	return calls
}

func TestSendLiveEventRetriesServerAndNetworkErrors(t *testing.T) {
	newLiveRoom(t, "room-live", true)
	calls := liveEventBackend(t, func(call int32, w http.ResponseWriter, _ string) {
		switch call {
		case 1:
			w.WriteHeader(http.StatusBadGateway)
		case 2:
			// Connection dropped without an answer: a network error.
			conn, _, _ := w.(http.Hijacker).Hijack()
			conn.Close()
		default:
			w.WriteHeader(http.StatusCreated)
		}
	})

	sendLiveEvent("room-live", "started")

	if got := calls.Load(); got != 3 {
		t.Fatalf("attempts = %d, want 3 (502, network error, success)", got)
	}
}

func TestSendLiveEventGivesUpAfterLastRetry(t *testing.T) {
	newLiveRoom(t, "room-live", false)
	calls := liveEventBackend(t, func(_ int32, w http.ResponseWriter, _ string) {
		w.WriteHeader(http.StatusServiceUnavailable)
	})

	sendLiveEvent("room-live", "stopped")

	if want := int32(len(liveEventRetryDelays) + 1); calls.Load() != want {
		t.Fatalf("attempts = %d, want %d", calls.Load(), want)
	}
}

func TestSendLiveEventDoesNotRetryClientErrors(t *testing.T) {
	newLiveRoom(t, "room-live", false)
	calls := liveEventBackend(t, func(_ int32, w http.ResponseWriter, _ string) {
		w.WriteHeader(http.StatusBadRequest)
	})

	sendLiveEvent("room-live", "stopped")

	if got := calls.Load(); got != 1 {
		t.Fatalf("a 4xx must not be retried, got %d attempts", got)
	}
}

// A retry is dropped once the room no longer is in the state the event
// describes: a stale "stopped" must not stop the recorder of a new live.
func TestSendLiveEventSkipsRetryWhenRoomStateChanged(t *testing.T) {
	for event, activeBefore := range map[string]bool{"stopped": false, "started": true} {
		t.Run(event, func(t *testing.T) {
			room := newLiveRoom(t, "room-live", activeBefore)
			calls := liveEventBackend(t, func(_ int32, w http.ResponseWriter, _ string) {
				setStreamActive(room, !activeBefore) // the live restarted / ended meanwhile
				w.WriteHeader(http.StatusServiceUnavailable)
			})

			sendLiveEvent("room-live", event)

			if got := calls.Load(); got != 1 {
				t.Fatalf("%s retried after the room state changed (%d attempts)", event, got)
			}
		})
	}
}

func TestScheduleCleanupReportsOnlyTheCallThatStartedIt(t *testing.T) {
	room := NewRoom("room-cleanup", "room-key")
	if !room.ScheduleCleanup() {
		t.Fatal("first ScheduleCleanup must report that it started the cleanup")
	}
	if room.ScheduleCleanup() || room.CleanupHost() {
		t.Fatal("a cleanup already scheduled must not be reported as started")
	}
	room.CancelScheduledCleanup()
}

// OBS sends a WHIP DELETE, then its PeerConnection closes: the backend must
// get a single "stopped".
func TestWHIPDeleteNotifiesStoppedOnce(t *testing.T) {
	newLiveRoom(t, "room-obs", true)
	events := make(chan string, 4)
	liveEventBackend(t, func(_ int32, w http.ResponseWriter, event string) {
		events <- event
		w.WriteHeader(http.StatusOK)
	})

	for i := 0; i < 2; i++ {
		rec := httptest.NewRecorder()
		newServerMux().ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/whip/resource/room-obs/room-key", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("DELETE %d = %d", i+1, rec.Code)
		}
	}

	select {
	case event := <-events:
		if event != "stopped" {
			t.Fatalf("event = %q, want stopped", event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no stopped event sent")
	}
	select {
	case event := <-events:
		t.Fatalf("duplicate %q event", event)
	case <-time.After(200 * time.Millisecond):
	}
	room, _ := sfuServer.GetRoom("room-obs")
	room.CancelScheduledCleanup()
}
