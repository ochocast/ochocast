package provider

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// Fake is an in-memory Provider for tests. It records created workers, lets a
// test flip their state (to simulate boot progress), and errors on unknown ids —
// enough to exercise the autoscaler's create/read/tag/delete paths without any
// cloud calls. Used by tasks 4.2–4.5 and the 8.2 integration tests.
type Fake struct {
	mu       sync.Mutex
	seq      int
	workers  map[string]Worker
	FailNext error // if set, the next CreateWorker returns it (and clears it)
}

// NewFake returns an empty fake provider.
func NewFake() *Fake { return &Fake{workers: make(map[string]Worker)} }

func (f *Fake) Name() string { return "fake" }

func (f *Fake) CreateWorker(_ context.Context, spec WorkerSpec) (Worker, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.FailNext != nil {
		err := f.FailNext
		f.FailNext = nil
		return Worker{}, err
	}
	f.seq++
	id := fmt.Sprintf("fake-%d", f.seq)
	w := Worker{
		ProviderResourceID: id,
		State:              "starting",
		Tags:               spec.Tags,
		CreatedAt:          time.Now(),
		Metadata:           map[string]string{"name": spec.Name},
	}
	f.workers[id] = w
	return w, nil
}

func (f *Fake) GetWorker(_ context.Context, id string) (Worker, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	w, ok := f.workers[id]
	if !ok {
		return Worker{}, fmt.Errorf("fake: no worker %s", id)
	}
	return w, nil
}

func (f *Fake) ListWorkers(_ context.Context, tag string) ([]Worker, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []Worker
	for _, w := range f.workers {
		for _, t := range w.Tags {
			if t == tag {
				out = append(out, w)
				break
			}
		}
	}
	return out, nil
}

func (f *Fake) TagWorker(_ context.Context, id string, tags []string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	w, ok := f.workers[id]
	if !ok {
		return fmt.Errorf("fake: no worker %s", id)
	}
	w.Tags = tags
	f.workers[id] = w
	return nil
}

func (f *Fake) DeleteWorker(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.workers[id]; !ok {
		return fmt.Errorf("fake: no worker %s", id)
	}
	delete(f.workers, id)
	return nil
}

// SetState lets a test move a fake worker to a new state (e.g. "running") or set
// its public IP, simulating boot progress. Returns false for an unknown id.
func (f *Fake) SetState(id, state, publicIP string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	w, ok := f.workers[id]
	if !ok {
		return false
	}
	if state != "" {
		w.State = state
	}
	if publicIP != "" {
		w.PublicIP = publicIP
	}
	f.workers[id] = w
	return true
}

// Count returns how many workers currently exist in the fake.
func (f *Fake) Count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.workers)
}
