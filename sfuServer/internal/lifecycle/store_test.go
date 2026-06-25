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
