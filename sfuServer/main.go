package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"

	"github.com/pion/webrtc/v3"
)

type TrackBroadcaster struct {
	track     *webrtc.TrackRemote
	viewers   map[string]*webrtc.TrackLocalStaticRTP
	mu        sync.RWMutex
	packetCh  chan []byte
	stopCh    chan struct{}
}

func NewTrackBroadcaster(track *webrtc.TrackRemote) *TrackBroadcaster {
	tb := &TrackBroadcaster{
		track:    track,
		viewers:  make(map[string]*webrtc.TrackLocalStaticRTP),
		packetCh: make(chan []byte, 100),
		stopCh:   make(chan struct{}),
	}
	
	// Start the broadcast goroutine
	go tb.broadcastLoop()
	
	// Start reading from the remote track
	go tb.readLoop()
	
	return tb
}

func (tb *TrackBroadcaster) readLoop() {
	rtpBuf := make([]byte, 1500)
	packetCount := 0
	
	for {
		select {
		case <-tb.stopCh:
			log.Printf("[BROADCASTER] Read loop stopped for track %s", tb.track.ID())
			return
		default:
		}
		
		n, _, err := tb.track.Read(rtpBuf)
		if err != nil {
			log.Printf("[BROADCASTER] Track read error: %v", err)
			close(tb.packetCh)
			return
		}
		
		packetCount++
		if packetCount%1000 == 0 {
			tb.mu.RLock()
			viewerCount := len(tb.viewers)
			tb.mu.RUnlock()
			log.Printf("[BROADCASTER] Track %s: %d packets read, %d viewers", 
				tb.track.ID(), packetCount, viewerCount)
		}
		
		// Copy the packet data before sending to channel
		packet := make([]byte, n)
		copy(packet, rtpBuf[:n])
		
		select {
		case tb.packetCh <- packet:
		default:
			// Channel full, drop packet
			log.Printf("[BROADCASTER] Dropped packet for track %s", tb.track.ID())
		}
	}
}

func (tb *TrackBroadcaster) broadcastLoop() {
	for {
		select {
		case packet, ok := <-tb.packetCh:
			if !ok {
				log.Printf("[BROADCASTER] Broadcast loop ended for track %s", tb.track.ID())
				return
			}
			
			tb.mu.RLock()
			for viewerID, localTrack := range tb.viewers {
				if _, err := localTrack.Write(packet); err != nil {
					log.Printf("[BROADCASTER] Failed to write to viewer %s: %v", viewerID, err)
				}
			}
			tb.mu.RUnlock()
			
		case <-tb.stopCh:
			log.Printf("[BROADCASTER] Broadcast loop stopped for track %s", tb.track.ID())
			return
		}
	}
}

func (tb *TrackBroadcaster) AddViewer(viewerID string, localTrack *webrtc.TrackLocalStaticRTP) {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	
	tb.viewers[viewerID] = localTrack
	log.Printf("[BROADCASTER] Added viewer %s to track %s (%d total viewers)", 
		viewerID, tb.track.ID(), len(tb.viewers))
}

func (tb *TrackBroadcaster) RemoveViewer(viewerID string) {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	if _, exists := tb.viewers[viewerID]; exists {
		delete(tb.viewers, viewerID)
		log.Printf("[BROADCASTER] Removed viewer %s from track %s (%d remaining viewers)",
			viewerID, tb.track.ID(), len(tb.viewers))
	}
}

func (tb *TrackBroadcaster) Stop() {
	close(tb.stopCh)
}

type SFUServer struct {
	broadcasters map[string]*TrackBroadcaster
	mu           sync.RWMutex
}

func NewSFUServer() *SFUServer {
	return &SFUServer{
		broadcasters: make(map[string]*TrackBroadcaster),
	}
}

func (s *SFUServer) AddTrack(track *webrtc.TrackRemote) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	trackKey := track.ID() + "-" + track.StreamID()
	if _, exists := s.broadcasters[trackKey]; !exists {
		s.broadcasters[trackKey] = NewTrackBroadcaster(track)
		log.Printf("[SFU] Added new track broadcaster: %s", trackKey)
	}
}

