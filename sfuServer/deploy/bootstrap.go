package bootstrap

import (
	_ "embed"
	"fmt"
	"strconv"
	"strings"
)

const defaultRegistry = "rg.fr-par.scw.cloud/sfu-server"

//go:embed scaleway-worker-bootstrap.sh
var workerBootstrapScript string

// WorkerConfig contains the values injected into a newly created SFU worker.
// Sensitive values are read by the control-plane from its Kubernetes Secret
// and are only copied into the cloud-init payload for the worker being created.
type WorkerConfig struct {
	ImageTag        string
	ControlPlaneURL string
	Registry        string
	RegistryUser    string
	RegistryPass    string
	SFUPort         string
	ICERelayOnly    bool
	EnableICETCP    bool
	ICEUDPPortMin   string
	ICEUDPPortMax   string
	STUNServers     string
	TURNServer      string
	TURNUsername    string
	TURNPassword    string
	// US-5: the worker notifies the backend when a live starts or stops, so
	// armed tracks are recorded automatically.
	BackendURL    string
	WebhookSecret string
	// The liveRecorder runs on the same worker, next to the SFU, so it lives
	// and dies with the live (immutable tag of <registry>/live-recorder).
	// Empty disables it.
	RecorderImageTag string
	RecordingSecret  string
	RecorderPort     string
}

// DefaultRecorderPort is the liveRecorder port on a worker when none is set.
const DefaultRecorderPort = "8083"

// RecorderPortOrDefault returns the configured recorder port.
func (c WorkerConfig) RecorderPortOrDefault() string {
	if c.RecorderPort == "" {
		return DefaultRecorderPort
	}
	return c.RecorderPort
}

// Validate fails closed before the autoscaler is enabled. This prevents it
// from creating an Instance that cannot bootstrap and would only be reaped
// after the startup timeout.
func (c WorkerConfig) Validate() error {
	if c.ImageTag == "" {
		return fmt.Errorf("SFU_IMAGE_TAG must be set")
	}
	if c.ImageTag == "latest" {
		return fmt.Errorf("SFU_IMAGE_TAG must be immutable, got latest")
	}
	if c.ControlPlaneURL == "" {
		return fmt.Errorf("SFU_CONTROL_PLANE_URL must be set")
	}
	if (c.RegistryUser == "") != (c.RegistryPass == "") {
		return fmt.Errorf("SFU_REGISTRY_USERNAME and SFU_REGISTRY_PASSWORD must be set together")
	}
	if c.ICERelayOnly {
		if c.TURNServer == "" || c.TURNUsername == "" || c.TURNPassword == "" {
			return fmt.Errorf("TURN_SERVER, TURN_USERNAME and TURN_PASSWORD are required when ICE_RELAY_ONLY=true")
		}
	}
	if (c.BackendURL == "") != (c.WebhookSecret == "") {
		return fmt.Errorf("BACKEND_URL and SFU_WEBHOOK_SECRET must be set together")
	}
	if c.RecorderImageTag != "" {
		if c.RecorderImageTag == "latest" {
			return fmt.Errorf("SFU_RECORDER_IMAGE_TAG must be immutable, got latest")
		}
		if c.RecordingSecret == "" || c.BackendURL == "" {
			return fmt.Errorf("SFU_RECORDER_IMAGE_TAG requires RECORDING_SHARED_SECRET and BACKEND_URL")
		}
		if port, err := strconv.ParseUint(c.RecorderPortOrDefault(), 10, 16); err != nil || port == 0 {
			return fmt.Errorf("invalid SFU_RECORDER_PORT %q", c.RecorderPort)
		}
	} else if c.RecordingSecret != "" {
		return fmt.Errorf("RECORDING_SHARED_SECRET is set but SFU_RECORDER_IMAGE_TAG is empty")
	}
	if c.ICEUDPPortMin != "" || c.ICEUDPPortMax != "" {
		if c.ICEUDPPortMin == "" || c.ICEUDPPortMax == "" {
			return fmt.Errorf("ICE_UDP_PORT_MIN and ICE_UDP_PORT_MAX must be set together")
		}
		minPort, minErr := strconv.ParseUint(c.ICEUDPPortMin, 10, 16)
		maxPort, maxErr := strconv.ParseUint(c.ICEUDPPortMax, 10, 16)
		if minErr != nil || maxErr != nil || minPort == 0 || maxPort == 0 || maxPort < minPort {
			return fmt.Errorf("invalid ICE UDP port range %q-%q", c.ICEUDPPortMin, c.ICEUDPPortMax)
		}
	}
	return nil
}

// Render returns an executable cloud-init user-data script for one SFU worker.
// Values are single-quoted so credentials and URLs cannot alter the shell
// program. Validate must be called before the renderer is installed.
func (c WorkerConfig) Render(sfuID, roomID string) string {
	registry := c.Registry
	if registry == "" {
		registry = defaultRegistry
	}
	port := c.SFUPort
	if port == "" {
		port = "8090"
	}

	values := []struct {
		name  string
		value string
	}{
		{"SFU_ID", sfuID},
		{"ROOM_ID", roomID},
		{"SFU_IMAGE_TAG", c.ImageTag},
		{"SFU_REGISTRY", registry},
		{"SFU_REGISTRY_USERNAME", c.RegistryUser},
		{"SFU_REGISTRY_PASSWORD", c.RegistryPass},
		{"SFU_PORT", port},
		{"CONTROL_PLANE_URL", c.ControlPlaneURL},
		{"ICE_RELAY_ONLY", fmt.Sprintf("%t", c.ICERelayOnly)},
		{"ENABLE_ICE_TCP", fmt.Sprintf("%t", c.EnableICETCP)},
		{"ICE_UDP_PORT_MIN", c.ICEUDPPortMin},
		{"ICE_UDP_PORT_MAX", c.ICEUDPPortMax},
		{"STUN_SERVERS", c.STUNServers},
		{"TURN_SERVER", c.TURNServer},
		{"TURN_USERNAME", c.TURNUsername},
		{"TURN_PASSWORD", c.TURNPassword},
		{"BACKEND_URL", c.BackendURL},
		{"SFU_WEBHOOK_SECRET", c.WebhookSecret},
		{"RECORDER_IMAGE_TAG", c.RecorderImageTag},
		{"RECORDING_SHARED_SECRET", c.RecordingSecret},
		{"RECORDER_PORT", c.RecorderPortOrDefault()},
	}

	var rendered strings.Builder
	rendered.WriteString("#!/usr/bin/env bash\nset -euo pipefail\n")
	for _, item := range values {
		fmt.Fprintf(&rendered, "export %s=%s\n", item.name, shellQuote(item.value))
	}
	rendered.WriteString("\n")
	// The embedded script has its own shebang; omit it when composing the final
	// user-data so the result remains one valid shell program.
	script := strings.TrimPrefix(workerBootstrapScript, "#!/usr/bin/env bash\n")
	rendered.WriteString(script)
	return rendered.String()
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}
