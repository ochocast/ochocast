package autoscaler

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"whip-server/internal/lifecycle"
	"whip-server/internal/models"
	"whip-server/internal/provider"
)

func newTestProvisioner(t *testing.T, prov provider.Provider, max int) (*Provisioner, *lifecycle.Store) {
	t.Helper()
	store, err := lifecycle.New(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	return New(store, prov, Config{MaxWorkers: max, ImageTag: "sfu:1.2.3", Tags: []string{"sfu-worker"}}), store
}

func TestEnsureCapacityCreatesOnce(t *testing.T) {
	ctx := context.Background()
	fake := provider.NewFake()
	p, store := newTestProvisioner(t, fake, 1)

	rec, err := p.EnsureCapacity(ctx, "room-1")
	if err != nil {
		t.Fatal(err)
	}
	if rec.ProviderResourceID == "" || rec.State != models.WorkerProvisioning || rec.Provider != "fake" {
		t.Fatalf("unexpected record: %+v", rec)
	}
	if fake.Count() != 1 {
		t.Fatalf("want 1 instance, got %d", fake.Count())
	}

	// Idempotent retry: same room reuses the worker, no second Instance.
	rec2, err := p.EnsureCapacity(ctx, "room-1")
	if err != nil {
		t.Fatal(err)
	}
	if rec2.SFUID != rec.SFUID || fake.Count() != 1 {
		t.Fatalf("retry created a duplicate: rec2=%s count=%d", rec2.SFUID, fake.Count())
	}
	// Room is in provisioning.
	if rl, _ := store.Get("room-1"); rl.State != models.RoomProvisioning {
		t.Fatalf("room state = %s, want provisioning", rl.State)
	}
}

func TestEnsureCapacityBudgetCap(t *testing.T) {
	ctx := context.Background()
	fake := provider.NewFake()
	p, _ := newTestProvisioner(t, fake, 1)

	if _, err := p.EnsureCapacity(ctx, "room-1"); err != nil {
		t.Fatal(err)
	}
	// Second room would need a second worker but MaxWorkers=1.
	_, err := p.EnsureCapacity(ctx, "room-2")
	if !errors.Is(err, ErrBudgetExceeded) {
		t.Fatalf("want ErrBudgetExceeded, got %v", err)
	}
	if fake.Count() != 1 {
		t.Fatalf("budget cap must not create an Instance: count=%d", fake.Count())
	}
}

func TestEnsureCapacityCreateFailureNoLeak(t *testing.T) {
	ctx := context.Background()
	fake := provider.NewFake()
	fake.FailNext = errors.New("scaleway quota exceeded")
	p, store := newTestProvisioner(t, fake, 1)

	if _, err := p.EnsureCapacity(ctx, "room-1"); err == nil {
		t.Fatal("expected create failure")
	}
	if fake.Count() != 0 {
		t.Fatalf("failed create must not leave an Instance: count=%d", fake.Count())
	}
	// Room and worker are marked failed (record kept for reconciliation).
	if rl, _ := store.Get("room-1"); rl.State != models.RoomFailed {
		t.Fatalf("room state = %s, want failed", rl.State)
	}
	workers := store.ListWorkers()
	if len(workers) != 1 || workers[0].State != models.WorkerFailed {
		t.Fatalf("want one failed worker record, got %+v", workers)
	}

	// A failed worker does not count against budget: a retry can provision afresh.
	if _, err := p.EnsureCapacity(ctx, "room-1"); err != nil {
		t.Fatalf("retry after failure rejected: %v", err)
	}
	if fake.Count() != 1 {
		t.Fatalf("retry should create an Instance: count=%d", fake.Count())
	}
}

func TestReapStartupTimeouts(t *testing.T) {
	ctx := context.Background()
	fake := provider.NewFake()
	p, store := newTestProvisioner(t, fake, 1)

	rec, err := p.EnsureCapacity(ctx, "room-1")
	if err != nil {
		t.Fatal(err)
	}

	// Before the deadline: nothing reaped.
	if n := p.ReapStartupTimeouts(ctx); n != 0 {
		t.Fatalf("reaped %d before timeout, want 0", n)
	}
	if fake.Count() != 1 {
		t.Fatalf("worker destroyed too early: count=%d", fake.Count())
	}

	// Advance the clock past the startup timeout: worker is failed and destroyed.
	p.now = func() time.Time { return time.Now().Add(defaultStartupTimeout + time.Minute) }
	if n := p.ReapStartupTimeouts(ctx); n != 1 {
		t.Fatalf("reaped %d after timeout, want 1", n)
	}
	if fake.Count() != 0 {
		t.Fatalf("timed-out Instance not destroyed: count=%d", fake.Count())
	}
	w, _ := store.GetWorker(rec.SFUID)
	if w.State != models.WorkerFailed || w.Reason != "startup timeout" {
		t.Fatalf("worker not marked failed: %+v", w)
	}
	if rl, _ := store.Get("room-1"); rl.State != models.RoomFailed {
		t.Fatalf("room state = %s, want failed", rl.State)
	}

	// A ready worker is never reaped. Walk the real readiness path
	// provisioning -> registered -> ready (a direct jump is not a valid move).
	ready, _ := p.EnsureCapacity(ctx, "room-2") // budget freed by the failure above
	for _, st := range []models.WorkerState{models.WorkerRegistered, models.WorkerReady} {
		ready.State = st
		if _, err := store.UpsertWorker(ready); err != nil {
			t.Fatal(err)
		}
	}
	if n := p.ReapStartupTimeouts(ctx); n != 0 {
		t.Fatalf("reaped a ready worker: %d", n)
	}
}

func TestEnsureCapacityReprovisionsAfterTerminate(t *testing.T) {
	ctx := context.Background()
	fake := provider.NewFake()
	p, store := newTestProvisioner(t, fake, 1)

	rec, err := p.EnsureCapacity(ctx, "room-1")
	if err != nil {
		t.Fatal(err)
	}
	// Terminate the worker: destroy the Instance and mark the record terminated
	// (as the destroy path will). This frees budget and the room's assignment.
	if err := fake.DeleteWorker(ctx, rec.ProviderResourceID); err != nil {
		t.Fatal(err)
	}
	rec.State = models.WorkerTerminated
	if _, err := store.UpsertWorker(rec); err != nil {
		t.Fatal(err)
	}

	rec2, err := p.EnsureCapacity(ctx, "room-1")
	if err != nil {
		t.Fatalf("re-provision after terminate rejected: %v", err)
	}
	if rec2.SFUID == rec.SFUID {
		t.Fatal("expected a fresh worker after termination")
	}
	if fake.Count() != 1 {
		t.Fatalf("want 1 live instance, got %d", fake.Count())
	}
}
