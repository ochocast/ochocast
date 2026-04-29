package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
)

// RecordingSession manages a live stream recording session
type RecordingSession struct {
	eventID          string                 // Unique event identifier (also used as roomID)
	roomID           string                 // SFU room ID
	roomKey          string                 // SFU room authentication key
	sfuBaseURL       string                 // SFU base URL (e.g. "http://localhost:8090")
	outputDir        string                 // Directory for output files
	peerConnection   *webrtc.PeerConnection // WebRTC connection to SFU
	mp4Writer        *MP4Writer             // Direct MP4 writer with A/V sync
	mp4FilePath      string                 // Path to output MP4 file
	videoCodec       string                 // Detected video codec (H264/VP8/VP9)
	isRecording      bool                   // Recording state flag
	mu               sync.Mutex             // Mutex for thread-safe operations
	stopChan         chan struct{}          // Channel to signal stop
	videoPacketCount int64                  // Counter for video RTP packets
	audioPacketCount int64                  // Counter for audio RTP packets
	videoTrackAdded  bool                   // Flag to track if video track is added
	audioTrackAdded  bool                   // Flag to track if audio track is added
	backendURL       string                 // Backend URL for auto-publish after recording
	trackID          string                 // Track ID for video metadata
	// Keycloak authentication for publishing
	keycloakURL          string // Keycloak token endpoint URL
	keycloakClientID     string // Keycloak client ID
	keycloakClientSecret string // Keycloak client secret (for confidential clients)
	keycloakUsername     string // Keycloak username (recording user)
	keycloakPassword     string // Keycloak password (recording user)
}

// RecordingConfig holds all configuration for a recording session
type RecordingConfig struct {
	EventID              string
	RoomID               string
	RoomKey              string
	SfuBaseURL           string
	OutputDir            string
	BackendURL           string
	TrackID              string
	KeycloakURL          string
	KeycloakClientID     string
	KeycloakClientSecret string
	KeycloakUsername     string
	KeycloakPassword     string
}

// NewRecordingSession creates a new recording session.
// Returns: initialized RecordingSession or error
func NewRecordingSession(config RecordingConfig) (*RecordingSession, error) {
	// Create output directory if it doesn't exist
	if err := os.MkdirAll(config.OutputDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create output directory: %w", err)
	}

	// Generate timestamped filename for MP4
	timestamp := time.Now().Format("20060102_150405")
	mp4FilePath := filepath.Join(config.OutputDir, fmt.Sprintf("%s_%s.mp4", config.EventID, timestamp))

	// Create MP4 writer
	mp4Writer, err := NewMP4Writer(mp4FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create MP4 writer: %w", err)
	}

	return &RecordingSession{
		eventID:              config.EventID,
		roomID:               config.RoomID,
		roomKey:              config.RoomKey,
		sfuBaseURL:           config.SfuBaseURL,
		outputDir:            config.OutputDir,
		mp4Writer:            mp4Writer,
		mp4FilePath:          mp4FilePath,
		stopChan:             make(chan struct{}),
		backendURL:           config.BackendURL,
		trackID:              config.TrackID,
		keycloakURL:          config.KeycloakURL,
		keycloakClientID:     config.KeycloakClientID,
		keycloakClientSecret: config.KeycloakClientSecret,
		keycloakUsername:     config.KeycloakUsername,
		keycloakPassword:     config.KeycloakPassword,
	}, nil
}

