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
	"log"
	"sync"
	"time"

	"whip-server/internal/lifecycle"
	"whip-server/internal/models"
	"whip-server/internal/provider"
)

// ErrBudgetExceeded is returned when EnsureCapacity would exceed MaxWorkers. The
// control-plane surfaces it as a controlled provisioning failure (tasks 5.1/6.3)
// rather than creating an unbounded number of Instances.
var ErrBudgetExceeded = errors.New("autoscaler: worker budget exceeded")

// defaultStartupTimeout is the first-stage budget guardrail (design.md:109): a
// worker that has not become ready within this window is failed and destroyed.
const defaultStartupTimeout = 8 * time.Minute

// defaultOrphanMaxAge is how old a tagged-but-untracked resource must be before
// orphan cleanup deletes it (design.md:109).
const defaultOrphanMaxAge = 2 * time.Hour

// Config configures a Provisioner.
type Config struct {
	// MaxWorkers caps the number of live (non-terminal) workers per environment.
	// Defaults to 1 — the first-stage budget guardrail (design.md:109).
	MaxWorkers int
	// StartupTimeout is how long a worker may stay in a starting state before it
	// is failed and destroyed. Defaults to 8 minutes (design.md:109).
	StartupTimeout time.Duration
	// OrphanMaxAge is how old an untracked-but-tagged cloud resource must be
	// before orphan cleanup deletes it. The grace avoids destroying a newborn
	// worker whose record has not been persisted yet. Defaults to 2h
	// (design.md:109).
	OrphanMaxAge time.Duration
	// ImageTag is the immutable SFU image tag recorded on each worker.
	ImageTag string
	// Tags are billing/cleanup tags applied to every created cloud resource.
	Tags []string
	// ManagedTag identifies resources this control-plane owns. It is applied to
	// every created worker and is the filter reconciliation lists by. Defaults to
	// "sfu-worker". Untagged resources are never touched (task 4.5).
	ManagedTag string
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

	// mu serializes EnsureCapacity and timeout reaping so the check-then-mutate
	// sequences are atomic across the store and the provider.
	// ponytail: one global lock; go per-room locks only if throughput demands it.
	mu sync.Mutex

	// now is the clock, overridable in tests.
	now func() time.Time
}

