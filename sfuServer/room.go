package main

import (
	"log"

	"github.com/pion/webrtc/v3"
)

// NewRoom creates a new Room instance
func NewRoom(id, key string) *Room {
	return &Room{
		ID:           id,
		Key:          key,
		Publishers:   make(map[string]*webrtc.PeerConnection),
		Broadcasters: make(map[string]*TrackBroadcaster),
		Viewers:      make(map[string]*webrtc.PeerConnection),
		PeerSFUs:     make(map[string]*CascadeConnection),
		IsOrigin:     false, // Will be determined dynamically
		OriginURL:    "",
	}
}

// AddTrack adds a new track to the room for broadcasting
func (room *Room) AddTrack(track *webrtc.TrackRemote) {
	room.mu.Lock()
	defer room.mu.Unlock()

	trackKey := track.ID() + "-" + track.StreamID()
	if _, exists := room.Broadcasters[trackKey]; exists {
		log.Printf("[ROOM-%s] Track broadcaster %s already exists", room.ID, trackKey)
		return
	}

	broadcaster := NewTrackBroadcaster(track)
	room.Broadcasters[trackKey] = broadcaster
	log.Printf("[ROOM-%s] Added new track broadcaster: %s", room.ID, trackKey)

	// CRITICAL: Add this track to all viewers already connected
	// (fixes timing issue where cascade viewers connect before WHIP tracks arrive)
	for viewerID, viewerPC := range room.Viewers {
		go func(pc *webrtc.PeerConnection, vID string) {
			localTrack, err := webrtc.NewTrackLocalStaticRTP(
				track.Codec().RTPCodecCapability,
				track.ID(),
				track.StreamID(),
			)
			if err != nil {
				log.Printf("[ROOM-%s] Error creating local track for existing viewer %s: %v", room.ID, vID, err)
				return
			}

			sender, err := pc.AddTrack(localTrack)
			if err != nil {
				log.Printf("[ROOM-%s] Error adding track to existing viewer %s: %v", room.ID, vID, err)
				return
			}

			broadcaster.AddViewer(vID, localTrack)

			go func() {
				rtcpBuf := make([]byte, 1500)
				for {
					if _, _, rtcpErr := sender.Read(rtcpBuf); rtcpErr != nil {
						return
					}
				}
			}()

			log.Printf("[ROOM-%s] 🎬 Added track %s to existing viewer %s", room.ID, trackKey, vID)
		}(viewerPC, viewerID)
	}
}

// AddViewer adds a new viewer to the room
func (room *Room) AddViewer(viewerID string, peerConnection *webrtc.PeerConnection) error {
	room.mu.Lock()
	room.Viewers[viewerID] = peerConnection
	broadcasters := make(map[string]*TrackBroadcaster)
	for k, v := range room.Broadcasters {
		broadcasters[k] = v
	}
	room.mu.Unlock()

	addedTracks := 0
	for trackKey, broadcaster := range broadcasters {
		localTrack, err := webrtc.NewTrackLocalStaticRTP(
			broadcaster.track.Codec().RTPCodecCapability,
			broadcaster.track.ID(),
			broadcaster.track.StreamID(),
		)
		if err != nil {
			log.Printf("[ROOM-%s] Failed to create local track for viewer %s: %v", room.ID, viewerID, err)
			continue
		}

		if _, err := peerConnection.AddTrack(localTrack); err != nil {
			log.Printf("[ROOM-%s] Failed to add track to peer connection for viewer %s: %v", room.ID, viewerID, err)
			continue
		}

		broadcaster.AddViewer(viewerID, localTrack)
		addedTracks++

		log.Printf("[ROOM-%s] Added track %s to viewer %s", room.ID, trackKey, viewerID)
	}

	// Attach disconnect handlers
	room.attachViewerDisconnectHandlers(viewerID, peerConnection)

	log.Printf("[ROOM-%s] Added %d tracks to viewer %s", room.ID, addedTracks, viewerID)
	return nil
}

