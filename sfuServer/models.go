package main

import (
	"sync"

	"github.com/pion/webrtc/v3"
)

// viewerWriter handles writing packets to a single viewer
type viewerWriter struct {
	viewerID string
	track    *webrtc.TrackLocalStaticRTP
	packetCh chan []byte
	stopCh   chan struct{}
}

// TrackBroadcaster manages broadcasting a single track to multiple viewers
type TrackBroadcaster struct {
	track    *webrtc.TrackRemote
	viewers  []*viewerWriter
	mu       sync.RWMutex
	packetCh chan []byte
	stopCh   chan struct{}
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
}