func (s *SFUServer) AddViewer(viewerID string, peerConnection *webrtc.PeerConnection) error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	addedTracks := 0
	for trackKey, broadcaster := range s.broadcasters {
		localTrack, err := webrtc.NewTrackLocalStaticRTP(
			broadcaster.track.Codec().RTPCodecCapability,
			broadcaster.track.ID(),
			broadcaster.track.StreamID(),
		)
		if err != nil {
			log.Printf("[SFU] Failed to create local track for viewer %s: %v", viewerID, err)
			continue
		}

		if _, err := peerConnection.AddTrack(localTrack); err != nil {
			log.Printf("[SFU] Failed to add track to peer connection for viewer %s: %v", viewerID, err)
			continue
		}

		broadcaster.AddViewer(viewerID, localTrack)
		addedTracks++

		log.Printf("[SFU] Added track %s to viewer %s", trackKey, viewerID)
	}

	// Attach disconnect handlers (idempotent removal)
	removed := false
	removeOnce := func(reason string) {
		if removed {
			return
		}
		removed = true
		log.Printf("[VIEWER-%s] Cleanup due to %s", viewerID, reason)
		s.RemoveViewer(viewerID)
		if err := peerConnection.Close(); err != nil {
			log.Printf("[VIEWER-%s] PeerConnection close error: %v", viewerID, err)
		}
	}

	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Printf("[VIEWER-%s] ICE connection state changed: %s", viewerID, state.String())
		switch state {
		case webrtc.ICEConnectionStateDisconnected, webrtc.ICEConnectionStateFailed, webrtc.ICEConnectionStateClosed:
			removeOnce("ICE state=" + state.String())
		}
	})

	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Printf("[VIEWER-%s] Connection state changed: %s", viewerID, state.String())
		switch state {
		case webrtc.PeerConnectionStateDisconnected, webrtc.PeerConnectionStateFailed, webrtc.PeerConnectionStateClosed:
			removeOnce("PC state=" + state.String())
		}
	})

	log.Printf("[SFU] Added %d tracks to viewer %s", addedTracks, viewerID)
	return nil
}

func (s *SFUServer) RemoveViewer(viewerID string) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	removedAny := false
	for _, broadcaster := range s.broadcasters {
		broadcaster.mu.RLock()
		_, exists := broadcaster.viewers[viewerID]
		broadcaster.mu.RUnlock()
		if exists {
			broadcaster.RemoveViewer(viewerID)
			removedAny = true
		}
	}
	if removedAny {
		log.Printf("[SFU] Removed viewer %s from all tracks", viewerID)
	}
}

var sfuServer = NewSFUServer()

func main() {
	http.HandleFunc("/whip", handleWHIP)
	http.HandleFunc("/viewer", handleViewer)
	http.Handle("/", http.FileServer(http.Dir(".")))

	fmt.Println("Server listening on :8090")
	log.Fatal(http.ListenAndServe(":8090", nil))
}

