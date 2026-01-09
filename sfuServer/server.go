package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/pion/webrtc/v3"

	"whip-server/internal/models"
	"whip-server/pkg/metrics"
)

// NewSFUServer creates a new SFUServer instance
func NewSFUServer() *SFUServer {
	mode := os.Getenv("SFU_MODE")
	if mode == "" {
		mode = "hybrid" // Default to hybrid mode
	}
	serverURL := os.Getenv("SERVER_URL")
	if serverURL == "" {
		// Construire l'URL à partir du port si non défini
		serverPort := os.Getenv("SERVER_PORT")
		if serverPort == "" {
			serverPort = "8090"
		}
		serverURL = fmt.Sprintf("http://localhost:%s", serverPort)
	}

	// Generate or get SFU ID
	sfuID := os.Getenv("SFU_ID")
	if sfuID == "" {
		sfuID = generateID() // Use existing ID generator
		log.Printf("[SFU] Generated SFU ID: %s", sfuID)
	}

	// Get control plane URL
	controlPlaneURL := os.Getenv("CONTROL_PLANE_URL")

	server := &SFUServer{
		rooms:                 make(map[string]*Room),
		mode:                  mode,
		serverURL:             serverURL,
		peerSFUs:              make(map[string]*PeerSFU),
		upstreamConnections:   make(map[string]*CascadeConnection),
		downstreamConnections: make(map[string]*CascadeConnection),
		sfuID:                 sfuID,
		controlPlaneURL:       controlPlaneURL,
		parentSFU:             make(map[string]string),
		childrenSFUs:          make(map[string][]string),
	}

	// Initialize metrics collector if control plane is configured
	if controlPlaneURL != "" {
		log.Printf("[SFU] Control plane URL: %s", controlPlaneURL)

		// Create metrics collector
		metricsInterval := 5 * time.Second // Send metrics every 5 seconds
		collector := metrics.NewCollector(sfuID, serverURL, controlPlaneURL, metricsInterval)

		// Set callback to get room statistics
		collector.SetRoomStatsCallback(func() (activeHosts, activeViewers int) {
			return server.GetRoomStats()
		})

		// Set callback to get detailed per-room statistics
		collector.SetDetailedStatsCallback(func() map[string]models.RoomStats {
			return server.GetDetailedRoomStats()
		})

		server.metricsCollector = collector

		// Register with control plane
		go server.registerWithControlPlane()

		// Start metrics collection
		collector.Start()
		log.Printf("[SFU] Metrics collector started (interval: %v)", metricsInterval)
	} else {
		log.Printf("[SFU] No control plane configured, running in standalone mode")
	}

	return server
}

// GetRoomStats returns the total number of active hosts and viewers across all rooms
func (s *SFUServer) GetRoomStats() (activeHosts, activeViewers int) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, room := range s.rooms {
		room.mu.RLock()
		if room.StreamActive {
			activeHosts++
		}
		activeViewers += len(room.Viewers)
		room.mu.RUnlock()
	}

	return activeHosts, activeViewers
}

// GetDetailedRoomStats returns per-room statistics
func (s *SFUServer) GetDetailedRoomStats() map[string]models.RoomStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := make(map[string]models.RoomStats)
	for roomID, room := range s.rooms {
		room.mu.RLock()
		stats[roomID] = models.RoomStats{
			ViewerCount: len(room.Viewers),
			IsActive:    room.StreamActive,
		}
		room.mu.RUnlock()
	}

	return stats
}

// registerWithControlPlane registers this SFU with the control plane
func (s *SFUServer) registerWithControlPlane() {
	if s.controlPlaneURL == "" {
		return
	}

	registration := models.SFURegistration{
		SFUID:     s.sfuID,
		ServerURL: s.serverURL,
		Region:    os.Getenv("SFU_REGION"),
		Zone:      os.Getenv("SFU_ZONE"),
	}

	jsonData, err := json.Marshal(registration)
	if err != nil {
		log.Printf("[SFU] Failed to marshal registration: %v", err)
		return
	}

	url := fmt.Sprintf("%s/control/register_sfu", s.controlPlaneURL)
	resp, err := http.Post(url, "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		log.Printf("[SFU] Failed to register with control plane: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		log.Printf("[SFU] Successfully registered with control plane")
	} else {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[SFU] Failed to register with control plane: %s - %s", resp.Status, string(body))
	}
}

