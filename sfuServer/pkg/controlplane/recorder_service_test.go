package controlplane

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
	"time"

	"whip-server/internal/models"
)

func TestRecorderServiceURL(t *testing.T) {
	cases := []struct{ sfuURL, port, want string }{
		{"http://51.15.1.2:8090", "8083", "http://51.15.1.2:8083"},
		{"http://localhost:8091", "8083", "http://localhost:8083"},
		{"http://[2001:db8::1]:8090", "8083", "http://[2001:db8::1]:8083"},
		{"http://51.15.1.2:8090", "", ""},
		{"not a url", "8083", ""},
	}
	for _, c := range cases {
		if got := recorderServiceURL(c.sfuURL, c.port); got != c.want {
			t.Errorf("recorderServiceURL(%q, %q) = %q, want %q", c.sfuURL, c.port, got, c.want)
		}
	}
}

// Known vector, shared with liveRecoder/auth_test.go and the backend.
func TestSignRecorderRequestMatchesRecorder(t *testing.T) {
	got := signRecorderRequest("secret", "1700000000", "POST", "/recording/start", []byte(`{"room_id":"r1"}`))
	if got != "2883f07f678b24eeb1b5d6ce478df81f2f3f9f57af031717348e1dd6bb2b5b24" {
		t.Fatalf("signature differs from the recorder's: %s", got)
	}
}

// recorderCleanupFixture builds a control plane whose room "room-rec" runs on
// an on-demand worker; its recorder answers busy while busy is set, and only
// to correctly signed requests.
func recorderCleanupFixture(t *testing.T, busy *atomic.Bool) (*ControlPlane, chan string, *atomic.Int32) {
	t.Helper()
	savedDelay, savedRecheck, savedMax := topologyCleanupDelay, recorderBusyRecheck, recorderBusyMaxDelay
	topologyCleanupDelay, recorderBusyRecheck = 10*time.Millisecond, 10*time.Millisecond
	t.Cleanup(func() {
		topologyCleanupDelay, recorderBusyRecheck, recorderBusyMaxDelay = savedDelay, savedRecheck, savedMax
	})

	checks := &atomic.Int32{}
	recorder := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ts := r.Header.Get("X-Recording-Timestamp")
		if r.Header.Get("X-Recording-Signature") != signRecorderRequest("rec-secret", ts, r.Method, r.URL.RequestURI(), nil) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		checks.Add(1)
		pending := 0
		if busy.Load() {
			pending = 1
		}
		json.NewEncoder(w).Encode(map[string]any{"active_count": 0, "sessions": []any{}, "pending_uploads": pending})
	}))
	t.Cleanup(recorder.Close)
	recorderURL, _ := url.Parse(recorder.URL)

	cp := newTestCP(t)
	released := make(chan string, 1)
	cp.SetProvisioner(&stubEnsurer{released: released})
	cp.SetRecorder(recorderURL.Port(), "rec-secret")
	cp.mu.Lock()
	cp.sfus["sfu-rec"] = &SFUInfo{ID: "sfu-rec", URL: "http://127.0.0.1:8090"}
	cp.rooms["room-rec"] = &models.RoomTopology{
		RoomID:         "room-rec",
		IngestionSFUID: "sfu-rec",
		Nodes:          map[string]*models.TopologyNode{"sfu-rec": {SFUID: "sfu-rec", RoomID: "room-rec", Role: "ingestion"}},
	}
	cp.mu.Unlock()
	return cp, released, checks
}

func TestTopologyCleanupWaitsWhileRecorderIsBusy(t *testing.T) {
	busy := &atomic.Bool{}
	busy.Store(true)
	cp, released, checks := recorderCleanupFixture(t, busy)

	cp.scheduleTopologyCleanupWithGracePeriod("room-rec", "sfu-rec")

	deadline := time.Now().Add(2 * time.Second)
	for checks.Load() < 3 {
		if time.Now().After(deadline) {
			t.Fatalf("recorder checked %d times, want 3", checks.Load())
		}
		time.Sleep(5 * time.Millisecond)
	}
	select {
	case <-released:
		t.Fatal("worker released while its recorder was uploading")
	default:
	}
	cp.mu.RLock()
	_, exists := cp.rooms["room-rec"]
	cp.mu.RUnlock()
	if !exists {
		t.Fatal("topology cleaned up while the recorder was busy")
	}

	busy.Store(false)
	select {
	case roomID := <-released:
		if roomID != "room-rec" {
			t.Fatalf("released %s, want room-rec", roomID)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("worker not released once the recorder was idle")
	}
}

func TestTopologyCleanupStopsWaitingAfterMaxDelay(t *testing.T) {
	busy := &atomic.Bool{}
	busy.Store(true)
	cp, released, _ := recorderCleanupFixture(t, busy)
	recorderBusyMaxDelay = 50 * time.Millisecond

	cp.scheduleTopologyCleanupWithGracePeriod("room-rec", "sfu-rec")

	select {
	case <-released:
	case <-time.After(2 * time.Second):
		t.Fatal("a recorder busy forever must not keep the worker past the max delay")
	}
}

func TestIngestionRecorderBusyOnlyWhenTheWorkerIsReleased(t *testing.T) {
	busy := &atomic.Bool{}
	busy.Store(true)
	cp, _, _ := recorderCleanupFixture(t, busy)
	if !cp.ingestionRecorderBusy("room-rec") {
		t.Fatal("busy recorder on the released worker not detected")
	}

	// Another room still uses the worker: it is kept anyway, no wait.
	cp.mu.Lock()
	cp.rooms["room-other"] = &models.RoomTopology{
		RoomID:         "room-other",
		IngestionSFUID: "sfu-rec",
		Nodes:          map[string]*models.TopologyNode{"sfu-rec": {SFUID: "sfu-rec", RoomID: "room-other", Role: "ingestion"}},
	}
	cp.mu.Unlock()
	if cp.ingestionRecorderBusy("room-rec") {
		t.Fatal("must not wait for a worker that another room keeps")
	}

	// A wrong secret is rejected by the recorder: not waited for.
	cp.mu.Lock()
	delete(cp.rooms, "room-other")
	cp.mu.Unlock()
	cp.SetRecorder(cp.recorderPort, "other-secret")
	if cp.ingestionRecorderBusy("room-rec") {
		t.Fatal("an unauthorized status check must not block the release")
	}
}