func handleWHIP(w http.ResponseWriter, r *http.Request) {
	log.Printf("[WHIP] New WHIP connection from %s", r.RemoteAddr)

	// Add CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle preflight OPTIONS request
	if r.Method == http.MethodOptions {
		log.Printf("[WHIP] Handling CORS preflight request")
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		log.Printf("[WHIP] Invalid method: %s", r.Method)
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	offerSDP, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[WHIP] Failed to read request body: %v", err)
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	log.Printf("[WHIP] Received SDP offer (%d bytes)", len(offerSDP))

	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		log.Printf("[WHIP] Failed to create PeerConnection: %v", err)
		http.Error(w, "Failed to create PeerConnection", http.StatusInternalServerError)
		return
	}

	log.Printf("[WHIP] PeerConnection created successfully")

	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		log.Printf("[WHIP] Received track: %s, codec: %s, ID: %s, StreamID: %s",
			track.Kind(), track.Codec().MimeType, track.ID(), track.StreamID())
		
		// Add track to SFU for broadcasting
		sfuServer.AddTrack(track)
	})

	peerConnection.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		log.Printf("[WHIP] Connection state changed: %s", s.String())
	})

	peerConnection.OnICEConnectionStateChange(func(s webrtc.ICEConnectionState) {
		log.Printf("[WHIP] ICE connection state changed: %s", s.String())
	})

	offer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  string(offerSDP),
	}
	if err := peerConnection.SetRemoteDescription(offer); err != nil {
		log.Printf("[WHIP] Failed to set remote description: %v", err)
		http.Error(w, "Failed to set remote description", http.StatusInternalServerError)
		return
	}

	log.Printf("[WHIP] Remote description set successfully")

	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		log.Printf("[WHIP] Failed to create answer: %v", err)
		http.Error(w, "Failed to create answer", http.StatusInternalServerError)
		return
	}

	log.Printf("[WHIP] Answer created successfully")

	if err = peerConnection.SetLocalDescription(answer); err != nil {
		log.Printf("[WHIP] Failed to set local description: %v", err)
		http.Error(w, "Failed to set local description", http.StatusInternalServerError)
		return
	}

	log.Printf("[WHIP] Local description set, waiting for ICE gathering...")

	<-webrtc.GatheringCompletePromise(peerConnection)

	log.Printf("[WHIP] ICE gathering complete")

	// Required by WHIP spec
	w.Header().Set("Location", "/whip/session-1234")
	w.Header().Set("Content-Type", "application/sdp")
	w.WriteHeader(http.StatusCreated)

	answerSDP := peerConnection.LocalDescription().SDP
	log.Printf("[WHIP] Sending SDP answer (%d bytes)", len(answerSDP))

	_, _ = w.Write([]byte(answerSDP))
	log.Printf("[WHIP] Response sent successfully")
}

func handleViewer(w http.ResponseWriter, r *http.Request) {
	log.Printf("[VIEWER] New viewer connected from %s", r.RemoteAddr)

	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == http.MethodOptions {
		log.Printf("[VIEWER] Handling CORS preflight request")
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	offerSDP, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	log.Printf("[VIEWER] Received SDP offer (%d bytes)", len(offerSDP))

	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		http.Error(w, "Failed to create PeerConnection", http.StatusInternalServerError)
		return
	}

	viewerID := fmt.Sprintf("viewer-%s-%p", r.RemoteAddr, peerConnection)
	log.Printf("[VIEWER] Created viewer ID: %s", viewerID)

	if err := sfuServer.AddViewer(viewerID, peerConnection); err != nil {
		http.Error(w, "Failed to attach to broadcasts", http.StatusInternalServerError)
		return
	}

	offer := webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: string(offerSDP)}
	if err := peerConnection.SetRemoteDescription(offer); err != nil {
		http.Error(w, "Failed to set remote description", http.StatusInternalServerError)
		return
	}
	log.Printf("[VIEWER] Remote description set successfully")

	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		http.Error(w, "Failed to create answer", http.StatusInternalServerError)
		return
	}
	log.Printf("[VIEWER] Answer created successfully")

	if err = peerConnection.SetLocalDescription(answer); err != nil {
		http.Error(w, "Failed to set local description", http.StatusInternalServerError)
		return
	}
	log.Printf("[VIEWER] Local description set, waiting for ICE gathering...")

	<-webrtc.GatheringCompletePromise(peerConnection)
	log.Printf("[VIEWER] ICE gathering complete")

	answerSDP := peerConnection.LocalDescription().SDP
	w.Header().Set("Content-Type", "application/sdp")
	_, _ = w.Write([]byte(answerSDP))
	log.Printf("[VIEWER] Sending SDP answer (%d bytes)", len(answerSDP))
	log.Printf("[VIEWER] Response sent successfully")
}