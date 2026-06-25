package lifecycle

import (
	"path/filepath"
	"testing"

	"whip-server/internal/models"
)

func TestCanTransition(t *testing.T) {
	cases := []struct {
		from, to models.RoomState
		ok       bool
	}{
		{models.RoomProvisioning, models.RoomReady, true},
		{models.RoomProvisioning, models.RoomFailed, true},
		{models.RoomReady, models.RoomDraining, true},
		{models.RoomDraining, models.RoomTerminated, true},
		{models.RoomFailed, models.RoomProvisioning, true}, // retry
		{models.RoomReady, models.RoomReady, true},         // idempotent
		{models.RoomTerminated, models.RoomReady, false},   // terminal
		{models.RoomProvisioning, models.RoomDraining, false},
		{models.RoomReady, models.RoomProvisioning, false},
	}
	for _, c := range cases {
		if got := CanTransition(c.from, c.to); got != c.ok {
			t.Errorf("CanTransition(%s, %s) = %v, want %v", c.from, c.to, got, c.ok)
		}
	}
}

func TestStorePersistAndReload(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rooms.json")

	s, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Upsert("room-1", models.RoomProvisioning, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Upsert("room-1", models.RoomReady, ""); err != nil {
		t.Fatalf("valid transition rejected: %v", err)
	}

	// Invalid transition must be rejected and not change persisted state.
	if _, err := s.Upsert("room-1", models.RoomProvisioning, ""); err == nil {
		t.Fatal("expected invalid transition ready -> provisioning to be rejected")
	}

	// Reopen from disk: state must survive a "restart".
	s2, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	rl, ok := s2.Get("room-1")
	if !ok {
		t.Fatal("room-1 not recovered from disk")
	}
	if rl.State != models.RoomReady {
		t.Fatalf("recovered state = %s, want ready", rl.State)
	}
	if rl.CreatedAt.IsZero() || rl.UpdatedAt.Before(rl.CreatedAt) {
		t.Fatalf("timestamps wrong: created=%v updated=%v", rl.CreatedAt, rl.UpdatedAt)
	}
}

func TestStoreTerminatedIDReuse(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rooms.json")
	s, err := New(path)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := s.Upsert("room-1", models.RoomReady, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Upsert("room-1", models.RoomDraining, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Upsert("room-1", models.RoomTerminated, ""); err != nil {
		t.Fatal(err)
	}

	// Reusing a terminated room's ID must start a fresh lifecycle, not be
	// rejected as an invalid terminated -> ready transition.
	rl, err := s.Upsert("room-1", models.RoomReady, "")
	if err != nil {
		t.Fatalf("terminated ID reuse rejected: %v", err)
	}
	if rl.State != models.RoomReady {
		t.Fatalf("state after reuse = %s, want ready", rl.State)
	}
}

func TestWorkerLifecycleAndReload(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rooms.json")
	s, err := New(path)
	if err != nil {
		t.Fatal(err)
	}

	w := models.WorkerRecord{
		SFUID:          "sfu-1",
		InstanceID:     "scw-instance-abc",
		State:          models.WorkerProvisioning,
		RoomID:         "room-1",
		PublicEndpoint: "https://1.2.3.4:8080",
		ImageTag:       "sfu:1.2.3",
	}
	if _, err := s.UpsertWorker(w); err != nil {
		t.Fatal(err)
	}

	// Walk a valid path; capture CreatedAt to assert it is preserved.
	created, _ := s.GetWorker("sfu-1")
	w.State = models.WorkerRegistered
	if _, err := s.UpsertWorker(w); err != nil {
		t.Fatalf("provisioning -> registered rejected: %v", err)
	}
	w.State = models.WorkerReady
	if _, err := s.UpsertWorker(w); err != nil {
		t.Fatal(err)
	}

	// Invalid transition must be rejected.
	bad := w
	bad.State = models.WorkerProvisioning
	if _, err := s.UpsertWorker(bad); err == nil {
		t.Fatal("expected ready -> provisioning to be rejected")
	}

	// Terminate: TerminatedAt must be stamped.
	w.State = models.WorkerTerminated
	term, err := s.UpsertWorker(w)
	if err != nil {
		t.Fatal(err)
	}
	if term.TerminatedAt == nil {
		t.Fatal("TerminatedAt not set on termination")
	}
	if !term.CreatedAt.Equal(created.CreatedAt) {
		t.Fatalf("CreatedAt not preserved: %v vs %v", term.CreatedAt, created.CreatedAt)
	}

	// Survives a restart, with all fields intact.
	s2, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	got, ok := s2.GetWorker("sfu-1")
	if !ok {
		t.Fatal("worker not recovered from disk")
	}
	if got.InstanceID != "scw-instance-abc" || got.ImageTag != "sfu:1.2.3" || got.State != models.WorkerTerminated {
		t.Fatalf("recovered worker fields wrong: %+v", got)
	}

	if _, err := s2.UpsertWorker(models.WorkerRecord{State: models.WorkerProvisioning}); err == nil {
		t.Fatal("expected empty sfu_id to be rejected")
	}
}
