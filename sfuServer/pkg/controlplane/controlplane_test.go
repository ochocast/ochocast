package controlplane

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"whip-server/internal/models"
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
