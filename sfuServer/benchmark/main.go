package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
)

var (
	viewers         int
	hold            time.Duration
	roomID          string
	controlPlaneURL string
)

func init() {
	flag.IntVar(&viewers, "viewers", 10, "Number of simultaneous viewers")
	flag.DurationVar(&hold, "hold", 30*time.Second, "Time each viewer stays connected")
	flag.StringVar(&roomID, "room", "", "Track ID / room_id")
	flag.StringVar(&controlPlaneURL, "cp-url", "https://519ddacd-6411-4de9-886a-a2976087ac84.pub.instances.scw.cloud", "Control Plane URL for SFU discovery")
}

var insecureClient = &http.Client{
	Transport: &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
	},
}

// DiscoverSFU queries the control plane to get the SFU URL for a room
func discoverSFU(controlPlaneURL, roomID string) (string, error) {
	discoveryURL := fmt.Sprintf("%s/viewer?room_id=%s", controlPlaneURL, roomID)

	req, err := http.NewRequest("GET", discoveryURL, nil)
	if err != nil {
		return "", err
	}

	resp, err := insecureClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("discovery request error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("discovery failed: %d - %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode discovery response: %w", err)
	}

	sfuURL, ok := result["sfu_url"].(string)
	if !ok {
		return "", fmt.Errorf("sfu_url not found in discovery response")
	}

	return fmt.Sprintf("%s/viewer?room_id=%s", sfuURL, roomID), nil
}

// whipSignal sends WebRTC offer to the discovered SFU endpoint
func whipSignal(offer webrtc.SessionDescription, sfuViewerURL string) (string, error) {
	req, err := http.NewRequest("POST", sfuViewerURL, bytes.NewBuffer([]byte(offer.SDP)))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/sdp")

	// IMPORTANT : on utilise le client qui ignore les certifs
	resp, err := insecureClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("signal POST error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("bad response from SFU: %d - %s", resp.StatusCode, string(body))
	}

	answerSDP, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("cannot read answer SDP: %w", err)
	}

	return string(answerSDP), nil
}

func newPeer() (*webrtc.PeerConnection, error) {
	// identical to your front
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	}

	pc, err := webrtc.NewPeerConnection(config)
	if err != nil {
		return nil, err
	}

	return pc, nil
}

func runViewer(ctx context.Context, id int, room string) error {
	// Step 1: Discover SFU from control plane
	sfuViewerURL, err := discoverSFU(controlPlaneURL, room)
	if err != nil {
		return fmt.Errorf("viewer %d: discover SFU error: %w", id, err)
	}
	fmt.Printf("[viewer %d] Discovered SFU viewer URL: %s\n", id, sfuViewerURL)

	pc, err := newPeer()
	if err != nil {
		return fmt.Errorf("viewer %d: %w", id, err)
	}
	defer pc.Close()

	// Required for WHIP viewer (recvonly)
	pc.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionRecvonly,
	})
	pc.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionRecvonly,
	})

	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		fmt.Printf("[viewer %d] ICE: %s\n", id, state)
	})

	pc.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		fmt.Printf("[viewer %d] TRACK: %s (SSRC=%d)\n",
			id, track.Kind().String(), track.SSRC())

		// Consume packets to avoid buffer overflow
		go func() {
			buf := make([]byte, 1500)
			for {
				_, _, err := track.Read(buf)
				if err != nil {
					fmt.Printf("[viewer %d] Track read ended: %v\n", id, err)
					return
				}
			}
		}()
	})

	// Create offer
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		return fmt.Errorf("[viewer %d] createOffer error: %w", id, err)
	}

	if err := pc.SetLocalDescription(offer); err != nil {
		return fmt.Errorf("[viewer %d] setLocalDescription error: %w", id, err)
	}

	// Wait for ICE gathering complete
	gatherComplete := webrtc.GatheringCompletePromise(pc)
	<-gatherComplete

	// Step 2: Send offer to discovered SFU
	answerSDP, err := whipSignal(*pc.LocalDescription(), sfuViewerURL)
	if err != nil {
		return fmt.Errorf("[viewer %d] whipSignal error: %w", id, err)
	}

	answer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  answerSDP,
	}

	if err := pc.SetRemoteDescription(answer); err != nil {
		return fmt.Errorf("[viewer %d] setRemoteDescription error: %w", id, err)
	}

	fmt.Printf("[viewer %d] Connected successfully\n", id)

	// Hold the connection
	select {
	case <-ctx.Done():
		fmt.Printf("[viewer %d] context cancelled\n", id)
	case <-time.After(hold):
		fmt.Printf("[viewer %d] finished holding\n", id)
	}

	return nil
}

func main() {
	flag.Parse()
	if roomID == "" {
		fmt.Println("ERROR: you must set -room=<trackId>")
		os.Exit(1)
	}

	fmt.Printf("Starting load test with SFU discovery:\n")
	fmt.Printf("  - Viewers: %d\n", viewers)
	fmt.Printf("  - Hold time: %v\n", hold)
	fmt.Printf("  - Room ID: %s\n", roomID)
	fmt.Printf("  - Control Plane URL: %s\n", controlPlaneURL)
	fmt.Println()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(viewers)

	for i := 0; i < viewers; i++ {
		i := i
		go func() {
			defer wg.Done()
			if err := runViewer(ctx, i, roomID); err != nil {
				fmt.Println("ERROR:", err)
			}
		}()
		time.Sleep(50 * time.Millisecond) // small delay to avoid instant burst
	}

	wg.Wait()
	fmt.Println("All viewers done.")
}