// New builds a Provisioner. MaxWorkers < 1 is clamped to 1 and an unset
// StartupTimeout defaults to 8 minutes.
func New(store *lifecycle.Store, prov provider.Provider, cfg Config) *Provisioner {
	if cfg.MaxWorkers < 1 {
		cfg.MaxWorkers = 1
	}
	if cfg.StartupTimeout <= 0 {
		cfg.StartupTimeout = defaultStartupTimeout
	}
	if cfg.OrphanMaxAge <= 0 {
		cfg.OrphanMaxAge = defaultOrphanMaxAge
	}
	if cfg.ManagedTag == "" {
		cfg.ManagedTag = "sfu-worker"
	}
	// The managed tag must be on every created resource so reconciliation can
	// find them; add it to the applied tag set if the caller left it out.
	if !contains(cfg.Tags, cfg.ManagedTag) {
		cfg.Tags = append(cfg.Tags, cfg.ManagedTag)
	}
	return &Provisioner{store: store, prov: prov, cfg: cfg, now: time.Now}
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

// Drain marks a worker as draining so it stops receiving new room assignments
// while it keeps serving its current room (task 5.5). It is the scale-down entry
// point; the worker is destroyed later once idle. Errors if the worker is
// unknown or not in a drainable state.
func (p *Provisioner) Drain(sfuID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	rec, ok := p.store.GetWorker(sfuID)
	if !ok {
		return fmt.Errorf("autoscaler: no worker %s to drain", sfuID)
	}
	rec.State = models.WorkerDraining
	rec.Reason = "scale-down"
	if _, err := p.store.UpsertWorker(rec); err != nil {
		return fmt.Errorf("autoscaler: drain worker %s: %w", sfuID, err)
	}
	return nil
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

// isStarting reports whether a worker is still in a pre-ready state and thus
// subject to the startup deadline.
func isStarting(s models.WorkerState) bool {
	return s == models.WorkerProvisioning || s == models.WorkerRegistered
}

// ReapStartupTimeouts fails and destroys every worker that has stayed in a
// starting state past StartupTimeout. Destroying the Instance releases its
// billable resources; the record is kept (as failed) so reconciliation can
// confirm the cloud resource is gone. Returns the number reaped. Best-effort:
// a provider delete error is logged, not fatal — orphan cleanup (4.5) is the
// backstop.
func (p *Provisioner) ReapStartupTimeouts(ctx context.Context) int {
	p.mu.Lock()
	defer p.mu.Unlock()

	reaped := 0
	for _, w := range p.store.ListWorkers() {
		if !isStarting(w.State) || p.now().Sub(w.CreatedAt) <= p.cfg.StartupTimeout {
			continue
		}
		if w.ProviderResourceID != "" {
			if err := p.prov.DeleteWorker(ctx, w.ProviderResourceID); err != nil {
				log.Printf("[autoscaler] destroy timed-out worker %s: %v", w.SFUID, err)
			}
		}
		w.State = models.WorkerFailed
		w.Reason = "startup timeout"
		if _, err := p.store.UpsertWorker(w); err != nil {
			log.Printf("[autoscaler] mark worker %s failed: %v", w.SFUID, err)
			continue
		}
		if w.RoomID != "" {
			_, _ = p.store.Upsert(w.RoomID, models.RoomFailed, "sfu startup timeout")
		}
		reaped++
	}
	return reaped
}

// Run reaps startup timeouts on a ticker until ctx is cancelled. The interval is
// a quarter of the startup timeout (floored at 15s) so a stuck worker is caught
// within roughly a quarter-window of its deadline.
func (p *Provisioner) Run(ctx context.Context) {
	interval := p.cfg.StartupTimeout / 4
	if interval < 15*time.Second {
		interval = 15 * time.Second
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			p.ReapStartupTimeouts(ctx)
		}
	}
}

// ReconcileResult reports the drift found between persistent worker records and
// the tagged resources that actually exist in the cloud.
type ReconcileResult struct {
	// Vanished is the number of non-terminal records whose cloud resource no
	// longer exists; each was marked terminated.
	Vanished int
	// Orphans are cloud resources tagged as ours with no matching live record.
	// Reconcile does not delete them — that is orphan cleanup's job (task 4.5).
	Orphans []provider.Worker
}

// Reconcile compares persistent worker records against the cloud resources
// carrying the managed tag and repairs store-side drift after a restart or
// missed event (design.md:116):
//
//   - a live record whose cloud resource is gone is marked terminated;
//   - a tagged cloud resource with no live record is reported as an orphan for
//     cleanup (task 4.5) but never deleted here.
func (p *Provisioner) Reconcile(ctx context.Context) (ReconcileResult, error) {
	cloud, err := p.prov.ListWorkers(ctx, p.cfg.ManagedTag)
	if err != nil {
		return ReconcileResult{}, fmt.Errorf("autoscaler: reconcile list: %w", err)
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	cloudByID := make(map[string]provider.Worker, len(cloud))
	for _, w := range cloud {
		cloudByID[w.ProviderResourceID] = w
	}

	var res ReconcileResult
	trackedIDs := make(map[string]bool)
	for _, rec := range p.store.ListWorkers() {
		if rec.State == models.WorkerTerminated || rec.State == models.WorkerFailed {
			continue
		}
		if rec.ProviderResourceID == "" {
			continue // reserved but never created; startup-timeout reaping handles it
		}
		trackedIDs[rec.ProviderResourceID] = true
		if _, ok := cloudByID[rec.ProviderResourceID]; !ok {
			// Cloud resource vanished under a live record: record the loss.
			rec.State = models.WorkerTerminated
			rec.Reason = "reconcile: cloud resource missing"
			if _, err := p.store.UpsertWorker(rec); err != nil {
				log.Printf("[autoscaler] reconcile mark %s terminated: %v", rec.SFUID, err)
				continue
			}
			res.Vanished++
		}
	}

	for id, w := range cloudByID {
		if !trackedIDs[id] {
			res.Orphans = append(res.Orphans, w)
		}
	}
	return res, nil
}

// CleanupOrphans reconciles, then destroys tagged cloud resources that have no
// live record and are older than OrphanMaxAge. Deletion is doubly guarded: the
// resource must carry the managed tag (untagged resources are never deleted —
// task 4.5) and a resource of unknown age is left alone. Returns the number
// deleted.
func (p *Provisioner) CleanupOrphans(ctx context.Context) (int, error) {
	res, err := p.Reconcile(ctx)
	if err != nil {
		return 0, err
	}
	deleted := 0
	for _, o := range res.Orphans {
		// Safety: only ever delete resources we own and that are old enough.
		if !contains(o.Tags, p.cfg.ManagedTag) {
			continue
		}
		if o.CreatedAt.IsZero() || p.now().Sub(o.CreatedAt) < p.cfg.OrphanMaxAge {
			continue
		}
		if err := p.prov.DeleteWorker(ctx, o.ProviderResourceID); err != nil {
			log.Printf("[autoscaler] delete orphan %s: %v", o.ProviderResourceID, err)
			continue
		}
		deleted++
	}
	return deleted, nil
}

// contains reports whether s is in xs.
func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

// newSFUID returns a short random worker id. The control-plane generates it and
// hands it to the worker via bootstrap so SFU_ID is known before the Instance
// registers back (task 2.3).
func newSFUID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return "sfu-" + hex.EncodeToString(b[:])
}
