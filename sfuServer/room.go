package main

import (
	"log"
	"time"

	"github.com/pion/webrtc/v3"
)

// Grace period before cleaning up a room when the host disconnects
// This allows the host to reconnect (e.g., OBS stop/start) without losing the room key
const HostReconnectGracePeriod = 10 * time.Minute

// NewRoom creates a new Room instance
func NewRoom(id, key string) *Room {
	return &Room{
		ID:           id,
		Key:          key,
		Publishers:   make(map[string]*webrtc.PeerConnection),
		Broadcasters: make(map[string]*TrackBroadcaster),
		Viewers:      make(map[string]*webrtc.PeerConnection),
		PeerSFUs:     make(map[string]*CascadeConnection),
		SharedTracks: make(map[string]*webrtc.TrackLocalStaticRTP), // ⚡ Initialize for optimization
		IsOrigin:     false,                                        // Will be determined dynamically
		OriginURL:    "",
	}
}

// AddTrack adds a new track to the room for broadcasting
// ⚡ OPTIMIZED: Crée 1 TrackLocalStaticRTP partagée, pas 1 per viewer!
func (room *Room) AddTrack(track *webrtc.TrackRemote) {
	room.mu.Lock()

	trackKey := track.ID() + "-" + track.StreamID()
	if _, exists := room.Broadcasters[trackKey]; exists {
		log.Printf("[ROOM-%s] Track broadcaster %s already exists", room.ID, trackKey)
		room.mu.Unlock()
		return
	}

	// ⚡ CREATE SHARED TRACK ONCE (not per viewer!)
	localTrack, err := webrtc.NewTrackLocalStaticRTP(
		track.Codec().RTPCodecCapability,
		track.ID(),
		track.StreamID(),
	)
	if err != nil {
		log.Printf("[ROOM-%s] Error creating local track: %v", room.ID, err)
		room.mu.Unlock()
		return
	}

	// Store the shared track for later reference
	if room.SharedTracks == nil {
		room.SharedTracks = make(map[string]*webrtc.TrackLocalStaticRTP)
	}
	room.SharedTracks[trackKey] = localTrack

	// ⚡ Create broadcaster with the shared track (direct write, no viewer dispatch!)
	broadcaster := NewTrackBroadcaster(track, localTrack)
	room.Broadcasters[trackKey] = broadcaster
	log.Printf("[ROOM-%s] ✅ Added shared track broadcaster: %s (1 track for all viewers!)", room.ID, trackKey)

	// Get copy of viewers list
	viewers := make(map[string]*webrtc.PeerConnection)
	for vID, vPC := range room.Viewers {
		viewers[vID] = vPC
	}
	room.mu.Unlock()

	// Add the SAME shared track to all existing viewers (no duplication!)
	for viewerID, viewerPC := range viewers {
		_, err := viewerPC.AddTrack(localTrack)
		if err != nil {
			log.Printf("[ROOM-%s] Error adding shared track to existing viewer %s: %v", room.ID, viewerID, err)
			continue
		}
		log.Printf("[ROOM-%s] ✅ Added shared track %s to viewer %s (no new alloc!)", room.ID, trackKey, viewerID)
	}
}

// AddViewer adds a new viewer to the room
// ⚡ OPTIMIZED: Réutilise les SharedTracks au lieu de créer M*N allocations
func (room *Room) AddViewer(viewerID string, peerConnection *webrtc.PeerConnection) error {
	room.mu.Lock()
	room.Viewers[viewerID] = peerConnection

	// Copy the shared tracks (already created by AddTrack)
	sharedTracks := make(map[string]*webrtc.TrackLocalStaticRTP)
	if room.SharedTracks != nil {
		for k, v := range room.SharedTracks {
			sharedTracks[k] = v
		}
	}
	room.mu.Unlock()

	// ⚡ Add EXISTING shared tracks (no new allocations!)
	trackCount := 0
	for trackKey, localTrack := range sharedTracks {
		if _, err := peerConnection.AddTrack(localTrack); err != nil {
			log.Printf("[ROOM-%s] Error adding shared track to viewer %s: %v", room.ID, viewerID, err)
			continue
		}
		trackCount++
		log.Printf("[ROOM-%s] ✅ Viewer %s attached to shared track %s (O(1)!)", room.ID, viewerID, trackKey)
	}

	// Attach disconnect handlers
	room.attachViewerDisconnectHandlers(viewerID, peerConnection)

	log.Printf("[ROOM-%s] Viewer %s ready (%d tracks, no allocations!)", room.ID, viewerID, trackCount)
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
		room.RemoveViewer(viewerID)
		peerConnection.Close()
	}

	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		switch state {
		case webrtc.ICEConnectionStateDisconnected, webrtc.ICEConnectionStateFailed, webrtc.ICEConnectionStateClosed:
			removeOnce("ICE state=" + state.String())
		}
	})

	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		switch state {
		case webrtc.PeerConnectionStateDisconnected, webrtc.PeerConnectionStateFailed, webrtc.PeerConnectionStateClosed:
			removeOnce("PC state=" + state.String())
		}
	})
}

