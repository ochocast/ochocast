package main

import (
	"testing"

	"github.com/pion/webrtc/v4"
)

func TestRelayOnlyAllowsPublicIPWithoutHostCandidateRewrite(t *testing.T) {
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
