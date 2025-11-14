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
		Broadcasters: make(map[string]*TrackBroadcaster),
		Viewers:      make(map[string]*webrtc.PeerConnection),
	}
}

// AddTrack adds a new track to the room for broadcasting
func (room *Room) AddTrack(track *webrtc.TrackRemote) {
	room.mu.Lock()
	defer room.mu.Unlock()

	trackKey := track.ID() + "-" + track.StreamID()
	if _, exists := room.Broadcasters[trackKey]; !exists {
		room.Broadcasters[trackKey] = NewTrackBroadcaster(track)
		log.Printf("[ROOM-%s] Added new track broadcaster: %s", room.ID, trackKey)
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