// RemoveViewer removes a viewer from the room and closes their connection
func (room *Room) RemoveViewer(viewerID string) {
	room.mu.Lock()
	pc, exists := room.Viewers[viewerID]
	delete(room.Viewers, viewerID)
	room.mu.Unlock()

	// Close PeerConnection if still exists
	if exists && pc != nil {
		pc.Close()
		log.Printf("[ROOM-%s] Closed PeerConnection for viewer %s", room.ID, viewerID)
	}

	// ⚡ NO broadcaster cleanup needed - SharedTracks are reused!
	// Just removing the viewer is enough

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

// ScheduleCleanup schedules a cleanup with a grace period to allow host reconnection
// The room key is NOT deleted during this grace period
func (room *Room) ScheduleCleanup() {
	room.mu.Lock()
	defer room.mu.Unlock()

	// If cleanup is already scheduled, do nothing
	if room.cleanupScheduled {
		log.Printf("[ROOM-%s] Cleanup already scheduled, ignoring", room.ID)
		return
	}

	// Mark stream as inactive immediately but keep the room alive
	room.StreamActive = false
	log.Printf("[ROOM-%s] Stream marked as INACTIVE, scheduling cleanup in %v", room.ID, HostReconnectGracePeriod)

	// Stop all broadcasters immediately (no point keeping them)
	for trackKey, broadcaster := range room.Broadcasters {
		broadcaster.Stop()
		log.Printf("[ROOM-%s] Stopped broadcaster for track %s", room.ID, trackKey)
	}
	room.Broadcasters = make(map[string]*TrackBroadcaster)

	// Close all publishers (speakers)
	for publisherID, pc := range room.Publishers {
		if pc != nil {
			pc.Close()
			log.Printf("[ROOM-%s] Closed publisher %s", room.ID, publisherID)
		}
	}
	room.Publishers = make(map[string]*webrtc.PeerConnection)

	// Close all viewers
	for viewerID, pc := range room.Viewers {
		if pc != nil {
			pc.Close()
			log.Printf("[ROOM-%s] Closed viewer %s", room.ID, viewerID)
		}
	}
	room.Viewers = make(map[string]*webrtc.PeerConnection)

	// Close host connection
	if room.Host != nil {
		if err := room.Host.Close(); err != nil {
			log.Printf("[ROOM-%s] Host PeerConnection close error: %v", room.ID, err)
		}
		room.Host = nil
	}

	room.cleanupScheduled = true
	room.cleanupTimer = time.AfterFunc(HostReconnectGracePeriod, func() {
		room.mu.Lock()
		// Double check if cleanup is still scheduled (might have been cancelled)
		if !room.cleanupScheduled {
			room.mu.Unlock()
			log.Printf("[ROOM-%s] Cleanup was cancelled, skipping", room.ID)
			return
		}
		room.cleanupScheduled = false
		room.cleanupTimer = nil
		room.mu.Unlock()

		log.Printf("[ROOM-%s] Grace period expired, room will be deleted", room.ID)
		// Signal to SFUServer to delete the room
		sfuServer.DeleteRoom(room.ID)
	})

	log.Printf("[ROOM-%s] Host cleanup initiated, room key preserved for %v", room.ID, HostReconnectGracePeriod)
}

// CancelScheduledCleanup cancels any pending cleanup (called when host reconnects)
func (room *Room) CancelScheduledCleanup() bool {
	room.mu.Lock()
	defer room.mu.Unlock()

	if !room.cleanupScheduled {
		return false
	}

	if room.cleanupTimer != nil {
		room.cleanupTimer.Stop()
		room.cleanupTimer = nil
	}
	room.cleanupScheduled = false
	log.Printf("[ROOM-%s] Scheduled cleanup cancelled, host reconnected", room.ID)
	return true
}

// CleanupHost cleans up host connection and all broadcasters when host disconnects
// DEPRECATED: Use ScheduleCleanup instead for graceful host disconnection
func (room *Room) CleanupHost() {
	// Now delegates to ScheduleCleanup for grace period support
	room.ScheduleCleanup()
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