// attachViewerDisconnectHandlers sets up handlers for viewer disconnection
func (room *Room) attachViewerDisconnectHandlers(viewerID string, peerConnection *webrtc.PeerConnection) {
	removed := false
	removeOnce := func(reason string) {
		if removed {
			return
		}
		removed = true
		log.Printf("[ROOM-%s][VIEWER-%s] Cleanup due to %s", room.ID, viewerID, reason)
		room.RemoveViewer(viewerID)
		if err := peerConnection.Close(); err != nil {
			log.Printf("[ROOM-%s][VIEWER-%s] PeerConnection close error: %v", room.ID, viewerID, err)
		}
	}

	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Printf("[ROOM-%s][VIEWER-%s] ICE connection state changed: %s", room.ID, viewerID, state.String())
		switch state {
		case webrtc.ICEConnectionStateDisconnected, webrtc.ICEConnectionStateFailed, webrtc.ICEConnectionStateClosed:
			removeOnce("ICE state=" + state.String())
		}
	})

	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Printf("[ROOM-%s][VIEWER-%s] Connection state changed: %s", room.ID, viewerID, state.String())
		switch state {
		case webrtc.PeerConnectionStateDisconnected, webrtc.PeerConnectionStateFailed, webrtc.PeerConnectionStateClosed:
			removeOnce("PC state=" + state.String())
		}
	})
}

// RemoveViewer removes a viewer from the room
func (room *Room) RemoveViewer(viewerID string) {
	room.mu.Lock()
	delete(room.Viewers, viewerID)
	broadcasters := make(map[string]*TrackBroadcaster)
	for k, v := range room.Broadcasters {
		broadcasters[k] = v
	}
	room.mu.Unlock()

	for _, broadcaster := range broadcasters {
		broadcaster.RemoveViewer(viewerID)
	}
	log.Printf("[ROOM-%s] Removed viewer %s", room.ID, viewerID)
}

// RemovePublisher removes a publisher (speaker) from the room
func (room *Room) RemovePublisher(publisherID string) {
	room.mu.Lock()
	pc, exists := room.Publishers[publisherID]
	if !exists {
		room.mu.Unlock()
		return
	}
	delete(room.Publishers, publisherID)

	// Collect tracks to delete
	toDelete := []string{}
	for trackKey := range room.Broadcasters {
		// Track keys contain publisher ID in their stream ID
		toDelete = append(toDelete, trackKey)
	}
	room.mu.Unlock()

	// Close the peer connection
	if pc != nil {
		if err := pc.Close(); err != nil {
			log.Printf("[ROOM-%s] Publisher %s close error: %v", room.ID, publisherID, err)
		}
	}

	// Stop and remove broadcasters for this publisher's tracks
	room.mu.Lock()
	for _, trackKey := range toDelete {
		if broadcaster, exists := room.Broadcasters[trackKey]; exists {
			broadcaster.Stop()
			delete(room.Broadcasters, trackKey)
		}
	}
	room.mu.Unlock()

	log.Printf("[ROOM-%s] Removed publisher %s and associated tracks", room.ID, publisherID)
}

// CleanupHost cleans up host connection and all broadcasters when host disconnects
func (room *Room) CleanupHost() {
	room.mu.Lock()
	defer room.mu.Unlock()

	// Stop all broadcasters
	for trackKey, broadcaster := range room.Broadcasters {
		broadcaster.Stop()
		log.Printf("[ROOM-%s] Stopped broadcaster for track %s", room.ID, trackKey)
	}

	// Clear broadcasters map
	room.Broadcasters = make(map[string]*TrackBroadcaster)

	// Close host connection
	if room.Host != nil {
		if err := room.Host.Close(); err != nil {
			log.Printf("[ROOM-%s] Host PeerConnection close error: %v", room.ID, err)
		}
		room.Host = nil
	}

	// Mark stream as inactive
	room.StreamActive = false
	log.Printf("[ROOM-%s] Stream marked as INACTIVE", room.ID)

	log.Printf("[ROOM-%s] Host cleanup completed, ready for new host connection", room.ID)
}

// Close closes the room and all its connections
func (room *Room) Close() {
	room.mu.Lock()
	defer room.mu.Unlock()

	// Close host connection
	if room.Host != nil {
		room.Host.Close()
	}

	// Close all viewer connections
	for _, pc := range room.Viewers {
		pc.Close()
	}

	// Stop all broadcasters
	for _, broadcaster := range room.Broadcasters {
		broadcaster.Stop()
	}

	log.Printf("[ROOM-%s] Room closed", room.ID)
}
