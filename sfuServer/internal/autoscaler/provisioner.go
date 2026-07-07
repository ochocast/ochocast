// Package autoscaler holds the provider-neutral WorkerProvisioner that the
// control-plane uses to create on-demand SFU workers. It decides when capacity
// is needed, enforces the budget cap, and drives a provider adapter — without
// knowing which cloud is behind it.
package autoscaler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"

	"whip-server/internal/lifecycle"
	"whip-server/internal/models"
	"whip-server/internal/provider"
)

// ErrBudgetExceeded is returned when EnsureCapacity would exceed MaxWorkers. The
// control-plane surfaces it as a controlled provisioning failure (tasks 5.1/6.3)
// rather than creating an unbounded number of Instances.
var ErrBudgetExceeded = errors.New("autoscaler: worker budget exceeded")

// Config configures a Provisioner.
type Config struct {
	// MaxWorkers caps the number of live (non-terminal) workers per environment.
	// Defaults to 1 — the first-stage budget guardrail (design.md:109).
	MaxWorkers int
	// ImageTag is the immutable SFU image tag recorded on each worker.
	ImageTag string
	// Tags are billing/cleanup tags applied to every created cloud resource.
	Tags []string
	// RenderUserData builds the cloud-init/bootstrap script for a worker from its
	// generated SFU id and room. Optional; nil means no user-data (the provider
	// gets an empty script). The rendered script is where SFU_ID, CONTROL_PLANE_URL
	// and ICE/TURN config are injected (task 2.3).
	RenderUserData func(sfuID, roomID string) string
}

// Provisioner is the provider-neutral WorkerProvisioner. All lifecycle state
// lives in the lifecycle.Store; the cloud is reached only through prov.
type Provisioner struct {
	store *lifecycle.Store
	prov  provider.Provider
	cfg   Config

	// mu serializes EnsureCapacity so the check-cap-then-create sequence is
	// atomic across the store and the provider.
	// ponytail: one global lock; go per-room locks only if throughput demands it.
	mu sync.Mutex
}

// New builds a Provisioner. MaxWorkers < 1 is clamped to 1.
func New(store *lifecycle.Store, prov provider.Provider, cfg Config) *Provisioner {
	if cfg.MaxWorkers < 1 {
		cfg.MaxWorkers = 1
	}
	return &Provisioner{store: store, prov: prov, cfg: cfg}
}

// EnsureCapacity guarantees one SFU worker is being provisioned for roomID and
// returns its record. It is idempotent: a retried call for a room that already
// has a live (provisioning/registered/ready/...) worker returns that worker
// without creating a second Instance. If creating a new worker would exceed the
// budget it returns ErrBudgetExceeded and provisions nothing.
func (p *Provisioner) EnsureCapacity(ctx context.Context, roomID string) (models.WorkerRecord, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	// 1. Idempotency: reuse an existing live worker for this room.
	if w, ok := p.store.WorkerForRoom(roomID); ok {
		return w, nil
	}

	// 2. Budget cap on live workers across the environment.
	if p.liveWorkerCount() >= p.cfg.MaxWorkers {
		return models.WorkerRecord{}, ErrBudgetExceeded
	}

	// 3. Move the room into provisioning (idempotent; safe if already provisioning).
	if _, _, err := p.store.EnsureRoomProvisioning(roomID); err != nil {
		return models.WorkerRecord{}, err
	}

	// 4. Reserve a persistent worker record BEFORE the cloud call, so a crash
	//    mid-create still leaves a record for reconciliation (task 4.4).
	sfuID := newSFUID()
	rec := models.WorkerRecord{
		SFUID:    sfuID,
		Provider: p.prov.Name(),
		State:    models.WorkerProvisioning,
		RoomID:   roomID,
		ImageTag: p.cfg.ImageTag,
	}
	if _, err := p.store.UpsertWorker(rec); err != nil {
		return models.WorkerRecord{}, err
	}

	// 5. Create the Instance.
	spec := provider.WorkerSpec{
		Name:     "sfu-" + sfuID,
		ImageTag: p.cfg.ImageTag,
		Tags:     p.cfg.Tags,
	}
	if p.cfg.RenderUserData != nil {
		spec.UserData = p.cfg.RenderUserData(sfuID, roomID)
	}
	w, err := p.prov.CreateWorker(ctx, spec)
	if err != nil {
		// Mark worker and room failed; the record is kept (not deleted) so
		// reconciliation can confirm no cloud resource leaked.
		rec.State = models.WorkerFailed
		rec.Reason = err.Error()
		_, _ = p.store.UpsertWorker(rec)
		_, _ = p.store.Upsert(roomID, models.RoomFailed, err.Error())
		return models.WorkerRecord{}, fmt.Errorf("autoscaler: create worker for room %s: %w", roomID, err)
	}

	// 6. Record the provider identity. The worker stays in `provisioning` until
	//    readiness checks promote it (task 5.3).
	rec.ProviderResourceID = w.ProviderResourceID
	rec.Metadata = w.Metadata
	if w.PublicIP != "" {
		rec.PublicEndpoint = "http://" + w.PublicIP
	}
	saved, err := p.store.UpsertWorker(rec)
	if err != nil {
		return models.WorkerRecord{}, err
	}
	return saved, nil
}

// liveWorkerCount counts workers that still hold (or could hold) budget: anything
// not terminated and not failed.
func (p *Provisioner) liveWorkerCount() int {
	n := 0
	for _, w := range p.store.ListWorkers() {
		if w.State != models.WorkerTerminated && w.State != models.WorkerFailed {
			n++
		}
	}
	return n
}

// newSFUID returns a short random worker id. The control-plane generates it and
// hands it to the worker via bootstrap so SFU_ID is known before the Instance
// registers back (task 2.3).
func newSFUID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return "sfu-" + hex.EncodeToString(b[:])
}
