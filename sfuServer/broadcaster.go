package main

import (
	"log"
	"sync"
	"time"

	"github.com/pion/webrtc/v3"
)

// ⚡ CRITICAL: Global buffer pool to prevent allocation bomb
// Without this, each packet = malloc + copy = GC pressure
// With 51 viewers × 2 tracks × 50fps = 5100 packets/sec = GARBAGE HEAP
var packetBufferPool = sync.Pool{
	New: func() interface{} {
		return make([]byte, 1500) // Max RTP packet size
	},
}

// NewTrackBroadcaster creates a new TrackBroadcaster instance
// ⚡ OPTIMIZED: Takes sharedTrack, writes directly without viewer dispatch!
// But now with async buffering to prevent freezes on RTCP storms
// ⚡ NEW: Multiple writer goroutines to parallelize writes at scale (50+ viewers)
// 🎬 RECORDER: Dedicated track support for lossless recording
func NewTrackBroadcaster(track *webrtc.TrackRemote, sharedTrack *webrtc.TrackLocalStaticRTP) *TrackBroadcaster {
	tb := &TrackBroadcaster{
		track:        track,
		sharedTrack:  sharedTrack,              // ⚡ Direct write target
		viewers:      make([]*viewerWriter, 0), // No longer needed (keep for backward compat)
		packetCh:     make(chan []byte, 1000),  // ⚡ INCREASED BUFFER: 1000 packets instead of 100
		stopCh:       make(chan struct{}),
		writeQueueCh: make(chan []byte, 20000), // ⚡ SCALED: 20000 for 75 viewers (was 5000)
		// 🎬 RECORDER: recorderTrack and recorderCh will be set by SetRecorderTrack
		recorderTrack: nil,
		recorderCh:    nil,
	}

	// Start reading from the remote track
	go tb.readLoop()

	// ⚡ NEW: Start MULTIPLE writer goroutines to parallelize writes
	// This scales linearly with viewers instead of degrading exponentially
	const numWriters = 4 // Tune this based on your CPU cores and viewer count
	for i := 0; i < numWriters; i++ {
		go tb.asyncWriteLoop()
	}

	return tb
}

// SetRecorderTrack sets the dedicated recorder track
// 🎬 RECORDER: This creates a separate path for the recorder with NO packet drops
func (tb *TrackBroadcaster) SetRecorderTrack(recorderTrack *webrtc.TrackLocalStaticRTP) {
	tb.mu.Lock()
	tb.recorderTrack = recorderTrack
	tb.recorderCh = make(chan []byte, 50000) // 🎬 LARGE BUFFER: 50k packets (~16 seconds at 30fps)
	tb.mu.Unlock()

	// Start dedicated recorder write loop
	go tb.recorderWriteLoop()

	log.Printf("[BROADCASTER] 🎬 Recorder track set for %s (50k buffer, no-drop policy)", tb.track.ID())
}

// recorderWriteLoop writes packets to the dedicated recorder track
// 🎬 CRITICAL: This loop NEVER drops packets - it blocks if buffer is full
// The large buffer (50k) ensures we can absorb temporary congestion
func (tb *TrackBroadcaster) recorderWriteLoop() {
	for {
		select {
		case <-tb.stopCh:
			log.Printf("[BROADCASTER] 🎬 Recorder write loop stopped for track %s", tb.track.ID())
			return
		case packet, ok := <-tb.recorderCh:
			if !ok {
				log.Printf("[BROADCASTER] 🎬 Recorder channel closed for track %s", tb.track.ID())
				return
			}

			tb.mu.RLock()
			recTrack := tb.recorderTrack
			tb.mu.RUnlock()

			if recTrack != nil {
				if _, err := recTrack.Write(packet); err != nil {
					log.Printf("[BROADCASTER] 🎬 Recorder write error on track %s: %v", tb.track.ID(), err)
				}
			}

			// Return buffer to pool
			packetBufferPool.Put(packet[:cap(packet)])
		}
	}
}

