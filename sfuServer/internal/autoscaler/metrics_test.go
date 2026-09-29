package autoscaler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"whip-server/internal/models"
	"whip-server/internal/provider"
)

func TestMetricsSnapshotCoversAutoscalerSLIs(t *testing.T) {
	fake := provider.NewFake()
	p, store := newTestProvisioner(t, fake, 1)
	rec, err := p.EnsureCapacity(context.Background(), "room-1")
	if err != nil {
		t.Fatal(err)
	}
	created := rec.CreatedAt
	readyAt := created.Add(12 * time.Second)
	rec.State = models.WorkerRegistered
	if rec, err = store.UpsertWorker(rec); err != nil {
		t.Fatal(err)
	}
	rec.State = models.WorkerReady
	rec.ReadyAt = &readyAt
	if _, err = store.UpsertWorker(rec); err != nil {
		t.Fatal(err)
	}
	p.now = func() time.Time { return created.Add(42 * time.Second) }

	// A rejected second room is a readiness failure and does not create a worker.
	if _, err := p.EnsureCapacity(context.Background(), "room-2"); err == nil {
		t.Fatal("expected budget failure")
	}

	snapshot := p.MetricsSnapshot()
	if snapshot.ActiveWorkers != 1 || snapshot.RoomReadinessFailures != 1 {
		t.Fatalf("unexpected counts: %+v", snapshot)
	}
	if snapshot.ProvisioningDurationCount != 1 || snapshot.ProvisioningDurationSeconds != 12 {
		t.Fatalf("unexpected provisioning duration: %+v", snapshot)
	}
	if len(snapshot.CurrentWorkerRuntime) != 1 || snapshot.CurrentWorkerRuntime[0].Seconds != 42 {
		t.Fatalf("unexpected runtime: %+v", snapshot.CurrentWorkerRuntime)
	}
}

func TestMetricsHandlerRendersPrometheusText(t *testing.T) {
	p, _ := newTestProvisioner(t, provider.NewFake(), 1)
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	res := httptest.NewRecorder()
	p.MetricsHandler().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200", res.Code)
	}
	for _, name := range []string{
		"ochocast_sfu_active_workers",
		"ochocast_sfu_room_readiness_failures_total",
		"ochocast_sfu_orphan_cleanup_total",
		"ochocast_sfu_provisioning_duration_seconds_sum",
		"ochocast_sfu_terminated_worker_runtime_seconds_sum",
	} {
		if !strings.Contains(res.Body.String(), name) {
			t.Errorf("metric %s missing from:\n%s", name, res.Body.String())
		}
	}
}
