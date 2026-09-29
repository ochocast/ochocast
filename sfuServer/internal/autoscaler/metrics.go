package autoscaler

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"whip-server/internal/models"
)

// WorkerRuntime is the current runtime of one non-terminal worker. Labels are
// intentionally limited to the bounded live-worker set to avoid unbounded
// Prometheus cardinality from historical workers.
type WorkerRuntime struct {
	SFUID   string
	State   models.WorkerState
	Seconds float64
}

// MetricsSnapshot is a testable, provider-neutral view of autoscaler SLIs.
type MetricsSnapshot struct {
	ActiveWorkers               int
	RoomReadinessFailures       uint64
	OrphanCleanups              uint64
	ProvisioningDurationCount   uint64
	ProvisioningDurationSeconds float64
	TerminatedRuntimeCount      uint64
	TerminatedRuntimeSeconds    float64
	CurrentWorkerRuntime        []WorkerRuntime
}

// MetricsSnapshot returns autoscaler metrics. Durable lifecycle metrics are
// reconstructed from the store so a control-plane restart does not erase
// provisioning and terminated-runtime observations.
func (p *Provisioner) MetricsSnapshot() MetricsSnapshot {
	now := p.now()
	snapshot := MetricsSnapshot{
		RoomReadinessFailures: p.readinessFailures.Load(),
		OrphanCleanups:        p.orphanCleanups.Load(),
	}
	for _, worker := range p.store.ListWorkers() {
		if worker.ReadyAt != nil && !worker.CreatedAt.IsZero() && !worker.ReadyAt.Before(worker.CreatedAt) {
			snapshot.ProvisioningDurationCount++
			snapshot.ProvisioningDurationSeconds += worker.ReadyAt.Sub(worker.CreatedAt).Seconds()
		}

		if worker.State == models.WorkerTerminated || worker.State == models.WorkerFailed {
			if worker.TerminatedAt != nil && !worker.CreatedAt.IsZero() && !worker.TerminatedAt.Before(worker.CreatedAt) {
				snapshot.TerminatedRuntimeCount++
				snapshot.TerminatedRuntimeSeconds += worker.TerminatedAt.Sub(worker.CreatedAt).Seconds()
			}
			continue
		}

		snapshot.ActiveWorkers++
		if !worker.CreatedAt.IsZero() && !now.Before(worker.CreatedAt) {
			snapshot.CurrentWorkerRuntime = append(snapshot.CurrentWorkerRuntime, WorkerRuntime{
				SFUID:   worker.SFUID,
				State:   worker.State,
				Seconds: now.Sub(worker.CreatedAt).Seconds(),
			})
		}
	}
	sort.Slice(snapshot.CurrentWorkerRuntime, func(i, j int) bool {
		return snapshot.CurrentWorkerRuntime[i].SFUID < snapshot.CurrentWorkerRuntime[j].SFUID
	})
	return snapshot
}

// MetricsHandler exposes Prometheus text-format metrics without adding a
// runtime dependency to the control-plane image.
func (p *Provisioner) MetricsHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		_, _ = fmt.Fprint(w, renderPrometheus(p.MetricsSnapshot()))
	})
}

func renderPrometheus(m MetricsSnapshot) string {
	var b strings.Builder
	metric(&b, "ochocast_sfu_active_workers", "gauge", "Current number of non-terminal autoscaled SFU workers.", float64(m.ActiveWorkers))
	metric(&b, "ochocast_sfu_room_readiness_failures_total", "counter", "Room provisioning attempts that failed to obtain ready autoscaled SFU capacity.", float64(m.RoomReadinessFailures))
	metric(&b, "ochocast_sfu_orphan_cleanup_total", "counter", "Tagged orphan SFU resources deleted by reconciliation.", float64(m.OrphanCleanups))
	metric(&b, "ochocast_sfu_provisioning_duration_seconds_sum", "gauge", "Cumulative cold-start duration for workers that reached ready.", m.ProvisioningDurationSeconds)
	metric(&b, "ochocast_sfu_provisioning_duration_seconds_count", "gauge", "Workers that reached ready and contributed a provisioning duration.", float64(m.ProvisioningDurationCount))
	metric(&b, "ochocast_sfu_terminated_worker_runtime_seconds_sum", "gauge", "Cumulative runtime of terminated autoscaled SFU workers.", m.TerminatedRuntimeSeconds)
	metric(&b, "ochocast_sfu_terminated_worker_runtime_seconds_count", "gauge", "Terminated workers that contributed a runtime observation.", float64(m.TerminatedRuntimeCount))
	for _, worker := range m.CurrentWorkerRuntime {
		fmt.Fprintf(&b, "ochocast_sfu_worker_runtime_seconds{sfu_id=%q,state=%q} %s\n", worker.SFUID, worker.State, number(worker.Seconds))
	}
	return b.String()
}

func metric(b *strings.Builder, name, metricType, help string, value float64) {
	fmt.Fprintf(b, "# HELP %s %s\n# TYPE %s %s\n%s %s\n", name, help, name, metricType, name, number(value))
}

func number(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}
