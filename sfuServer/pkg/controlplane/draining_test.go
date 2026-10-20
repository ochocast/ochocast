package controlplane

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"whip-server/internal/models"
)

// A worker that announced its shutdown keeps its lives but gets no new room.
func TestDrainingWorkerGetsNoNewRoom(t *testing.T) {
	cp := NewControlPlane(5, 0.8)
	for _, id := range []string{"w0", "w1"} {
		if err := cp.RegisterSFU(&models.SFURegistration{SFUID: id, ServerURL: "http://" + id}); err != nil {
			t.Fatal(err)
		}
	}
	// w0 is idle (best score) but draining; w1 is busy.
	if err := cp.UpdateMetrics(&models.SFUMetrics{SFUID: "w0", ServerURL: "http://w0", Draining: true}); err != nil {
		t.Fatal(err)
	}
	if err := cp.UpdateMetrics(&models.SFUMetrics{SFUID: "w1", ServerURL: "http://w1", CPU: 0.5, Memory: 0.5}); err != nil {
		t.Fatal(err)
	}
	cp.mu.RLock()
	got := cp.selectIngestionSFU()
	cp.mu.RUnlock()
	if got != "w1" {
		t.Fatalf("new room placed on %q, want w1 (w0 is draining)", got)
	}
}

// Room keys (inside whip_url) are only shown to callers holding the control token.
func TestRoomStatusHidesKeyWithoutToken(t *testing.T) {
	t.Setenv("SFU_CONTROL_TOKEN", "s3cret")
	cp := NewControlPlane(5, 0.8)
	if err := cp.RegisterSFU(&models.SFURegistration{SFUID: "w0", ServerURL: "http://w0"}); err != nil {
		t.Fatal(err)
	}
	cp.mu.Lock()
	cp.rooms["room-1"] = &models.RoomTopology{RoomID: "room-1", Key: "secret-room-key", Nodes: map[string]*models.TopologyNode{}}
	cp.mu.Unlock()

	for _, h := range []http.HandlerFunc{cp.HandleRoomExists, cp.HandleRoomStatus} {
		anon := httptest.NewRecorder()
		h(anon, httptest.NewRequest(http.MethodGet, "/x?room_id=room-1", nil))
		if strings.Contains(anon.Body.String(), "secret-room-key") {
			t.Errorf("room key shown without the token: %s", anon.Body.String())
		}

		r := httptest.NewRequest(http.MethodGet, "/x?room_id=room-1", nil)
		r.Header.Set("X-SFU-Control-Token", "s3cret")
		authed := httptest.NewRecorder()
		h(authed, r)
		if !strings.Contains(authed.Body.String(), "secret-room-key") {
			t.Errorf("room key missing for the backend: %s", authed.Body.String())
		}
	}
}