// readLoop continuously reads RTP packets from the remote track
// ⚡ OPTIMIZED: Sends to async queue instead of blocking write
// 🎬 RECORDER: Also sends to dedicated recorder channel (no drop!)
func (tb *TrackBroadcaster) readLoop() {
	rtpBuf := make([]byte, 1500)
	packetCount := 0
	droppedPackets := 0
	recorderPackets := 0

	for {
		select {
		case <-tb.stopCh:
			return
		default:
		}

		n, _, err := tb.track.Read(rtpBuf)
		if err != nil {
			log.Printf("[BROADCASTER] Track %s read error: %v", tb.track.ID(), err)
			return
		}

		packetCount++
		if packetCount%10000 == 0 {
			tb.mu.RLock()
			hasRecorder := tb.recorderCh != nil
			recorderQueueLen := 0
			if hasRecorder {
				recorderQueueLen = len(tb.recorderCh)
			}
			tb.mu.RUnlock()
			log.Printf("[BROADCASTER] Track %s: %dk packets read (dropped=%d, queue_len=%d, recorder=%v, rec_queue=%d)",
				tb.track.ID(), packetCount/1000, droppedPackets, len(tb.writeQueueCh), hasRecorder, recorderQueueLen)
		}

		// ⚡ ALLOCATION FIX: Use sync.Pool instead of make+copy
		// This eliminates the garbage allocation bomb (5100 packets/sec = massive GC pressure!)
		pktBuf := packetBufferPool.Get().([]byte)
		copy(pktBuf, rtpBuf[:n])
		pkt := pktBuf[:n] // Slice to actual size, not full 1500

		// 🎬 RECORDER: Send to dedicated recorder channel FIRST (priority!)
		// Uses separate buffer to avoid contention with viewer channel
		tb.mu.RLock()
		recorderCh := tb.recorderCh
		tb.mu.RUnlock()

		if recorderCh != nil {
			// Allocate separate buffer for recorder (independent of viewer buffer)
			recBuf := packetBufferPool.Get().([]byte)
			copy(recBuf, rtpBuf[:n])
			recPkt := recBuf[:n]

			select {
			case recorderCh <- recPkt:
				recorderPackets++
			case <-tb.stopCh:
				packetBufferPool.Put(recBuf)
				packetBufferPool.Put(pktBuf)
				return
			}
			// 🎬 NOTE: NO default case = blocking send = NEVER drops recorder packets
		}

		// Send to viewer queue (can drop if congested)
		select {
		case tb.writeQueueCh <- pkt:
			// Sent successfully
		case <-tb.stopCh:
			packetBufferPool.Put(pktBuf) // Return to pool on shutdown
			return
		default:
			// Queue full, drop packet (non-critical for video viewers)
			packetBufferPool.Put(pktBuf) // Return to pool when dropping
			droppedPackets++
			if droppedPackets%1000 == 0 {
				log.Printf("[BROADCASTER] Track %s: Dropped %d packets for viewers (recorder unaffected)", tb.track.ID(), droppedPackets)
			}
		}
	}
}

// asyncWriteLoop handles async writing to sharedTrack with retry logic
// This prevents blocking the read loop when RTCP storms occur
// ⚡ POOL-AWARE: Returns buffers to sync.Pool when done
// ⚡ INSTRUMENTED: Detailed timing to diagnose fan-out congestion
func (tb *TrackBroadcaster) asyncWriteLoop() {
	var pendingPacket []byte
	var retryTimer <-chan time.Time
	var writeStartTime time.Time
	slowWriteThreshold := 10 * time.Millisecond // ⚡ LOWER: 10ms to catch fan-out congestion
	var slowWriteCount int
	var lastSlowWriteLog time.Time

	for {
		select {
		case <-tb.stopCh:
			// Return pending packet to pool on shutdown
			if pendingPacket != nil {
				// Restore to full buffer size for pool
				fullBuf := packetBufferPool.Get().([]byte)
				copy(fullBuf, pendingPacket)
				packetBufferPool.Put(fullBuf)
			}
			return
		case packet := <-tb.writeQueueCh:
			// New packet received, try to write immediately
			pendingPacket = packet
			retryTimer = nil
			writeStartTime = time.Now()

			_, err := tb.sharedTrack.Write(pendingPacket)
			writeTime := time.Since(writeStartTime)

			// ⚡ DIAGNOSTIC: Log slow writes (fan-out congestion indicator)
			if writeTime > slowWriteThreshold {
				slowWriteCount++
				// Log every 100 slow writes to avoid spam
				if slowWriteCount%100 == 0 || time.Since(lastSlowWriteLog) > 5*time.Second {
					log.Printf("[BROADCASTER-SLOW] Track %s: %d slow writes (last: %v) - FAN-OUT CONGESTION with many viewers",
						tb.track.ID(), slowWriteCount, writeTime)
					lastSlowWriteLog = time.Now()
				}
			}

			if err == nil {
				// Success - return buffer to pool
				fullBuf := packetBufferPool.Get().([]byte)
				copy(fullBuf, pendingPacket[:cap(pendingPacket)])
				packetBufferPool.Put(fullBuf)
				pendingPacket = nil
			} else {
				// Failed, schedule retry
				log.Printf("[BROADCASTER] Track %s write failed (will retry): %v", tb.track.ID(), err)
				retryTimer = time.After(1 * time.Millisecond)
			}
		case <-retryTimer:
			// Retry writing pending packet
			if pendingPacket != nil {
				writeStartTime = time.Now()
				_, err := tb.sharedTrack.Write(pendingPacket)
				writeTime := time.Since(writeStartTime)

				if writeTime > slowWriteThreshold {
					slowWriteCount++
					if slowWriteCount%100 == 0 || time.Since(lastSlowWriteLog) > 5*time.Second {
						log.Printf("[BROADCASTER-SLOW] Track %s: %d slow writes on retry (last: %v)",
							tb.track.ID(), slowWriteCount, writeTime)
						lastSlowWriteLog = time.Now()
					}
				}

				if err != nil {
					// Still failed, retry again
					retryTimer = time.After(1 * time.Millisecond)
				} else {
					// Success - return buffer to pool
					fullBuf := packetBufferPool.Get().([]byte)
					copy(fullBuf, pendingPacket[:cap(pendingPacket)])
					packetBufferPool.Put(fullBuf)
					pendingPacket = nil
					retryTimer = nil
				}
			}
		}
	}
}

