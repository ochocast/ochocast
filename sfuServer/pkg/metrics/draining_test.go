package metrics

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSetDrainingDoesNotWaitForStalledHeartbeat(t *testing.T) {
	received := make(chan bool, 1)
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var heartbeat struct {
			Draining bool `json:"draining"`
		}
		err := json.NewDecoder(r.Body).Decode(&heartbeat)
		received <- err == nil && heartbeat.Draining
		<-release
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	defer close(release)
	c := NewCollector("worker", "http://worker", srv.URL, time.Second)
	done := make(chan struct{})
	go func() { c.SetDraining(); close(done) }()
	select {
	case draining := <-received:
		if !draining {
			t.Fatal("heartbeat did not report draining")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no draining heartbeat sent")
	}
	select {
	case <-done:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("drain waits for stalled heartbeat")
	}
}
