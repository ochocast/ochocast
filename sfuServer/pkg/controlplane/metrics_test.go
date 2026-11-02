package controlplane

import (
	"strings"
	"testing"

	"whip-server/internal/models"
)

func TestWritePrometheusExposesHeartbeatLoad(t *testing.T) {
	cp := newTestCP(t)
	if err := cp.UpdateMetrics(&models.SFUMetrics{
		SFUID:         "sfu-a",
		ServerURL:     "http://sfu-a:8090",
		CPU:           0.25,
		Memory:        0.5,
		ActiveHosts:   1,
		ActiveViewers: 12,
	}); err != nil {
		t.Fatal(err)
	}

	var b strings.Builder
	cp.WritePrometheus(&b)
	body := b.String()

	for _, want := range []string{
		"ochocast_sfu_registered 1\n",
		`ochocast_sfu_cpu_ratio{sfu_id="sfu-a"} 0.25` + "\n",
		`ochocast_sfu_memory_ratio{sfu_id="sfu-a"} 0.5` + "\n",
		`ochocast_sfu_active_hosts{sfu_id="sfu-a"} 1` + "\n",
		`ochocast_sfu_active_viewers{sfu_id="sfu-a"} 12` + "\n",
		`ochocast_sfu_heartbeat_age_seconds{sfu_id="sfu-a"} `,
		"# TYPE ochocast_sfu_rooms gauge\n",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics missing %q:\n%s", want, body)
		}
	}
}

func TestWritePrometheusSkipsInactiveSFUs(t *testing.T) {
	cp := newTestCP(t)
	if err := cp.UpdateMetrics(&models.SFUMetrics{SFUID: "sfu-gone", CPU: 0.1}); err != nil {
		t.Fatal(err)
	}
	cp.mu.Lock()
	cp.sfus["sfu-gone"].Active = false
	cp.mu.Unlock()

	var b strings.Builder
	cp.WritePrometheus(&b)
	if strings.Contains(b.String(), "sfu-gone") {
		t.Fatalf("inactive SFU must not be exported:\n%s", b.String())
	}
}
