package controlplane

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"whip-server/internal/autoscaler"
	"whip-server/internal/models"
	"whip-server/internal/provider"
)

// stubEnsurer stands in for the autoscaler in control-plane tests.
type stubEnsurer struct {
	called chan string
	err    error
}

func (s *stubEnsurer) EnsureCapacity(_ context.Context, roomID string) (models.WorkerRecord, error) {
	if s.called != nil {
		s.called <- roomID
	}
	return models.WorkerRecord{}, s.err
}

func newTestCP(t *testing.T) *ControlPlane {
	t.Helper()
	t.Setenv("CONTROL_PLANE_STATE_FILE", filepath.Join(t.TempDir(), "rooms.json"))
	return NewControlPlane(5, 0.8)
}

func TestCreateRoomColdStartProvisions(t *testing.T) {
	cp := newTestCP(t)
	stub := &stubEnsurer{called: make(chan string, 1)}
	cp.SetProvisioner(stub)

	key, existed, err := cp.CreateRoom("room-1")
	if err != nil {
		t.Fatalf("cold start should not error: %v", err)
	}
	if key == "" || existed {
		t.Fatalf("want a new room with a key, got key=%q existed=%v", key, existed)
	}

	// Room is persisted as provisioning, not ready.
	if rl, ok := cp.roomState.Get("room-1"); !ok || rl.State != models.RoomProvisioning {
		t.Fatalf("room not provisioning: %+v ok=%v", rl, ok)
	}

	// The autoscaler was asked to create capacity for this room.
	select {
	case got := <-stub.called:
		if got != "room-1" {
			t.Fatalf("EnsureCapacity called for %q, want room-1", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("EnsureCapacity was never called")
	}
}

func TestCreateRoomNoProvisionerHardFails(t *testing.T) {
	cp := newTestCP(t)
	// No provisioner set: preserve the original hard-failure behaviour.
	if _, _, err := cp.CreateRoom("room-1"); err == nil {
		t.Fatal("expected 'no active SFUs available' without a provisioner")
	}
}

func roomStatus(t *testing.T, cp *ControlPlane, roomID string) (int, map[string]interface{}) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/room/status?room_id="+roomID, nil)
	rec := httptest.NewRecorder()
	cp.HandleRoomStatus(rec, req)
	var body map[string]interface{}
	if rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode status body: %v", err)
		}
	}
	return rec.Code, body
}

func TestRoomStatusProvisioningThenReady(t *testing.T) {
	cp := newTestCP(t)
	cp.SetProvisioner(&stubEnsurer{called: make(chan string, 1)})

	if _, _, err := cp.CreateRoom("room-1"); err != nil {
		t.Fatal(err)
	}

	// While provisioning: not ready, no WHIP URL exposed.
	code, body := roomStatus(t, cp, "room-1")
	if code != http.StatusOK {
		t.Fatalf("status code = %d", code)
	}
	if body["state"] != "provisioning" || body["ready"] != false {
		t.Fatalf("provisioning status wrong: %+v", body)
	}
	if _, hasWHIP := body["whip_url"]; hasWHIP {
		t.Fatal("whip_url must not be exposed before the room is ready")
	}

	// Promote to ready: WHIP URL appears.
	if _, err := cp.roomState.Upsert("room-1", models.RoomReady, ""); err != nil {
		t.Fatal(err)
	}
	code, body = roomStatus(t, cp, "room-1")
	if body["state"] != "ready" || body["ready"] != true {
		t.Fatalf("ready status wrong: %+v", body)
	}
	if _, hasWHIP := body["whip_url"]; !hasWHIP {
		t.Fatal("whip_url should be present once ready")
	}

	// Unknown room: 404.
	if code, _ := roomStatus(t, cp, "nope"); code != http.StatusNotFound {
		t.Fatalf("unknown room status = %d, want 404", code)
	}
}

func TestColdStartReadinessLoop(t *testing.T) {
	cp := newTestCP(t)
	fake := provider.NewFake()
	prov := autoscaler.New(cp.LifecycleStore(), fake, autoscaler.Config{MaxWorkers: 1, ImageTag: "sfu:1"})
	cp.SetProvisioner(prov)

	if _, _, err := cp.CreateRoom("room-1"); err != nil {
		t.Fatal(err)
	}

	// Wait for the background provisioning to create the worker record.
	var sfuID string
	deadline := time.Now().Add(2 * time.Second)
	for sfuID == "" {
		if ws := cp.LifecycleStore().ListWorkers(); len(ws) == 1 {
			sfuID = ws[0].SFUID
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("worker record never created")
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Registration alone must NOT make the room ready (readiness needs a healthy
	// heartbeat too).
	if err := cp.RegisterSFU(&models.SFURegistration{SFUID: sfuID, ServerURL: "http://1.2.3.4:8080"}); err != nil {
		t.Fatal(err)
	}
	if w, _ := cp.LifecycleStore().GetWorker(sfuID); w.State != models.WorkerRegistered {
		t.Fatalf("after register, worker state = %s, want registered", w.State)
	}
	if rl, _ := cp.LifecycleStore().Get("room-1"); rl.State != models.RoomProvisioning {
		t.Fatalf("room ready too early: %s", rl.State)
	}

	// A healthy heartbeat promotes the worker to ready and binds it to the room.
	if err := cp.UpdateMetrics(&models.SFUMetrics{SFUID: sfuID, ServerURL: "http://1.2.3.4:8080", CPU: 0.1, Memory: 0.1}); err != nil {
		t.Fatal(err)
	}
	if w, _ := cp.LifecycleStore().GetWorker(sfuID); w.State != models.WorkerReady {
		t.Fatalf("after healthy heartbeat, worker state = %s, want ready", w.State)
	}
	if rl, _ := cp.LifecycleStore().Get("room-1"); rl.State != models.RoomReady {
		t.Fatalf("room state = %s, want ready", rl.State)
	}

	// The room is now bound to the worker as its ingestion SFU.
	cp.mu.RLock()
	ingestion := cp.rooms["room-1"].IngestionSFUID
	cp.mu.RUnlock()
	if ingestion != sfuID {
		t.Fatalf("ingestion SFU = %q, want %q", ingestion, sfuID)
	}

	// And the status endpoint now exposes the WHIP URL.
	_, body := roomStatus(t, cp, "room-1")
	if body["ready"] != true {
		t.Fatalf("status not ready: %+v", body)
	}
	if _, ok := body["whip_url"]; !ok {
		t.Fatal("whip_url should be exposed once ready")
	}
}

func TestColdStartProvisionFailureMarksRoomFailed(t *testing.T) {
	cp := newTestCP(t)
	cp.SetProvisioner(&stubEnsurer{err: errors.New("budget exceeded")})

	if _, _, err := cp.CreateRoom("room-1"); err != nil {
		t.Fatalf("create should return provisioning, not error: %v", err)
	}

	// The background provisioning failure eventually marks the room failed.
	deadline := time.Now().Add(2 * time.Second)
	for {
		if rl, _ := cp.roomState.Get("room-1"); rl.State == models.RoomFailed {
			break
		}
		if time.Now().After(deadline) {
			rl, _ := cp.roomState.Get("room-1")
			t.Fatalf("room never marked failed, state=%s", rl.State)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