// CreateRoom creates a new room or returns an existing one
func (s *SFUServer) CreateRoom(roomID string) (key string, alreadyExists bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if room already exists
	if existingRoom, exists := s.rooms[roomID]; exists {
		log.Printf("[SFU] Room %s already exists, returning existing key", roomID)
		return existingRoom.Key, true, nil
	}

	key = generateKey()
	room := NewRoom(roomID, key)
	s.rooms[roomID] = room

	log.Printf("[SFU] Created room %s with key %s", roomID, key)
	return key, false, nil
}

// CreateRoomWithKey creates a new room with a specific key (used for synchronization)
// If the room already exists with the same key, it's a no-op (idempotent)
// If the room already exists with a different key, update the key (control plane is source of truth)
func (s *SFUServer) CreateRoomWithKey(roomID, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if room already exists
	if existingRoom, exists := s.rooms[roomID]; exists {
		if existingRoom.Key != key {
			// Control plane is source of truth - update the key
			log.Printf("[SFU] Room %s exists with different key, updating key (control plane sync)", roomID)
			existingRoom.Key = key
		} else {
			log.Printf("[SFU] Room %s already exists with same key", roomID)
		}
		return nil
	}

	room := NewRoom(roomID, key)
	s.rooms[roomID] = room

	log.Printf("[SFU] Created room %s with provided key %s", roomID, key)
	return nil
}

// IsStreamActive checks if a stream is active for a given room
func (s *SFUServer) IsStreamActive(roomID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	room, exists := s.rooms[roomID]
	if !exists {
		return false
	}

	room.mu.RLock()
	defer room.mu.RUnlock()
	return room.StreamActive
}

// DeleteRoom deletes a room and closes all its connections
func (s *SFUServer) DeleteRoom(roomID string) error {
	s.mu.Lock()
	room, exists := s.rooms[roomID]
	if !exists {
		s.mu.Unlock()
		return fmt.Errorf("room %s not found", roomID)
	}
	delete(s.rooms, roomID)
	s.mu.Unlock()

	room.Close()
	log.Printf("[SFU] Deleted room %s", roomID)
	return nil
}

// GetRoom retrieves a room by its ID
func (s *SFUServer) GetRoom(roomID string) (*Room, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	room, exists := s.rooms[roomID]
	if !exists {
		return nil, fmt.Errorf("room %s not found", roomID)
	}
	return room, nil
}

// RegisterPeerSFU registers another SFU server in the cluster
func (s *SFUServer) RegisterPeerSFU(peerURL string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.peerSFUs[peerURL]; !exists {
		s.peerSFUs[peerURL] = &PeerSFU{
			URL:      peerURL,
			Active:   true,
			LastSeen: 0,
		}
		log.Printf("[CLUSTER] Registered peer SFU: %s", peerURL)
	}
}

// GetPeerSFUs returns the list of peer SFU servers
func (s *SFUServer) GetPeerSFUs() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	peers := make([]string, 0, len(s.peerSFUs))
	for url, peer := range s.peerSFUs {
		if peer.Active {
			peers = append(peers, url)
		}
	}
	return peers
}

// DetermineOriginForRoom determines which SFU should be origin for a room
// Uses consistent hashing based on room ID
func (s *SFUServer) DetermineOriginForRoom(roomID string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Get all available SFUs (including this one)
	allSFUs := []string{s.serverURL}
	for url, peer := range s.peerSFUs {
		if peer.Active {
			allSFUs = append(allSFUs, url)
		}
	}

	if len(allSFUs) == 0 {
		return s.serverURL, true
	}

	// Simple consistent hashing: use room ID to determine origin
	hash := 0
	for _, char := range roomID {
		hash = hash*31 + int(char)
	}
	if hash < 0 {
		hash = -hash
	}
	originIndex := hash % len(allSFUs)
	originURL := allSFUs[originIndex]

	isThisServer := originURL == s.serverURL
	log.Printf("[CLUSTER] Room %s origin: %s (isThisServer: %v)", roomID, originURL, isThisServer)

	return originURL, isThisServer
}

// ConnectToUpstream connects this edge SFU to an origin SFU
func (s *SFUServer) ConnectToUpstream(roomID, upstreamURL string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.mode != "edge" {
		return fmt.Errorf("only edge SFUs can connect to upstream")
	}

	connID := generateID()
	conn := &CascadeConnection{
		ID:     connID,
		RoomID: roomID,
		Type:   "upstream",
		URL:    upstreamURL,
	}

	s.upstreamConnections[roomID] = conn
	log.Printf("[CASCADE] Connected to upstream SFU: %s for room %s", upstreamURL, roomID)

	return nil
}