// CheckStreamStatus checks if the stream is active in the room
func (rs *RecordingSession) CheckStreamStatus() (bool, error) {
	url := fmt.Sprintf("%s/stream-status?room_id=%s", rs.sfuBaseURL, rs.roomID)
	resp, err := http.Get(url)
	if err != nil {
		return false, fmt.Errorf("failed to check stream status: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return false, fmt.Errorf("stream status check failed: %s - %s", resp.Status, string(body))
	}

	var status struct {
		Active bool `json:"active"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return false, fmt.Errorf("failed to decode stream status: %w", err)
	}

	return status.Active, nil
}

// StartRecording connects to the SFU and starts recording the stream.
// Process:
// 1. Create WebRTC PeerConnection
// 2. Negotiate connection with SFU (SDP Offer/Answer)
// 3. Receive video and audio tracks
// 4. Detect codec and create appropriate writers
// 5. Write RTP packets to files
// Returns: error if connection or recording fails
func (rs *RecordingSession) StartRecording() error {
	// Check if already recording
	rs.mu.Lock()
	if rs.isRecording {
		rs.mu.Unlock()
		return fmt.Errorf("recording already in progress")
	}
	rs.isRecording = true
	rs.mu.Unlock()

	log.Printf("Starting recording session: %s", rs.eventID)
	log.Printf("Connecting to SFU room: %s (base URL: %s)", rs.roomID, rs.sfuBaseURL)

	// Step 1: Create WebRTC PeerConnection with STUN server
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: []string{"stun:stun.l.google.com:19302"},
			},
		},
	}

	pc, err := webrtc.NewPeerConnection(config)
	if err != nil {
		return fmt.Errorf("failed to create peer connection: %w", err)
	}
	rs.peerConnection = pc

	log.Println("PeerConnection created")

	// Step 2: Setup WebRTC callbacks (before adding transceivers)
	if err := rs.setupCallbacks(); err != nil {
		return fmt.Errorf("failed to setup callbacks: %w", err)
	}

	// Step 3: Add transceivers to receive media (recvonly)
	// This tells the SFU we want to receive video and audio
	if _, err := pc.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
		return fmt.Errorf("failed to add video transceiver: %w", err)
	}

	if _, err := pc.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
		return fmt.Errorf("failed to add audio transceiver: %w", err)
	}

	log.Println("Added transceivers (video + audio)")

	// Step 4: Create SDP Offer
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		return fmt.Errorf("failed to create offer: %w", err)
	}

	if err := pc.SetLocalDescription(offer); err != nil {
		return fmt.Errorf("failed to set local description: %w", err)
	}

	log.Println("Created SDP offer")

	// Step 5: Wait for ICE gathering to complete
	// Collects ICE candidates (possible connection paths)
	gatherComplete := webrtc.GatheringCompletePromise(pc)
	<-gatherComplete

	log.Println("ICE gathering complete")

	// Step 6: Send Offer to SFU via HTTP POST with room parameters
	log.Println("Sending offer to SFU...")

	// Build recorder URL with room_id and optional key (dedicated track, no-drop policy)
	recorderURL := fmt.Sprintf("%s/recorder?room_id=%s", rs.sfuBaseURL, rs.roomID)
	if rs.roomKey != "" {
		recorderURL = fmt.Sprintf("%s&key=%s", recorderURL, rs.roomKey)
	}
	log.Printf("Recorder URL: %s", recorderURL)

	resp, err := http.Post(recorderURL, "application/sdp",
		bytes.NewReader([]byte(pc.LocalDescription().SDP)))
	if err != nil {
		return fmt.Errorf("failed to send offer to SFU: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("SFU returned status %d: %s", resp.StatusCode, string(body))
	}

	// Step 7: Read SDP Answer from SFU
	answerSDP, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read answer: %w", err)
	}

	log.Printf("Received answer from SFU (%d bytes)", len(answerSDP))

	// Step 8: Set remote description (SFU's answer)
	answer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  string(answerSDP),
	}

	if err := pc.SetRemoteDescription(answer); err != nil {
		return fmt.Errorf("failed to set remote description: %w", err)
	}

	log.Println("Remote description set")
	log.Println("Waiting for connection and track detection...")

	// Step 9: Start monitoring stats
	go rs.monitorStats()

	return nil
}


// setupCallbacks configures WebRTC event handlers
func (rs *RecordingSession) setupCallbacks() error {
	// OnTrack: called when a track (video/audio) is received from SFU
	rs.peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		codec := track.Codec()
		log.Printf("Received %s track: %s (codec: %s)",
			track.Kind(), track.ID(), codec.MimeType)

		rs.mu.Lock()
		// Add track to MP4 writer
		if track.Kind() == webrtc.RTPCodecTypeVideo {
			if !rs.videoTrackAdded {
				rs.videoCodec = codec.MimeType
				err := rs.mp4Writer.AddVideoTrack(codec.MimeType, codec.ClockRate, 1280, 720)
				if err != nil {
					log.Printf("[ERROR] Failed to add video track: %v", err)
					rs.mu.Unlock()
					return
				}
				rs.videoTrackAdded = true
				log.Printf("Video track added to MP4: %s", codec.MimeType)
			}
		} else {
			if !rs.audioTrackAdded {
				err := rs.mp4Writer.AddAudioTrack(codec.MimeType, codec.ClockRate)
				if err != nil {
					log.Printf("[ERROR] Failed to add audio track: %v", err)
					rs.mu.Unlock()
					return
				}
				rs.audioTrackAdded = true
				log.Printf("Audio track added to MP4: %s", codec.MimeType)
			}
		}
		rs.mu.Unlock()

		// Start goroutine to read and record RTP packets
		go rs.recordTrack(track)
	})

	// OnConnectionStateChange: monitors WebRTC connection state
	rs.peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Printf("Connection state: %s", state)

		switch state {
		case webrtc.PeerConnectionStateConnected:
			log.Println("Connected! Recording to MP4...")

		case webrtc.PeerConnectionStateFailed:
			log.Println("[ERROR] Connection failed")
			rs.Stop()

		case webrtc.PeerConnectionStateClosed:
			log.Println("Connection closed")
			rs.Stop()

		case webrtc.PeerConnectionStateDisconnected:
			log.Println("[WARN] Connection disconnected")
		}
	})

	// OnICEConnectionStateChange: monitors ICE connection state
	rs.peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Printf("ICE connection state: %s", state)

		if state == webrtc.ICEConnectionStateFailed {
			log.Println("[ERROR] ICE connection failed")
			rs.Stop()
		}
	})

	return nil
}

// recordTrack reads RTP packets from a track and writes directly to MP4
func (rs *RecordingSession) recordTrack(track *webrtc.TrackRemote) {
	log.Printf("Started recording %s track to MP4", track.Kind())

	for {
		select {
		case <-rs.stopChan:
			// Stop signal received
			log.Printf("Stopping %s track recording", track.Kind())
			return

		default:
			// Read RTP packet from track
			rtpPacket, _, err := track.ReadRTP()
			if err != nil {
				if err != io.EOF {
					log.Printf("[ERROR] Error reading %s track: %v", track.Kind(), err)
				}
				return
			}

			// Write packet to MP4 with timestamps
			if track.Kind() == webrtc.RTPCodecTypeVideo {
				if err := rs.mp4Writer.WriteVideoRTP(rtpPacket); err != nil {
					log.Printf("[ERROR] Error writing video packet to MP4: %v", err)
					continue
				}

				rs.mu.Lock()
				rs.videoPacketCount++
				rs.mu.Unlock()

			} else {
				if err := rs.mp4Writer.WriteAudioRTP(rtpPacket); err != nil {
					log.Printf("[ERROR] Error writing audio packet to MP4: %v", err)
					continue
				}
				
				rs.mu.Lock()
				rs.audioPacketCount++
				rs.mu.Unlock()
			}
		}
	}
}

// monitorStats displays recording statistics periodically
func (rs *RecordingSession) monitorStats() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-rs.stopChan:
			return

		case <-ticker.C:
			rs.mu.Lock()
			videoCount := rs.videoPacketCount
			audioCount := rs.audioPacketCount
			codec := rs.videoCodec
			rs.mu.Unlock()

			log.Printf("[STATS] Recording [%s]: Video=%d packets, Audio=%d packets",
				codec, videoCount, audioCount)
		}
	}
}

// Stop cleanly stops the recording and closes all files.
// Process:
// 1. Stops track reading goroutines
// 2. Closes video and audio writers
// 3. Closes PeerConnection
// 4. Displays final statistics
// Returns: error if stop fails
func (rs *RecordingSession) Stop() error {
	rs.mu.Lock()
	if !rs.isRecording {
		rs.mu.Unlock()
		return fmt.Errorf("no recording in progress")
	}
	rs.isRecording = false
	rs.mu.Unlock()

	log.Println("Stopping recording...")

	// Signal all goroutines to stop
	close(rs.stopChan)

	// Wait for last packets to be written
	time.Sleep(500 * time.Millisecond)

	// Close MP4 writer
	if rs.mp4Writer != nil {
		syncOffset := rs.mp4Writer.GetSyncOffset()
		if err := rs.mp4Writer.Close(); err != nil {
			log.Printf("[WARN] Error closing MP4 writer: %v", err)
		} else {
			log.Printf("MP4 file saved: %s", rs.mp4FilePath)
			log.Printf("[STATS] A/V sync offset: %.3f ms", syncOffset*1000)
		}
	}

	// Close PeerConnection
	if rs.peerConnection != nil {
		if err := rs.peerConnection.Close(); err != nil {
			log.Printf("[WARN] Error closing peer connection: %v", err)
		}
	}

	// Display final statistics
	log.Printf("[STATS] Final [%s]: Video=%d packets, Audio=%d packets",
		rs.videoCodec, rs.videoPacketCount, rs.audioPacketCount)

	// Display file size
	if rs.mp4FilePath != "" {
		if fileInfo, err := os.Stat(rs.mp4FilePath); err == nil {
			log.Printf("[STATS] MP4 file size: %.2f MB", float64(fileInfo.Size())/1024/1024)
		}
	}

	log.Println("Recording stopped successfully")
	log.Println("MP4 file is ready to use - no muxing needed!")

	return nil
}

