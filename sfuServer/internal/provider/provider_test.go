package provider

import (
	"context"
	"errors"
	"testing"
)

// The fake must satisfy the Provider contract; the autoscaler depends only on
// this interface.
var _ Provider = (*Fake)(nil)

func TestFakeLifecycle(t *testing.T) {
	ctx := context.Background()
	f := NewFake()

	w, err := f.CreateWorker(ctx, WorkerSpec{Name: "sfu-room-1", Tags: []string{"sfu-worker"}})
	if err != nil {
		t.Fatal(err)
	}
	if w.ProviderResourceID == "" || w.State != "starting" {
		t.Fatalf("unexpected created worker: %+v", w)
	}

	// Read back and simulate boot progress.
	f.SetState(w.ProviderResourceID, "running", "1.2.3.4")
	got, err := f.GetWorker(ctx, w.ProviderResourceID)
	if err != nil {
		t.Fatal(err)
	}
	if got.State != "running" || got.PublicIP != "1.2.3.4" {
		t.Fatalf("state/IP not observed: %+v", got)
	}

	// Retag.
	if err := f.TagWorker(ctx, w.ProviderResourceID, []string{"sfu-worker", "room:1"}); err != nil {
		t.Fatal(err)
	}
	if got, _ := f.GetWorker(ctx, w.ProviderResourceID); len(got.Tags) != 2 {
		t.Fatalf("tags not applied: %+v", got.Tags)
	}

	// Delete releases the resource.
	if err := f.DeleteWorker(ctx, w.ProviderResourceID); err != nil {
		t.Fatal(err)
	}
	if f.Count() != 0 {
		t.Fatalf("worker not released, count=%d", f.Count())
	}
	if _, err := f.GetWorker(ctx, w.ProviderResourceID); err == nil {
		t.Fatal("expected error reading a deleted worker")
	}
}

func TestFakeCreateFailure(t *testing.T) {
	f := NewFake()
	f.FailNext = errors.New("quota exceeded")
	if _, err := f.CreateWorker(context.Background(), WorkerSpec{}); err == nil {
		t.Fatal("expected injected create failure")
	}
	if f.Count() != 0 {
		t.Fatal("failed create must not leave a worker")
	}
}
