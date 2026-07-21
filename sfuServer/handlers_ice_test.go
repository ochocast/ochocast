package main

import (
	"net/http/httptest"
	"testing"

	"github.com/pion/webrtc/v4"
)

func TestAddWHIPICEServerLinkHeaders(t *testing.T) {
	t.Setenv("TURN_SERVER", "turn:turn.example.test:3478?transport=udp,turn:turn.example.test:3478?transport=tcp")
	t.Setenv("TURN_USERNAME", "obs-user")
	t.Setenv("TURN_PASSWORD", "obs-password")

	recorder := httptest.NewRecorder()
	addWHIPICEServerLinkHeaders(recorder)

	got := recorder.Header().Values("Link")
	want := []string{
		`<turn:turn.example.test:3478?transport=udp>; rel="ice-server"; username="obs-user"; credential="obs-password"; credential-type="password"`,
		`<turn:turn.example.test:3478?transport=tcp>; rel="ice-server"; username="obs-user"; credential="obs-password"; credential-type="password"`,
	}
	if len(got) != len(want) {
		t.Fatalf("Link headers = %q, want %q", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("Link header %d = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestAddWHIPICEServerLinkHeadersRequiresCompleteCredentials(t *testing.T) {
	t.Setenv("TURN_SERVER", "turn:turn.example.test:3478")
	t.Setenv("TURN_USERNAME", "obs-user")
	t.Setenv("TURN_PASSWORD", "")

	recorder := httptest.NewRecorder()
	addWHIPICEServerLinkHeaders(recorder)
	if got := recorder.Header().Values("Link"); len(got) != 0 {
		t.Fatalf("Link headers = %q, want none", got)
	}
}

func TestWHIPResourceLocationRoundTrip(t *testing.T) {
	location := whipResourceLocation("room/with spaces", "secret-key")
	roomID, key, ok := parseWHIPResourcePath(location)
	if !ok || roomID != "room/with spaces" || key != "secret-key" {
		t.Fatalf("parseWHIPResourcePath(%q) = room=%q key=%q ok=%v", location, roomID, key, ok)
	}
}

func TestRelayOnlyAllowsPublicIPWithoutHostCandidateRewrite(t *testing.T) {
	t.Setenv("ICE_UDP_PORT_MIN", "")
	t.Setenv("ICE_UDP_PORT_MAX", "")
	api, err := newWebRTCAPI("203.0.113.10", true)
	if err != nil {
		t.Fatalf("create WebRTC API: %v", err)
	}

	answerer, err := api.NewPeerConnection(webrtc.Configuration{
		ICETransportPolicy: webrtc.ICETransportPolicyRelay,
	})
	if err != nil {
		t.Fatalf("create answerer: %v", err)
	}
	defer answerer.Close()

	offerer, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("create offerer: %v", err)
	}
	defer offerer.Close()
	if _, err := offerer.AddTransceiverFromKind(
		webrtc.RTPCodecTypeVideo,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionSendonly},
	); err != nil {
		t.Fatalf("add video transceiver: %v", err)
	}
	offer, err := offerer.CreateOffer(nil)
	if err != nil {
		t.Fatalf("create offer: %v", err)
	}

	if err := answerer.SetRemoteDescription(offer); err != nil {
		t.Fatalf("relay-only answerer rejected a valid offer with PUBLIC_IP set: %v", err)
	}
}

func TestWebRTCAPIRejectsInvalidUDPPortRange(t *testing.T) {
	t.Setenv("ICE_UDP_PORT_MIN", "50100")
	t.Setenv("ICE_UDP_PORT_MAX", "50000")

	if _, err := newWebRTCAPI("203.0.113.10", false); err == nil {
		t.Fatal("expected an invalid ICE UDP port range to be rejected")
	}
}
