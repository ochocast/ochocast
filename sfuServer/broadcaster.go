package main

import (
	"log"

	"github.com/pion/webrtc/v3"
)

// NewTrackBroadcaster creates a new TrackBroadcaster instance
func NewTrackBroadcaster(track *webrtc.TrackRemote) *TrackBroadcaster {
	tb := &TrackBroadcaster{
		track:    track,
		viewers:  make([]*viewerWriter, 0, 10), // Pre-allocate for 10 viewers
		packetCh: make(chan []byte, 100),
		stopCh:   make(chan struct{}),
	}

	// Start the broadcast goroutine
	go tb.broadcastLoop()

	// Start reading from the remote track
	go tb.readLoop()

	return tb
}

// readLoop continuously reads RTP packets from the remote track
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

// broadcastLoop continuously broadcasts packets to all viewers in parallel
func (tb *TrackBroadcaster) broadcastLoop() {
	for {
		select {
		case packet, ok := <-tb.packetCh:
			if !ok {
				log.Printf("[BROADCASTER] Broadcast loop ended for track %s", tb.track.ID())
				return
			}

			// Take a snapshot of viewers to minimize lock time
			tb.mu.RLock()
			viewers := tb.viewers
			tb.mu.RUnlock()

			// Distribute packet to all viewer channels (non-blocking)
			// Using snapshot means we don't hold the lock during sends
			// Iterating over slice is faster than map
			for _, vw := range viewers {
				select {
				case vw.packetCh <- packet:
					// Packet successfully sent to viewer's buffer
				default:
					// Viewer's buffer is full, drop packet for this viewer only
					log.Printf("[BROADCASTER] Dropped packet for slow viewer %s on track %s",
						vw.viewerID, tb.track.ID())
				}
			}

		case <-tb.stopCh:
			log.Printf("[BROADCASTER] Broadcast loop stopped for track %s", tb.track.ID())
			return
		}
	}
}

// startViewerWriter starts a dedicated goroutine for writing packets to a single viewer
func (tb *TrackBroadcaster) startViewerWriter(viewerID string, vw *viewerWriter) {
	go func() {
		log.Printf("[BROADCASTER] Started writer goroutine for viewer %s on track %s",
			viewerID, tb.track.ID())

		for {
			select {
			case packet, ok := <-vw.packetCh:
				if !ok {
					log.Printf("[BROADCASTER] Viewer %s channel closed on track %s",
						viewerID, tb.track.ID())
					return
				}

				if _, err := vw.track.Write(packet); err != nil {
					log.Printf("[BROADCASTER] Failed to write to viewer %s: %v", viewerID, err)
					// Don't return here - let connection state handlers deal with cleanup
				}

			case <-vw.stopCh:
				log.Printf("[BROADCASTER] Stopping writer for viewer %s on track %s",
					viewerID, tb.track.ID())
				return

			case <-tb.stopCh:
				log.Printf("[BROADCASTER] Broadcaster stopped, closing writer for viewer %s", viewerID)
				return
			}
		}
	}()
}

// AddViewer adds a new viewer to this broadcaster using copy-on-write
func (tb *TrackBroadcaster) AddViewer(viewerID string, localTrack *webrtc.TrackLocalStaticRTP) {
	// Create viewer writer with buffered channel
	vw := &viewerWriter{
		viewerID: viewerID,
		track:    localTrack,
		packetCh: make(chan []byte, 100), // Buffer 100 packets per viewer
		stopCh:   make(chan struct{}),
	}

	tb.mu.Lock()

	// Create a new slice with all existing viewers plus the new one
	newViewers := make([]*viewerWriter, len(tb.viewers), len(tb.viewers)+1)
	copy(newViewers, tb.viewers)
	newViewers = append(newViewers, vw)

	// Swap the slice atomically
	tb.viewers = newViewers
	viewerCount := len(newViewers)

	tb.mu.Unlock()

	// Start the dedicated writer goroutine for this viewer
	tb.startViewerWriter(viewerID, vw)

	log.Printf("[BROADCASTER] Added viewer %s to track %s (%d total viewers)",
		viewerID, tb.track.ID(), viewerCount)
}

// RemoveViewer removes a viewer from this broadcaster using copy-on-write
func (tb *TrackBroadcaster) RemoveViewer(viewerID string) {
	tb.mu.Lock()

	// Find the viewer in the slice
	var vw *viewerWriter
	viewerIndex := -1
	for i, v := range tb.viewers {
		if v.viewerID == viewerID {
			vw = v
			viewerIndex = i
			break
		}
	}

	// If viewer not found, return early
	if viewerIndex == -1 {
		tb.mu.Unlock()
		return
	}

	// Create a new slice without the removed viewer
	newViewers := make([]*viewerWriter, 0, len(tb.viewers)-1)
	newViewers = append(newViewers, tb.viewers[:viewerIndex]...)
	newViewers = append(newViewers, tb.viewers[viewerIndex+1:]...)

	// Swap the slice atomically
	tb.viewers = newViewers
	viewerCount := len(newViewers)

	tb.mu.Unlock()

	// Signal the viewer's writer goroutine to stop and close channels
	close(vw.stopCh)
	close(vw.packetCh)

	log.Printf("[BROADCASTER] Removed viewer %s from track %s (%d remaining viewers)",
		viewerID, tb.track.ID(), viewerCount)
}

// Stop stops the broadcaster and all its goroutines
func (tb *TrackBroadcaster) Stop() {
	// Signal main broadcaster to stop
	close(tb.stopCh)

	// Stop all viewer writers
	tb.mu.Lock()
	for _, vw := range tb.viewers {
		close(vw.stopCh)
		close(vw.packetCh)
		log.Printf("[BROADCASTER] Stopped writer for viewer %s on track %s", vw.viewerID, tb.track.ID())
	}
	tb.mu.Unlock()
}
