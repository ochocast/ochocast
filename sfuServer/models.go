package main

import (
	"sync"

	"github.com/pion/webrtc/v3"
)

// viewerWriter handles writing packets to a single viewer
type viewerWriter struct {
	track    *webrtc.TrackLocalStaticRTP
	packetCh chan []byte
	stopCh   chan struct{}
}

// TrackBroadcaster manages broadcasting a single track to multiple viewers
type TrackBroadcaster struct {
	track     *webrtc.TrackRemote
	viewers   map[string]*viewerWriter
	mu        sync.RWMutex
	packetCh  chan []byte
	stopCh    chan struct{}
}

// Room represents a streaming room with one host and multiple viewers
type Room struct {
	ID           string
	Key          string
	Host         *webrtc.PeerConnection
	Broadcasters map[string]*TrackBroadcaster
	Viewers      map[string]*webrtc.PeerConnection
	mu           sync.RWMutex
}

// SFUServer manages multiple rooms
type SFUServer struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}
