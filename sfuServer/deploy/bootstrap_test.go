package bootstrap

import (
	"strings"
	"testing"
)

func TestWorkerConfigValidate(t *testing.T) {
	valid := WorkerConfig{
		ImageTag:        "sha-abc123",
		ControlPlaneURL: "https://sfu.example.com",
		ICERelayOnly:    true,
		TURNServer:      "turn:turn.example.com:3478",
		TURNUsername:    "user",
		TURNPassword:    "secret",
		ICEUDPPortMin:   "50000",
		ICEUDPPortMax:   "50100",
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid config rejected: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*WorkerConfig)
	}{
		{"missing image tag", func(c *WorkerConfig) { c.ImageTag = "" }},
		{"mutable image tag", func(c *WorkerConfig) { c.ImageTag = "latest" }},
		{"missing control-plane URL", func(c *WorkerConfig) { c.ControlPlaneURL = "" }},
		{"partial registry credentials", func(c *WorkerConfig) { c.RegistryUser = "user" }},
		{"missing TURN password", func(c *WorkerConfig) { c.TURNPassword = "" }},
		{"backend URL without webhook secret", func(c *WorkerConfig) { c.BackendURL = "https://api.example.com" }},
		{"webhook secret without backend URL", func(c *WorkerConfig) { c.WebhookSecret = "webhook-secret" }},
		{"recorder without recording secret", func(c *WorkerConfig) {
			c.RecorderImageTag, c.BackendURL, c.WebhookSecret = "sha-abc123", "https://api.example.com", "w"
		}},
		{"recorder without backend URL", func(c *WorkerConfig) { c.RecorderImageTag, c.RecordingSecret = "sha-abc123", "r" }},
		{"mutable recorder tag", func(c *WorkerConfig) {
			c.RecorderImageTag, c.RecordingSecret, c.BackendURL, c.WebhookSecret = "latest", "r", "https://api.example.com", "w"
		}},
		{"invalid recorder port", func(c *WorkerConfig) {
			c.RecorderImageTag, c.RecordingSecret, c.BackendURL, c.WebhookSecret = "sha-abc123", "r", "https://api.example.com", "w"
			c.RecorderPort = "http"
		}},
		{"recording secret without recorder", func(c *WorkerConfig) { c.RecordingSecret = "r" }},
		{"partial ICE UDP range", func(c *WorkerConfig) { c.ICEUDPPortMax = "" }},
		{"reversed ICE UDP range", func(c *WorkerConfig) { c.ICEUDPPortMin = "50101" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := valid
			tt.mutate(&cfg)
			if err := cfg.Validate(); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestWorkerConfigRender(t *testing.T) {
	cfg := WorkerConfig{
		ImageTag:        "sha-abc123",
		ControlPlaneURL: "https://sfu.example.com",
		RegistryUser:    "registry-user",
		RegistryPass:    "pa'ss; echo unsafe",
		ICERelayOnly:    true,
		STUNServers:     "stun:stun.example.com:3478",
		TURNServer:      "turn:turn.example.com:3478",
		TURNUsername:    "turn-user",
		TURNPassword:    "turn-secret",
		ICEUDPPortMin:   "50000",
		ICEUDPPortMax:   "50100",
		BackendURL:      "https://api.example.com",
		WebhookSecret:   "webhook-secret",
	}

	rendered := cfg.Render("sfu-123", "room-456")
	wants := []string{
		"export SFU_ID='sfu-123'",
		"export ROOM_ID='room-456'",
		"export SFU_IMAGE_TAG='sha-abc123'",
		"export CONTROL_PLANE_URL='https://sfu.example.com'",
		"export SFU_REGISTRY_PASSWORD='pa'\"'\"'ss; echo unsafe'",
		"docker run",
		"-e TURN_PASSWORD=\"${TURN_PASSWORD:-}\"",
		"export ICE_UDP_PORT_MIN='50000'",
		"export ICE_UDP_PORT_MAX='50100'",
		"-e ICE_UDP_PORT_MIN=\"${ICE_UDP_PORT_MIN:-}\"",
		"export BACKEND_URL='https://api.example.com'",
		"export SFU_WEBHOOK_SECRET='webhook-secret'",
		"-e SFU_WEBHOOK_SECRET=\"${SFU_WEBHOOK_SECRET:-}\"",
		"conf?format=json",
		".public_ips_v4[0].address // .public_ip.address // empty",
	}
	for _, want := range wants {
		if !strings.Contains(rendered, want) {
			t.Errorf("rendered user-data missing %q", want)
		}
	}
	if strings.Count(rendered, "#!/usr/bin/env bash") != 1 {
		t.Fatalf("rendered user-data must contain exactly one shebang")
	}
	if strings.Contains(rendered, `$1 == "PUBLIC_IP"`) {
		t.Fatal("rendered user-data must not parse the legacy PUBLIC_IP table")
	}
}

func TestWorkerConfigRenderRecorder(t *testing.T) {
	cfg := WorkerConfig{
		ImageTag:         "sha-abc123",
		ControlPlaneURL:  "https://sfu.example.com",
		BackendURL:       "https://api.example.com",
		WebhookSecret:    "webhook-secret",
		RecorderImageTag: "sha-def456",
		RecordingSecret:  "recording-secret",
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("valid recorder config rejected: %v", err)
	}
	rendered := cfg.Render("sfu-123", "room-456")
	for _, want := range []string{
		"export RECORDER_IMAGE_TAG='sha-def456'",
		"export RECORDING_SHARED_SECRET='recording-secret'",
		"export RECORDER_PORT='8083'",
		`RECORDER_IMAGE="${REGISTRY}/live-recorder:${RECORDER_IMAGE_TAG}"`,
		`-e RECORDER_SFU_URL="http://127.0.0.1:${SFU_PORT}"`,
		`-e BACKEND_PUBLIC_URL="$BACKEND_URL"`,
	} {
		if !strings.Contains(rendered, want) {
			t.Errorf("rendered user-data missing %q", want)
		}
	}
}

func TestWorkerConfigRenderWithoutRecorder(t *testing.T) {
	rendered := WorkerConfig{ImageTag: "sha-abc123", ControlPlaneURL: "https://sfu.example.com"}.Render("s", "r")
	if !strings.Contains(rendered, "export RECORDER_IMAGE_TAG=''") {
		t.Fatal("without a recorder tag the bootstrap must skip the recorder container")
	}
}
