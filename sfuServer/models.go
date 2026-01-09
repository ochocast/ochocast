package main

import (
	"sync"
	"time"

	"github.com/pion/webrtc/v3"

	"whip-server/pkg/metrics"
)

// viewerWriter handles writing packets to a single viewer
type viewerWriter struct {
	viewerID string
	track    *webrtc.TrackLocalStaticRTP
	packetCh chan []byte
	stopCh   chan struct{}
}

// TrackBroadcaster manages broadcasting a single track to multiple viewers
// ⚡ OPTIMIZED: Direct write to sharedTrack, no viewer dispatch needed
// ⚡ NEW: Async buffering with writeQueueCh to prevent freezes on RTCP storms
type TrackBroadcaster struct {
	track        *webrtc.TrackRemote
	sharedTrack  *webrtc.TrackLocalStaticRTP // ⚡ Direct write target (replaces viewer dispatch)
	viewers      []*viewerWriter             // Deprecated: kept for backward compatibility
	mu           sync.RWMutex
	packetCh     chan []byte // Deprecated: no longer used
	writeQueueCh chan []byte // ⚡ NEW: Async write queue to buffer during RTCP storms
	stopCh       chan struct{}
}

// Room represents a streaming room with multiple publishers and viewers
type Room struct {
	ID           string
	Key          string
	Host         *webrtc.PeerConnection            // Primary host (backward compatibility)
	Publishers   map[string]*webrtc.PeerConnection // Multiple publishers (host + promoted speakers)
	Broadcasters map[string]*TrackBroadcaster
	Viewers      map[string]*webrtc.PeerConnection
	StreamActive bool
	IsOrigin     bool                          // True if this SFU is origin for this room
	OriginURL    string                        // URL of origin SFU if this is an edge
	PeerSFUs     map[string]*CascadeConnection // Other SFUs connected to this room
	mu           sync.RWMutex

	// ⚡ OPTIMIZATION: SharedTracks reused by all viewers (no M*N allocations!)
	SharedTracks map[string]*webrtc.TrackLocalStaticRTP

	// Grace period for host reconnection
	cleanupTimer     *time.Timer // Timer for scheduled cleanup
	cleanupScheduled bool        // Whether cleanup is scheduled
}

// CascadeConnection represents a connection to another SFU (upstream or downstream)
type CascadeConnection struct {
	ID             string
	PeerConnection *webrtc.PeerConnection
	RoomID         string
	Type           string // "upstream" or "downstream"
	URL            string
}

// PeerSFU represents another SFU server in the cluster
type PeerSFU struct {
	URL      string
	Active   bool
	LastSeen int64 // Unix timestamp
}

// SFUServer manages multiple rooms
type SFUServer struct {
	rooms                 map[string]*Room
	mu                    sync.RWMutex
	mode                  string                        // "hybrid" (default), "standalone"
	serverURL             string                        // This server's public URL
	peerSFUs              map[string]*PeerSFU           // Other SFU servers in the cluster
	upstreamConnections   map[string]*CascadeConnection // For edge mode (per room)
	downstreamConnections map[string]*CascadeConnection // For origin mode (per room)

	// New fields for control plane integration
	sfuID            string              // Unique identifier for this SFU
	controlPlaneURL  string              // URL of the control plane
	metricsCollector *metrics.Collector  // Metrics collector instance
	parentSFU        map[string]string   // roomID -> parent SFU URL
	childrenSFUs     map[string][]string // roomID -> children SFU URLs
}