// RegisterDownstream registers a downstream edge SFU connection
func (s *SFUServer) RegisterDownstream(roomID string, pc *webrtc.PeerConnection) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.mode != "origin" && s.mode != "hybrid" {
		return fmt.Errorf("only origin/hybrid SFUs can have downstream connections")
	}

	connID := generateID()
	conn := &CascadeConnection{
		ID:             connID,
		PeerConnection: pc,
		RoomID:         roomID,
		Type:           "downstream",
	}

	s.downstreamConnections[connID] = conn
	log.Printf("[CASCADE] Registered downstream SFU for room %s", roomID)

	return nil
}

// ConnectToUpstreamForRoom connects this SFU to the origin SFU for a specific room
func (s *SFUServer) ConnectToUpstreamForRoom(roomID, originURL string) error {
	s.mu.Lock()

	// Vérifier si la room existe et si elle est déjà connectée en cascade
	if existingRoom, exists := s.rooms[roomID]; exists {
		existingRoom.mu.RLock()
		isAlreadyConnected := existingRoom.Host != nil && existingRoom.OriginURL == originURL
		existingRoom.mu.RUnlock()

		if isAlreadyConnected {
			s.mu.Unlock()
			log.Printf("[EDGE] Already connected to origin %s for room %s", originURL, roomID)
			return nil
		}

		// La room existe mais n'est pas connectée en cascade, on va la connecter
		log.Printf("[EDGE] Room %s exists locally, connecting to origin %s", roomID, originURL)
		existingRoom.mu.Lock()
		existingRoom.IsOrigin = false
		existingRoom.OriginURL = originURL
		existingRoom.mu.Unlock()
		s.mu.Unlock()
	} else {
		// Créer la room localement comme edge
		newRoom := NewRoom(roomID, "") // Pas de key pour les edges
		newRoom.IsOrigin = false
		newRoom.OriginURL = originURL
		s.rooms[roomID] = newRoom
		s.mu.Unlock()
		log.Printf("[EDGE] Created new room %s as edge", roomID)
	}

	log.Printf("[EDGE] Connecting to origin %s for room %s", originURL, roomID)

	// Récupérer la room pour l'utiliser
	s.mu.RLock()
	room := s.rooms[roomID]
	s.mu.RUnlock()

	// Créer une peer connection pour recevoir le stream de l'origin
	peerConnection, err := webrtcAPI.NewPeerConnection(getWebRTCConfiguration())
	if err != nil {
		return fmt.Errorf("failed to create peer connection: %w", err)
	}

	// Ajouter des transceivers pour recevoir audio et vidéo
	if _, err = peerConnection.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionRecvonly,
	}); err != nil {
		return fmt.Errorf("failed to add video transceiver: %w", err)
	}

	if _, err = peerConnection.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionRecvonly,
	}); err != nil {
		return fmt.Errorf("failed to add audio transceiver: %w", err)
	}

	// Gérer les tracks reçues de l'origin
	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		log.Printf("[EDGE] Received track from origin: %s (kind: %s, codec: %s)",
			track.ID(), track.Kind(), track.Codec().MimeType)
		room.AddTrack(track)

		room.mu.Lock()
		room.StreamActive = true
		log.Printf("[EDGE] Stream marked as ACTIVE for room %s", roomID)
		room.mu.Unlock()
	})

	// Ajouter des handlers pour le state
	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Printf("[EDGE] Cascade connection state for room %s: %s", roomID, state.String())
	})

	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Printf("[EDGE] Cascade ICE connection state for room %s: %s", roomID, state.String())
	})

	// Créer une offer
	offer, err := peerConnection.CreateOffer(nil)
	if err != nil {
		return fmt.Errorf("failed to create offer: %w", err)
	}

	if err = peerConnection.SetLocalDescription(offer); err != nil {
		return fmt.Errorf("failed to set local description: %w", err)
	}

	// Attendre que les ICE candidates soient rassemblés
	<-webrtc.GatheringCompletePromise(peerConnection)

	// Envoyer l'offer à l'origin SFU avec retry
	cascadeKey := os.Getenv("CASCADE_AUTH_KEY")
	subscribeURL := fmt.Sprintf("%s/cascade/subscribe?room_id=%s&cascade_key=%s",
		originURL, roomID, cascadeKey)

	log.Printf("[EDGE] Sending offer to origin: %s", subscribeURL)

	var resp *http.Response
	maxRetries := 5
	retryDelay := time.Second * 2

	for attempt := 1; attempt <= maxRetries; attempt++ {
		resp, err = http.Post(subscribeURL, "application/sdp",
			strings.NewReader(peerConnection.LocalDescription().SDP))
		if err != nil {
			log.Printf("[EDGE] Attempt %d/%d failed: %v", attempt, maxRetries, err)
			if attempt < maxRetries {
				time.Sleep(retryDelay)
				continue
			}
			return fmt.Errorf("failed to connect to origin after %d attempts: %w", maxRetries, err)
		}

		log.Printf("[EDGE] Origin response status: %d (attempt %d/%d)", resp.StatusCode, attempt, maxRetries)

		if resp.StatusCode == http.StatusCreated {
			break // Succès !
		}

		// Si le stream n'est pas prêt (503), on réessaie
		if resp.StatusCode == http.StatusServiceUnavailable {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			log.Printf("[EDGE] Stream not ready yet: %s (attempt %d/%d)", string(body), attempt, maxRetries)
			if attempt < maxRetries {
				time.Sleep(retryDelay)
				continue
			}
			return fmt.Errorf("stream not ready after %d attempts", maxRetries)
		}

		// Autres erreurs
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return fmt.Errorf("origin rejected connection: %s - %s", resp.Status, string(body))
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("origin rejected connection: %s - %s", resp.Status, string(body))
	}

	answerSDP, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read answer: %w", err)
	}

	answer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  string(answerSDP),
	}

	if err = peerConnection.SetRemoteDescription(answer); err != nil {
		return fmt.Errorf("failed to set remote description: %w", err)
	}

	room.mu.Lock()
	room.Host = peerConnection
	room.mu.Unlock()

	log.Printf("[EDGE] Successfully connected to origin for room %s", roomID)
	return nil
}

