package controlplane

import (
	"fmt"
	"io"
	"sort"
	"strconv"
	"time"
)

type sfuLoadSample struct {
	id           string
	cpu          float64
	memory       float64
	hosts        int
	viewers      int
	heartbeatAge float64
}

// WritePrometheus writes the load each SFU reports in its heartbeats, in
// Prometheus text format. Only active SFUs get a series, so the sfu_id label
// stays bounded by the worker budget.
func (cp *ControlPlane) WritePrometheus(w io.Writer) {
	now := time.Now()

	cp.mu.RLock()
	rooms := len(cp.rooms)
	samples := make([]sfuLoadSample, 0, len(cp.sfus))
	for _, sfu := range cp.sfus {
		if !sfu.Active || sfu.Metrics == nil {
			continue
		}
		samples = append(samples, sfuLoadSample{
			id:           sfu.ID,
			cpu:          sfu.Metrics.CPU,
			memory:       sfu.Metrics.Memory,
			hosts:        sfu.Metrics.ActiveHosts,
			viewers:      sfu.Metrics.ActiveViewers,
			heartbeatAge: now.Sub(sfu.LastHeartbeat).Seconds(),
		})
	}
	cp.mu.RUnlock()

	sort.Slice(samples, func(i, j int) bool { return samples[i].id < samples[j].id })

	fmt.Fprintf(w, "# HELP ochocast_sfu_rooms Rooms with a topology on the control-plane.\n# TYPE ochocast_sfu_rooms gauge\nochocast_sfu_rooms %d\n", rooms)
	fmt.Fprintf(w, "# HELP ochocast_sfu_registered Active SFUs that reported at least one heartbeat.\n# TYPE ochocast_sfu_registered gauge\nochocast_sfu_registered %d\n", len(samples))

	gauge := func(name, help string, value func(sfuLoadSample) float64) {
		fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s gauge\n", name, help, name)
		for _, s := range samples {
			fmt.Fprintf(w, "%s{sfu_id=%q} %s\n", name, s.id, strconv.FormatFloat(value(s), 'f', -1, 64))
		}
	}
	gauge("ochocast_sfu_cpu_ratio", "CPU usage reported by the SFU, between 0 and 1.",
		func(s sfuLoadSample) float64 { return s.cpu })
	gauge("ochocast_sfu_memory_ratio", "Memory usage reported by the SFU, between 0 and 1.",
		func(s sfuLoadSample) float64 { return s.memory })
	gauge("ochocast_sfu_active_hosts", "Publishing hosts connected to the SFU.",
		func(s sfuLoadSample) float64 { return float64(s.hosts) })
	gauge("ochocast_sfu_active_viewers", "Viewers connected to the SFU.",
		func(s sfuLoadSample) float64 { return float64(s.viewers) })
	gauge("ochocast_sfu_heartbeat_age_seconds", "Seconds since the SFU's last heartbeat.",
		func(s sfuLoadSample) float64 { return s.heartbeatAge })
}