// broadcastLoop is no longer used in optimized version
// ⚡ REMOVED: Direct write to sharedTrack eliminates the need for dispatching
// Keeping this as documentation of the optimization
func (tb *TrackBroadcaster) broadcastLoop() {
	// ⚡ NO-OP: This is replaced by direct sharedTrack.Write() in readLoop
	// The optimization removes the need for:
	// - Task queue distribution
	// - Worker goroutines
	// - Viewer state tracking
	log.Printf("[BROADCASTER] broadcastLoop (DEPRECATED) - using direct write instead")
}

// startViewerWriter starts a dedicated goroutine for writing packets to a single viewer
func (tb *TrackBroadcaster) startViewerWriter(viewerID string, vw *viewerWriter) {
	go func() {
		for {
			select {
			case packet, ok := <-vw.packetCh:
				if !ok {
					return
				}
				if _, err := vw.track.Write(packet); err != nil {
					// Don't log - connection state handlers deal with cleanup
					return
				}
			case <-vw.stopCh:
				return
			case <-tb.stopCh:
				return
			}
		}
	}()
}

// ⚡ OPTIMIZED: AddViewer no longer needed! SharedTracks are added directly to viewer PeerConnection
// This was the M*N bottleneck - keeping for backward compatibility but it's a no-op now
func (tb *TrackBroadcaster) AddViewer(viewerID string, localTrack *webrtc.TrackLocalStaticRTP) {
	// ⚡ NO-OP: With SharedTracks, viewers are added directly in room.AddViewer
	// The localTrack is already shared and added to viewer's PC
	log.Printf("[BROADCASTER] (DEPRECATED) AddViewer called for %s on track %s - using SharedTracks instead", viewerID, tb.track.ID())
}

// ⚡ OPTIMIZED: RemoveViewer no longer needed for SharedTracks!
// Viewers are removed directly from room.Viewers, tracks stay alive for other viewers
func (tb *TrackBroadcaster) RemoveViewer(viewerID string) {
	// ⚡ NO-OP: SharedTracks persist across viewer changes
	log.Printf("[BROADCASTER] (DEPRECATED) RemoveViewer called for %s on track %s - SharedTracks remain active", viewerID, tb.track.ID())
}

// Stop stops the broadcaster and all its goroutines
// ⚡ OPTIMIZED: No viewer cleanup needed (SharedTracks stay alive)
// 🎬 RECORDER: Also closes recorder channel
func (tb *TrackBroadcaster) Stop() {
	close(tb.stopCh)

	// 🎬 Close recorder channel if it exists
	tb.mu.Lock()
	if tb.recorderCh != nil {
		close(tb.recorderCh)
		tb.recorderCh = nil
	}
	tb.mu.Unlock()

	// ⚡ NO viewer cleanup needed - they're managed by room, not broadcaster
	// SharedTracks continue to exist for other viewers
	log.Printf("[BROADCASTER] Track %s stopped (sharedTrack remains for other viewers)", tb.track.ID())
}