// PropagateRoomCreation propagates room creation to all peer SFUs
func (s *SFUServer) PropagateRoomCreation(roomID, key string) {
	peers := s.GetPeerSFUs()
	if len(peers) == 0 {
		log.Printf("[CLUSTER] No peer SFUs to propagate room creation to")
		return
	}

	log.Printf("[CLUSTER] Propagating room creation for %s to %d peer(s)", roomID, len(peers))

	for _, peerURL := range peers {
		go func(url string) {
			if err := s.sendRoomCreationToPeer(url, roomID, key); err != nil {
				log.Printf("[CLUSTER] Failed to propagate room to %s: %v", url, err)
			} else {
				log.Printf("[CLUSTER] Successfully propagated room %s to %s", roomID, url)
			}
		}(peerURL)
	}
}

// sendRoomCreationToPeer sends a room creation request to a peer SFU
func (s *SFUServer) sendRoomCreationToPeer(peerURL, roomID, key string) error {
	url := fmt.Sprintf("%s/room/sync-create", peerURL)

	payload := map[string]string{
		"room_id": roomID,
		"key":     key,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	resp, err := http.Post(url, "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("peer returned error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// NotifyPeersToSubscribe notifies all peer SFUs to subscribe to this origin for a room
func (s *SFUServer) NotifyPeersToSubscribe(roomID string) {
	peers := s.GetPeerSFUs()
	if len(peers) == 0 {
		log.Printf("[CLUSTER] No peer SFUs to notify for room %s", roomID)
		return
	}

	log.Printf("[CLUSTER] Notifying %d peer(s) to subscribe to room %s", len(peers), roomID)

	for _, peerURL := range peers {
		go func(url string) {
			if err := s.requestPeerToSubscribe(url, roomID); err != nil {
				log.Printf("[CLUSTER] Failed to notify peer %s for room %s: %v", url, roomID, err)
			} else {
				log.Printf("[CLUSTER] Successfully notified peer %s to subscribe to room %s", url, roomID)
			}
		}(peerURL)
	}
}

// requestPeerToSubscribe requests a peer SFU to subscribe to this origin for a room
func (s *SFUServer) requestPeerToSubscribe(peerURL, roomID string) error {
	url := fmt.Sprintf("%s/cascade/request-subscribe", peerURL)

	payload := map[string]string{
		"room_id":    roomID,
		"origin_url": s.serverURL,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	resp, err := http.Post(url, "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("peer returned error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
