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
