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
	called   chan string
	released chan string
	err      error
}

func (s *stubEnsurer) ReleaseCapacity(_ context.Context, roomID string) error {
	if s.released != nil {
		s.released <- roomID
	}
	return s.err
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

func TestTopologyCleanupReleasesOnDemandCapacity(t *testing.T) {
	cp := newTestCP(t)
	released := make(chan string, 1)
	cp.SetProvisioner(&stubEnsurer{released: released})
	cp.rooms["room-idle"] = &models.RoomTopology{
		RoomID: "room-idle",
		Nodes:  make(map[string]*models.TopologyNode),
	}

	cp.scheduleTopologyCleanup("room-idle")

	select {
	case roomID := <-released:
		if roomID != "room-idle" {
			t.Fatalf("released room = %s, want room-idle", roomID)
		}
	case <-time.After(time.Second):
		t.Fatal("topology cleanup did not release on-demand capacity")
	}
	if _, exists := cp.rooms["room-idle"]; exists {
		t.Fatal("room topology still exists after cleanup")
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

	// Complete the integration lifecycle against the fake provider:
	// ready -> draining -> cloud delete -> terminated.
	if err := prov.ReleaseCapacity(context.Background(), "room-1"); err != nil {
		t.Fatal(err)
	}
	if fake.Count() != 0 {
		t.Fatalf("fake provider still has %d worker(s) after release", fake.Count())
	}
	if worker, _ := cp.LifecycleStore().GetWorker(sfuID); worker.State != models.WorkerTerminated {
		t.Fatalf("worker state after release = %s, want terminated", worker.State)
	}
	if room, _ := cp.LifecycleStore().Get("room-1"); room.State != models.RoomTerminated {
		t.Fatalf("room state after release = %s, want terminated", room.State)
	}
}

func TestMediaFlowsGatedOnReadiness(t *testing.T) {
	cp := newTestCP(t)
	cp.SetProvisioner(&stubEnsurer{called: make(chan string, 1)})

	key, _, err := cp.CreateRoom("room-1") // cold start -> provisioning
	if err != nil {
		t.Fatal(err)
	}

	// While provisioning, WHIP is refused with 503.
	req := httptest.NewRequest(http.MethodPost, "/whip?room_id=room-1&key="+key, nil)
	rec := httptest.NewRecorder()
	cp.HandleWHIP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("WHIP while provisioning = %d, want 503", rec.Code)
	}

	// Once failed, WHIP is refused with 409.
	if _, err := cp.roomState.Upsert("room-1", models.RoomFailed, "budget"); err != nil {
		t.Fatal(err)
	}
	rec = httptest.NewRecorder()
	cp.HandleWHIP(rec, httptest.NewRequest(http.MethodPost, "/whip?room_id=room-1&key="+key, nil))
	if rec.Code != http.StatusConflict {
		t.Fatalf("WHIP while failed = %d, want 409", rec.Code)
	}
}

func TestSelectIngestionSkipsDraining(t *testing.T) {
	cp := newTestCP(t)
	store := cp.LifecycleStore()

	ready := func(id string) {
		rec := models.WorkerRecord{SFUID: id, State: models.WorkerProvisioning}
		if _, err := store.UpsertWorker(rec); err != nil {
			t.Fatal(err)
		}
		for _, st := range []models.WorkerState{models.WorkerRegistered, models.WorkerReady} {
			rec.State = st
			if _, err := store.UpsertWorker(rec); err != nil {
				t.Fatal(err)
			}
		}
		if err := cp.RegisterSFU(&models.SFURegistration{SFUID: id, ServerURL: "http://" + id}); err != nil {
			t.Fatal(err)
		}
	}
	ready("sfu-a")
	ready("sfu-b")

	// Both ready: selection returns one of them.
	cp.mu.Lock()
	got := cp.selectIngestionSFU()
	cp.mu.Unlock()
	if got != "sfu-a" && got != "sfu-b" {
		t.Fatalf("selected %q, want a ready SFU", got)
	}

	// Drain sfu-a: selection must now avoid it every time.
	a, _ := store.GetWorker("sfu-a")
	a.State = models.WorkerDraining
	if _, err := store.UpsertWorker(a); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		cp.mu.Lock()
		got := cp.selectIngestionSFU()
		cp.mu.Unlock()
		if got != "sfu-b" {
			t.Fatalf("selected %q, want sfu-b (sfu-a is draining)", got)
		}
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

func TestOperatorStatusReportsWorkersFailuresAndCleanup(t *testing.T) {
	cp := newTestCP(t)

	if err := cp.RegisterSFU(&models.SFURegistration{SFUID: "sfu-active", ServerURL: "http://sfu-active"}); err != nil {
		t.Fatal(err)
	}
	if err := cp.UpdateMetrics(&models.SFUMetrics{
		SFUID:         "sfu-active",
		ServerURL:     "http://sfu-active",
		CPU:           0.2,
		Memory:        0.3,
		ActiveHosts:   1,
		ActiveViewers: 3,
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := cp.roomState.Upsert("room-failed", models.RoomFailed, "budget exceeded"); err != nil {
		t.Fatal(err)
	}
	if _, err := cp.roomState.Upsert("room-ready", models.RoomReady, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := cp.roomState.UpsertWorker(models.WorkerRecord{
		SFUID:  "sfu-failed",
		State:  models.WorkerFailed,
		RoomID: "room-failed",
		Reason: "startup timeout",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := cp.roomState.UpsertWorker(models.WorkerRecord{
		SFUID:  "sfu-ready",
		State:  models.WorkerReady,
		RoomID: "room-ready",
	}); err != nil {
		t.Fatal(err)
	}

	timer := time.NewTimer(time.Hour)
	defer timer.Stop()
	cp.cleanupMu.Lock()
	cp.pendingCleanups["room-cleanup"] = timer
	cp.cleanupMu.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/control/operator_status", nil)
	rec := httptest.NewRecorder()
	cp.HandleOperatorStatus(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", rec.Code)
	}

	var body operatorStatusResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode operator status: %v", err)
	}
	if body.Counts.RegisteredSFUs != 1 || body.Counts.ActiveSFUs != 1 {
		t.Fatalf("sfu counts = %+v, want one registered and active", body.Counts)
	}
	if body.Counts.RoomsByState[models.RoomFailed] != 1 {
		t.Fatalf("failed room count = %d, want 1", body.Counts.RoomsByState[models.RoomFailed])
	}
	if body.Counts.WorkersByState[models.WorkerFailed] != 1 {
		t.Fatalf("failed worker count = %d, want 1", body.Counts.WorkersByState[models.WorkerFailed])
	}
	if len(body.ProvisioningFailures) != 2 {
		t.Fatalf("failures = %+v, want room and worker failure", body.ProvisioningFailures)
	}
	if len(body.PendingCleanupRooms) != 1 || body.PendingCleanupRooms[0] != "room-cleanup" {
		t.Fatalf("pending cleanup rooms = %+v, want room-cleanup", body.PendingCleanupRooms)
	}
}
