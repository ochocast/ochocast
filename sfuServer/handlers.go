package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/pion/webrtc/v4"
)

// Global WebRTC API with custom settings for NAT traversal
var webrtcAPI *webrtc.API

func init() {
	// Create a MediaEngine with default codecs
	mediaEngine := &webrtc.MediaEngine{}
	if err := mediaEngine.RegisterDefaultCodecs(); err != nil {
		log.Fatalf("[ICE] Failed to register default codecs: %v", err)
	}

	// Create a SettingEngine for advanced WebRTC configuration
	settingEngine := webrtc.SettingEngine{}

	// If a public IP is specified, use NAT1To1 mapping
	// This is useful when running behind a NAT (like in containers)
	publicIP := os.Getenv("PUBLIC_IP")
	if publicIP != "" {
		log.Printf("[ICE] Using NAT1To1 IP mapping: %s", publicIP)
		settingEngine.SetNAT1To1IPs([]string{publicIP}, webrtc.ICECandidateTypeHost)
	}

	// Enable ICE-TCP candidates for environments that don't support UDP
	if os.Getenv("ENABLE_ICE_TCP") == "true" {
		log.Printf("[ICE] ICE-TCP enabled")
		// Create a TCP listener for ICE
		tcpListener, err := net.ListenTCP("tcp", &net.TCPAddr{
			IP:   net.IP{0, 0, 0, 0},
			Port: 0, // Let the OS pick a port
		})
		if err == nil {
			log.Printf("[ICE] TCP listener created on %s", tcpListener.Addr().String())
			settingEngine.SetICETCPMux(webrtc.NewICETCPMux(nil, tcpListener, 8))
		} else {
			log.Printf("[ICE] Failed to create TCP listener: %v", err)
		}
	}

	// Create the WebRTC API with MediaEngine and SettingEngine
	webrtcAPI = webrtc.NewAPI(
		webrtc.WithMediaEngine(mediaEngine),
		webrtc.WithSettingEngine(settingEngine),
	)
}

// getWebRTCConfiguration returns the WebRTC configuration with ICE servers
// Supports STUN and optional TURN server via environment variables
func getWebRTCConfiguration() webrtc.Configuration {
	iceServers := []webrtc.ICEServer{}

	// Add STUN servers (default to Google's public STUN servers)
	stunServers := os.Getenv("STUN_SERVERS")
	if stunServers == "" {
		stunServers = "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"
	}
	stunURLs := strings.Split(stunServers, ",")
	for i := range stunURLs {
		stunURLs[i] = strings.TrimSpace(stunURLs[i])
	}
	iceServers = append(iceServers, webrtc.ICEServer{
		URLs: stunURLs,
	})

	// Add TURN server if configured (required for NAT traversal in containerized environments)
	turnServer := os.Getenv("TURN_SERVER")
	turnUsername := os.Getenv("TURN_USERNAME")
	turnPassword := os.Getenv("TURN_PASSWORD")

	if turnServer != "" && turnUsername != "" && turnPassword != "" {
		turnURLs := strings.Split(turnServer, ",")
		for i := range turnURLs {
			turnURLs[i] = strings.TrimSpace(turnURLs[i])
		}
		iceServers = append(iceServers, webrtc.ICEServer{
			URLs:       turnURLs,
			Username:   turnUsername,
			Credential: turnPassword,
		})
		log.Printf("[ICE] TURN server configured: %v", turnURLs)
	} else {
		log.Printf("[ICE] No TURN server configured (STUN only) - may fail behind symmetric NAT")
	}

	log.Printf("[ICE] Using ICE servers: STUN=%v", stunURLs)

	// If TURN is configured, we can optionally force relay-only mode
	// This ensures all traffic goes through TURN (useful for symmetric NAT)
	iceTransportPolicy := webrtc.ICETransportPolicyAll
	if turnServer != "" && os.Getenv("ICE_RELAY_ONLY") == "true" {
		iceTransportPolicy = webrtc.ICETransportPolicyRelay
		log.Printf("[ICE] Forcing relay-only mode (ICE_RELAY_ONLY=true)")
	}

	return webrtc.Configuration{
		ICEServers:         iceServers,
		ICETransportPolicy: iceTransportPolicy,
	}
}

// setCORSHeaders sets CORS headers for the response
func setCORSHeaders(w http.ResponseWriter, methods string) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", methods)
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

// handleHealthCheck handles the health check endpoint
func handleHealthCheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// handleCreateRoom handles the room creation endpoint
func handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	log.Printf("[ROOM] Create room request from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	var requestBody struct {
		RoomID string `json:"room_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if requestBody.RoomID == "" {
		http.Error(w, "room_id is required in request body", http.StatusBadRequest)
		return
	}

	key, alreadyExists, err := sfuServer.CreateRoom(requestBody.RoomID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Room created - control plane will handle propagation
	// Ne pas forcer l'origin ici, il sera déterminé quand le host se connecte
	response := map[string]interface{}{
		"room_id": requestBody.RoomID,
		"key":     key,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)

	if alreadyExists {
		log.Printf("[ROOM] Room already exists, returned existing: %s", requestBody.RoomID)
	} else {
		log.Printf("[ROOM] Room created: %s", requestBody.RoomID)
	}
}

// handleGetRoom handles the get room endpoint
func handleGetRoom(w http.ResponseWriter, r *http.Request) {
	log.Printf("[ROOM] Get room request from %s", r.RemoteAddr)

	setCORSHeaders(w, "GET, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	room, err := sfuServer.GetRoom(roomID)
	if err != nil {
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	response := map[string]string{
		"room_id": room.ID,
		"key":     room.Key,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
	log.Printf("[ROOM] Room retrieved: %s", roomID)
}

// handleRoomExists checks if a room exists and returns the WHIP URL if it does
func handleRoomExists(w http.ResponseWriter, r *http.Request) {
	log.Printf("[ROOM] Room exists check from %s", r.RemoteAddr)

	setCORSHeaders(w, "GET, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	room, err := sfuServer.GetRoom(roomID)
	if err != nil {
		// Room doesn't exist
		response := map[string]interface{}{
			"exists": false,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		log.Printf("[ROOM] Room does not exist: %s", roomID)
		return
	}

	// Room exists, return the WHIP URL
	serverURL := os.Getenv("SERVER_URL")
	if serverURL == "" {
		serverURL = "https://519ddacd-6411-4de9-886a-a2976087ac84.pub.instances.scw.cloud"
	}

	whipURL := fmt.Sprintf("%s/whip?room_id=%s&key=%s", serverURL, room.ID, room.Key)

	response := map[string]interface{}{
		"exists":   true,
		"room_id":  room.ID,
		"whip_url": whipURL,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
	log.Printf("[ROOM] Room exists: %s", roomID)
}

// handleStreamStatus handles the stream status check endpoint
func handleStreamStatus(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, "GET, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	isActive := sfuServer.IsStreamActive(roomID)

	response := map[string]bool{
		"active": isActive,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
	log.Printf("[STREAM-STATUS] Room %s status: %v", roomID, isActive)
}

// handleRoomViewerCount handles getting the viewer count for a specific room
func handleRoomViewerCount(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, "GET, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	room, err := sfuServer.GetRoom(roomID)
	if err != nil {
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	room.mu.RLock()
	viewerCount := len(room.Viewers)
	room.mu.RUnlock()

	response := map[string]interface{}{
		"room_id":      roomID,
		"viewer_count": viewerCount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
	log.Printf("[ROOM-VIEWERS] Room %s has %d viewer(s)", roomID, viewerCount)
}

// handleDeleteRoom handles the room deletion endpoint
func handleDeleteRoom(w http.ResponseWriter, r *http.Request) {
	log.Printf("[ROOM] Delete room request from %s", r.RemoteAddr)

	setCORSHeaders(w, "DELETE, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodDelete {
		http.Error(w, "Only DELETE is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	err := sfuServer.DeleteRoom(roomID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Room deleted successfully"))
	log.Printf("[ROOM] Room deleted: %s", roomID)
}

// handleWHIP handles the WHIP (WebRTC HTTP Ingestion Protocol) endpoint
func handleWHIP(w http.ResponseWriter, r *http.Request) {
	log.Printf("[WHIP] New WHIP connection from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
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

	// Get room_id from query parameters
	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		log.Printf("[WHIP] Missing room_id parameter")
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	// Get key from query parameters
	key := r.URL.Query().Get("key")
	if key == "" {
		log.Printf("[WHIP] Missing key parameter")
		http.Error(w, "key parameter is required", http.StatusBadRequest)
		return
	}

	// Get the room
	room, err := sfuServer.GetRoom(roomID)
	if err != nil {
		log.Printf("[WHIP] Room not found: %s", roomID)
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	// Verify the key
	if room.Key != key {
		log.Printf("[WHIP] Invalid key for room: %s", roomID)
		http.Error(w, "Invalid key", http.StatusUnauthorized)
		return
	}

	// ⭐ Cancel any pending cleanup if host is reconnecting
	if room.CancelScheduledCleanup() {
		log.Printf("[WHIP][ROOM-%s] Host reconnected within grace period, cleanup cancelled", roomID)
	}

	// ⭐ Ce serveur devient l'origin pour cette room (first come, first served)
	currentURL := os.Getenv("SERVER_URL")
	if currentURL == "" {
		// Construire l'URL à partir du port si SERVER_URL n'est pas défini
		serverPort := os.Getenv("SERVER_PORT")
		if serverPort == "" {
			serverPort = "8090"
		}
		currentURL = fmt.Sprintf("http://localhost:%s", serverPort)
	}

	becameOrigin := false
	room.mu.Lock()
	if room.OriginURL == "" {
		// Premier broadcaster pour cette room, ce serveur devient l'origin
		room.OriginURL = currentURL
		room.IsOrigin = true
		becameOrigin = true
		log.Printf("[WHIP] This server is now ORIGIN for room %s", roomID)
	} else if room.OriginURL != currentURL {
		// Un autre serveur est déjà l'origin
		room.mu.Unlock()
		log.Printf("[WHIP] Room %s already has origin at %s, rejecting", roomID, room.OriginURL)
		http.Error(w, fmt.Sprintf("Room already broadcasting from %s", room.OriginURL), http.StatusConflict)
		return
	}
	room.mu.Unlock()

	// Note: On notifiera les peers APRÈS que le stream soit actif (voir OnTrack)

	offerSDP, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[WHIP] Failed to read request body: %v", err)
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	log.Printf("[WHIP][ROOM-%s] Received SDP offer (%d bytes)", roomID, len(offerSDP))

	peerConnection, err := webrtcAPI.NewPeerConnection(getWebRTCConfiguration())
	if err != nil {
		log.Printf("[WHIP][ROOM-%s] Failed to create PeerConnection: %v", roomID, err)
		http.Error(w, "Failed to create PeerConnection", http.StatusInternalServerError)
		return
	}

	log.Printf("[WHIP][ROOM-%s] PeerConnection created successfully", roomID)

	// Store host connection in room
	room.mu.Lock()
	room.Host = peerConnection
	room.mu.Unlock()

	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		log.Printf("[WHIP][ROOM-%s] Received track: %s, codec: %s, ID: %s, StreamID: %s",
			roomID, track.Kind(), track.Codec().MimeType, track.ID(), track.StreamID())

		// Add track to room for broadcasting
		room.AddTrack(track)

		// Mark stream as active when first track is received
		room.mu.Lock()
		wasInactive := !room.StreamActive
		if wasInactive {
			room.StreamActive = true
			log.Printf("[WHIP][ROOM-%s] Stream marked as ACTIVE", roomID)
		}
		isOrigin := room.IsOrigin
		room.mu.Unlock()

		// Notifier les peers après un délai pour permettre à toutes les tracks d'arriver
		// (audio et vidéo arrivent généralement ensemble mais avec un léger décalage)
		if wasInactive && isOrigin && becameOrigin {
			log.Printf("[WHIP][ROOM-%s] First track received, stream is now active", roomID)
			// Control plane will manage cascade connections when viewers join
		}
	})

	// Track cleanup state to prevent multiple cleanup calls
	removed := false
	cleanupHost := func(reason string) {
		if removed {
			return
		}
		removed = true
		log.Printf("[WHIP][ROOM-%s] Host cleanup due to %s", roomID, reason)
		room.CleanupHost()
	}

	peerConnection.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		log.Printf("[WHIP][ROOM-%s] Connection state changed: %s", roomID, s.String())
		switch s {
		case webrtc.PeerConnectionStateDisconnected, webrtc.PeerConnectionStateFailed, webrtc.PeerConnectionStateClosed:
			cleanupHost("PC state=" + s.String())
		}
	})

	peerConnection.OnICEConnectionStateChange(func(s webrtc.ICEConnectionState) {
		log.Printf("[WHIP][ROOM-%s] ICE connection state changed: %s", roomID, s.String())
		switch s {
		case webrtc.ICEConnectionStateDisconnected, webrtc.ICEConnectionStateFailed, webrtc.ICEConnectionStateClosed:
			cleanupHost("ICE state=" + s.String())
		}
	})

	offer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  string(offerSDP),
	}
	if err := peerConnection.SetRemoteDescription(offer); err != nil {
		log.Printf("[WHIP][ROOM-%s] Failed to set remote description: %v", roomID, err)
		http.Error(w, "Failed to set remote description", http.StatusInternalServerError)
		return
	}

	log.Printf("[WHIP][ROOM-%s] Remote description set successfully", roomID)

	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		log.Printf("[WHIP][ROOM-%s] Failed to create answer: %v", roomID, err)
		http.Error(w, "Failed to create answer", http.StatusInternalServerError)
		return
	}

	log.Printf("[WHIP][ROOM-%s] Answer created successfully", roomID)

	if err = peerConnection.SetLocalDescription(answer); err != nil {
		log.Printf("[WHIP][ROOM-%s] Failed to set local description: %v", roomID, err)
		http.Error(w, "Failed to set local description", http.StatusInternalServerError)
		return
	}

	log.Printf("[WHIP][ROOM-%s] Local description set, waiting for ICE gathering...", roomID)

	// Log ICE candidates as they are gathered
	peerConnection.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate != nil {
			log.Printf("[WHIP][ROOM-%s] ICE candidate gathered: %s", roomID, candidate.String())
		}
	})

	<-webrtc.GatheringCompletePromise(peerConnection)

	log.Printf("[WHIP][ROOM-%s] ICE gathering complete", roomID)

	// Required by WHIP spec
	w.Header().Set("Location", fmt.Sprintf("/whip/%s", roomID))
	w.Header().Set("Content-Type", "application/sdp")
	w.WriteHeader(http.StatusCreated)

	answerSDP := peerConnection.LocalDescription().SDP
	log.Printf("[WHIP][ROOM-%s] Sending SDP answer (%d bytes)", roomID, len(answerSDP))

	_, _ = w.Write([]byte(answerSDP))
	log.Printf("[WHIP][ROOM-%s] Response sent successfully", roomID)
}

// handleCascadeSubscribe handles edge SFU subscribing to origin SFU
func handleCascadeSubscribe(w http.ResponseWriter, r *http.Request) {
	log.Printf("[CASCADE-SUB] New cascade subscription from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	// Get cascade authentication key
	cascadeKey := r.URL.Query().Get("cascade_key")
	expectedKey := getEnv("CASCADE_AUTH_KEY", "")
	if expectedKey != "" && cascadeKey != expectedKey {
		http.Error(w, "Invalid cascade key", http.StatusUnauthorized)
		return
	}

	room, err := sfuServer.GetRoom(roomID)
	if err != nil {
		log.Printf("[CASCADE-SUB] Room %s not found", roomID)
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	// Vérifier que ce serveur est bien l'origin pour cette room
	room.mu.RLock()
	isOrigin := room.IsOrigin
	streamActive := room.StreamActive
	broadcasterCount := len(room.Broadcasters)
	room.mu.RUnlock()

	if !isOrigin {
		log.Printf("[CASCADE-SUB] Rejected: this SFU is not origin for room %s", roomID)
		http.Error(w, "This SFU is not origin for this room", http.StatusForbidden)
		return
	}

	if !streamActive || broadcasterCount == 0 {
		log.Printf("[CASCADE-SUB] Rejected: stream not ready for room %s (active=%v, broadcasters=%d)", roomID, streamActive, broadcasterCount)
		http.Error(w, "Stream not ready yet", http.StatusServiceUnavailable)
		return
	}

	log.Printf("[CASCADE-SUB] Accepting cascade subscription for room %s (broadcasters: %d)", roomID, broadcasterCount)

	offerSDP, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	peerConnection, err := webrtcAPI.NewPeerConnection(getWebRTCConfiguration())
	if err != nil {
		http.Error(w, "Failed to create PeerConnection", http.StatusInternalServerError)
		return
	}

	// Register as downstream connection
	if err := sfuServer.RegisterDownstream(roomID, peerConnection); err != nil {
		log.Printf("[CASCADE-SUB] Failed to register downstream: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Treat downstream SFU like a viewer - add tracks
	cascadeID := fmt.Sprintf("cascade-%s", generateID())
	log.Printf("[CASCADE-SUB] Adding cascade viewer %s to room %s", cascadeID, roomID)
	if err := room.AddViewer(cascadeID, peerConnection); err != nil {
		log.Printf("[CASCADE-SUB] Failed to add viewer: %v", err)
		http.Error(w, "Failed to attach to broadcasts", http.StatusInternalServerError)
		return
	}

	log.Printf("[CASCADE-SUB] Cascade viewer %s added successfully", cascadeID)

	offer := webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: string(offerSDP)}
	if err := peerConnection.SetRemoteDescription(offer); err != nil {
		log.Printf("[CASCADE-SUB] Failed to set remote description: %v", err)
		http.Error(w, "Failed to set remote description", http.StatusInternalServerError)
		return
	}

	log.Printf("[CASCADE-SUB] Remote description set, creating answer...")

	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		log.Printf("[CASCADE-SUB] Failed to create answer: %v", err)
		http.Error(w, "Failed to create answer", http.StatusInternalServerError)
		return
	}

	if err = peerConnection.SetLocalDescription(answer); err != nil {
		http.Error(w, "Failed to set local description", http.StatusInternalServerError)
		return
	}

	<-webrtc.GatheringCompletePromise(peerConnection)

	answerSDP := peerConnection.LocalDescription().SDP
	w.Header().Set("Content-Type", "application/sdp")
	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(answerSDP))

	log.Printf("[CASCADE-SUB] Downstream SFU connected for room %s", roomID)
}

// handleCascadePublish handles edge SFU receiving stream from origin
func handleCascadePublish(w http.ResponseWriter, r *http.Request) {
	log.Printf("[CASCADE-PUB] New cascade publish from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	// Create or get room on edge SFU
	key := generateKey()
	room := NewRoom(roomID, key)

	sfuServer.mu.Lock()
	sfuServer.rooms[roomID] = room
	sfuServer.mu.Unlock()

	offerSDP, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	peerConnection, err := webrtcAPI.NewPeerConnection(getWebRTCConfiguration())
	if err != nil {
		http.Error(w, "Failed to create PeerConnection", http.StatusInternalServerError)
		return
	}

	room.mu.Lock()
	room.Host = peerConnection
	room.mu.Unlock()

	// Handle incoming tracks from upstream origin
	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		log.Printf("[CASCADE-PUB] Received cascaded track: %s from origin", track.ID())
		room.AddTrack(track)

		room.mu.Lock()
		if !room.StreamActive {
			room.StreamActive = true
			log.Printf("[CASCADE-PUB] Edge stream active for room %s", roomID)
		}
		room.mu.Unlock()
	})

	offer := webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: string(offerSDP)}
	if err := peerConnection.SetRemoteDescription(offer); err != nil {
		http.Error(w, "Failed to set remote description", http.StatusInternalServerError)
		return
	}

	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		http.Error(w, "Failed to create answer", http.StatusInternalServerError)
		return
	}

	if err = peerConnection.SetLocalDescription(answer); err != nil {
		http.Error(w, "Failed to set local description", http.StatusInternalServerError)
		return
	}

	<-webrtc.GatheringCompletePromise(peerConnection)

	answerSDP := peerConnection.LocalDescription().SDP
	w.Header().Set("Content-Type", "application/sdp")
	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(answerSDP))

	log.Printf("[CASCADE-PUB] Edge SFU connected to origin for room %s", roomID)
}

// handleCascadeDisconnect handles disconnecting from upstream for a room
func handleCascadeDisconnect(w http.ResponseWriter, r *http.Request) {
	log.Printf("[CASCADE-DISCONNECT] Disconnect request from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	// Disconnect upstream connection for this room
	sfuServer.mu.Lock()
	if conn, exists := sfuServer.upstreamConnections[roomID]; exists {
		if conn.PeerConnection != nil {
			conn.PeerConnection.Close()
		}
		delete(sfuServer.upstreamConnections, roomID)
		log.Printf("[CASCADE-DISCONNECT] Disconnected upstream connection for room %s", roomID)
	}

	// Remove parent SFU reference
	delete(sfuServer.parentSFU, roomID)
	sfuServer.mu.Unlock()

	// Optionally clean up the room if no viewers
	room, err := sfuServer.GetRoom(roomID)
	if err == nil {
		room.mu.RLock()
		viewerCount := len(room.Viewers)
		room.mu.RUnlock()

		if viewerCount == 0 {
			// No viewers left, delete the room
			sfuServer.mu.Lock()
			delete(sfuServer.rooms, roomID)
			sfuServer.mu.Unlock()
			log.Printf("[CASCADE-DISCONNECT] Deleted empty room %s", roomID)
		}
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Disconnected"))
}

// handleCascadeRemoveDownstream handles removing a downstream (relay) viewer from this SFU
func handleCascadeRemoveDownstream(w http.ResponseWriter, r *http.Request) {
	log.Printf("[CASCADE-REMOVE-DOWNSTREAM] Request from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	childSFUID := r.URL.Query().Get("child_sfu_id")
	if childSFUID == "" {
		http.Error(w, "child_sfu_id parameter is required", http.StatusBadRequest)
		return
	}

	// Find and close the downstream connection
	sfuServer.mu.Lock()
	if conn, exists := sfuServer.downstreamConnections[roomID]; exists {
		// Close the peer connection which will trigger viewer removal via OnConnectionStateChange
		if conn.PeerConnection != nil {
			conn.PeerConnection.Close()
			log.Printf("[CASCADE-REMOVE-DOWNSTREAM] Closed downstream connection for room %s (child: %s)", roomID, childSFUID)
		}
		delete(sfuServer.downstreamConnections, roomID)
	}

	// Also remove from children list
	if children, exists := sfuServer.childrenSFUs[roomID]; exists {
		newChildren := make([]string, 0, len(children))
		for _, child := range children {
			if child != childSFUID {
				newChildren = append(newChildren, child)
			}
		}
		if len(newChildren) > 0 {
			sfuServer.childrenSFUs[roomID] = newChildren
		} else {
			delete(sfuServer.childrenSFUs, roomID)
		}
	}
	sfuServer.mu.Unlock()

	// Also try to find and remove cascade viewer by searching for cascade-* prefix
	room, err := sfuServer.GetRoom(roomID)
	if err == nil {
		room.mu.Lock()
		// Find cascade viewers (they have IDs starting with "cascade-")
		for viewerID, pc := range room.Viewers {
			if len(viewerID) > 8 && viewerID[:8] == "cascade-" {
				// Close and remove this cascade viewer
				pc.Close()
				delete(room.Viewers, viewerID)
				log.Printf("[CASCADE-REMOVE-DOWNSTREAM] Removed cascade viewer %s from room %s", viewerID, roomID)
				break // Only one downstream per room typically
			}
		}
		room.mu.Unlock()
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Downstream removed"))
}

// handlePromoteViewer promotes a viewer to publisher (speaker)
func handlePromoteViewer(w http.ResponseWriter, r *http.Request) {
	log.Printf("[PROMOTE] Promote viewer request from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	key := r.URL.Query().Get("key")
	viewerID := r.URL.Query().Get("viewer_id")

	if roomID == "" || key == "" || viewerID == "" {
		http.Error(w, "room_id, key, and viewer_id are required", http.StatusBadRequest)
		return
	}

	room, err := sfuServer.GetRoom(roomID)
	if err != nil {
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	// Verify the key (only host can promote)
	if room.Key != key {
		http.Error(w, "Invalid key", http.StatusUnauthorized)
		return
	}

	// Read SDP offer from the viewer who wants to publish
	offerSDP, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Create new peer connection for the promoted viewer
	peerConnection, err := webrtcAPI.NewPeerConnection(getWebRTCConfiguration())
	if err != nil {
		http.Error(w, "Failed to create PeerConnection", http.StatusInternalServerError)
		return
	}

	publisherID := fmt.Sprintf("speaker-%s", viewerID)

	// Add this viewer as a publisher
	room.mu.Lock()
	room.Publishers[publisherID] = peerConnection
	room.mu.Unlock()

	log.Printf("[PROMOTE][ROOM-%s] Added publisher %s", roomID, publisherID)

	// Handle incoming tracks from the promoted viewer
	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		log.Printf("[PROMOTE][ROOM-%s] Received track from speaker %s: %s (kind: %s)",
			roomID, publisherID, track.ID(), track.Kind())
		room.AddTrack(track)
	})

	// Set up disconnect handlers
	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Printf("[PROMOTE][ROOM-%s] Publisher %s ICE connection state: %s", roomID, publisherID, state)
		if state == webrtc.ICEConnectionStateFailed ||
			state == webrtc.ICEConnectionStateDisconnected ||
			state == webrtc.ICEConnectionStateClosed {
			log.Printf("[PROMOTE][ROOM-%s] Publisher %s disconnected, removing", roomID, publisherID)
			room.RemovePublisher(publisherID)
		}
	})

	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Printf("[PROMOTE][ROOM-%s] Publisher %s connection state: %s", roomID, publisherID, state)
		if state == webrtc.PeerConnectionStateFailed ||
			state == webrtc.PeerConnectionStateDisconnected ||
			state == webrtc.PeerConnectionStateClosed {
			log.Printf("[PROMOTE][ROOM-%s] Publisher %s connection closed, removing", roomID, publisherID)
			room.RemovePublisher(publisherID)
		}
	})

	offer := webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: string(offerSDP)}
	if err := peerConnection.SetRemoteDescription(offer); err != nil {
		http.Error(w, "Failed to set remote description", http.StatusInternalServerError)
		return
	}

	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		http.Error(w, "Failed to create answer", http.StatusInternalServerError)
		return
	}

	if err = peerConnection.SetLocalDescription(answer); err != nil {
		http.Error(w, "Failed to set local description", http.StatusInternalServerError)
		return
	}

	<-webrtc.GatheringCompletePromise(peerConnection)

	answerSDP := peerConnection.LocalDescription().SDP
	w.Header().Set("Content-Type", "application/sdp")
	w.Header().Set("Location", fmt.Sprintf("/publisher/%s", publisherID))
	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(answerSDP))

	log.Printf("[PROMOTE][ROOM-%s] Viewer %s promoted to speaker %s", roomID, viewerID, publisherID)
}

// handleDemotePublisher demotes a speaker back to viewer
func handleDemotePublisher(w http.ResponseWriter, r *http.Request) {
	log.Printf("[DEMOTE] Demote publisher request from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	key := r.URL.Query().Get("key")
	publisherID := r.URL.Query().Get("publisher_id")

	if roomID == "" || key == "" || publisherID == "" {
		http.Error(w, "room_id, key, and publisher_id are required", http.StatusBadRequest)
		return
	}

	room, err := sfuServer.GetRoom(roomID)
	if err != nil {
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	// Verify the key (only host can demote)
	if room.Key != key {
		http.Error(w, "Invalid key", http.StatusUnauthorized)
		return
	}

	room.RemovePublisher(publisherID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":       "demoted",
		"publisher_id": publisherID,
	})

	log.Printf("[DEMOTE][ROOM-%s] Publisher %s demoted", roomID, publisherID)
}

// handleViewer handles the viewer connection endpoint
func handleViewer(w http.ResponseWriter, r *http.Request) {
	log.Printf("[VIEWER] New viewer connected from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		log.Printf("[VIEWER] Handling CORS preflight request")
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	// Get room_id from query parameters
	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		log.Printf("[VIEWER] Missing room_id parameter")
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	// Get the room
	room, err := sfuServer.GetRoom(roomID)
	if err != nil {
		log.Printf("[VIEWER] Room not found locally: %s", roomID)
		http.Error(w, "Room not found - use control plane /viewer endpoint", http.StatusNotFound)
		return
	}

	currentURL := os.Getenv("SERVER_URL")
	if currentURL == "" {
		// Construire l'URL à partir du port si non défini
		serverPort := os.Getenv("SERVER_PORT")
		if serverPort == "" {
			serverPort = "8090"
		}
		currentURL = fmt.Sprintf("http://localhost:%s", serverPort)
	}

	offerSDP, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	log.Printf("[VIEWER][ROOM-%s] Received SDP offer (%d bytes)", roomID, len(offerSDP))

	peerConnection, err := webrtcAPI.NewPeerConnection(getWebRTCConfiguration())
	if err != nil {
		http.Error(w, "Failed to create PeerConnection", http.StatusInternalServerError)
		return
	}

	viewerID := fmt.Sprintf("viewer-%s-%p", r.RemoteAddr, peerConnection)
	log.Printf("[VIEWER][ROOM-%s] Created viewer ID: %s", roomID, viewerID)

	if err := room.AddViewer(viewerID, peerConnection); err != nil {
		http.Error(w, "Failed to attach to broadcasts", http.StatusInternalServerError)
		return
	}

	offer := webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: string(offerSDP)}
	if err := peerConnection.SetRemoteDescription(offer); err != nil {
		http.Error(w, "Failed to set remote description", http.StatusInternalServerError)
		return
	}
	log.Printf("[VIEWER][ROOM-%s] Remote description set successfully", roomID)

	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		http.Error(w, "Failed to create answer", http.StatusInternalServerError)
		return
	}
	log.Printf("[VIEWER][ROOM-%s] Answer created successfully", roomID)

	if err = peerConnection.SetLocalDescription(answer); err != nil {
		http.Error(w, "Failed to set local description", http.StatusInternalServerError)
		return
	}
	log.Printf("[VIEWER][ROOM-%s] Local description set, waiting for ICE gathering...", roomID)

	<-webrtc.GatheringCompletePromise(peerConnection)
	log.Printf("[VIEWER][ROOM-%s] ICE gathering complete", roomID)

	answerSDP := peerConnection.LocalDescription().SDP
	w.Header().Set("Content-Type", "application/sdp")
	_, _ = w.Write([]byte(answerSDP))
	log.Printf("[VIEWER][ROOM-%s] Sending SDP answer (%d bytes)", roomID, len(answerSDP))
	log.Printf("[VIEWER][ROOM-%s] Response sent successfully", roomID)
}

// handleRecorder handles the recorder connection endpoint
// 🎬 RECORDER: Uses dedicated tracks with NO packet drop for lossless recording
func handleRecorder(w http.ResponseWriter, r *http.Request) {
	log.Printf("[RECORDER] 🎬 New recorder connected from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		log.Printf("[RECORDER] Handling CORS preflight request")
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	// Get room_id from query parameters
	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		log.Printf("[RECORDER] Missing room_id parameter")
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	// Get the room
	room, err := sfuServer.GetRoom(roomID)
	if err != nil {
		log.Printf("[RECORDER] Room not found: %s", roomID)
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	// Check if stream is active
	room.mu.RLock()
	streamActive := room.StreamActive
	broadcasterCount := len(room.Broadcasters)
	room.mu.RUnlock()

	if !streamActive || broadcasterCount == 0 {
		log.Printf("[RECORDER] Stream not ready for room %s (active=%v, broadcasters=%d)", roomID, streamActive, broadcasterCount)
		http.Error(w, "Stream not ready yet", http.StatusServiceUnavailable)
		return
	}

	offerSDP, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	log.Printf("[RECORDER][ROOM-%s] 🎬 Received SDP offer (%d bytes)", roomID, len(offerSDP))

	peerConnection, err := webrtcAPI.NewPeerConnection(getWebRTCConfiguration())
	if err != nil {
		http.Error(w, "Failed to create PeerConnection", http.StatusInternalServerError)
		return
	}

	recorderID := fmt.Sprintf("recorder-%s-%p", r.RemoteAddr, peerConnection)
	log.Printf("[RECORDER][ROOM-%s] 🎬 Created recorder ID: %s", roomID, recorderID)

	// 🎬 Use AddRecorder instead of AddViewer for dedicated no-drop tracks
	if err := room.AddRecorder(recorderID, peerConnection); err != nil {
		http.Error(w, "Failed to attach to broadcasts", http.StatusInternalServerError)
		return
	}

	offer := webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: string(offerSDP)}
	if err := peerConnection.SetRemoteDescription(offer); err != nil {
		http.Error(w, "Failed to set remote description", http.StatusInternalServerError)
		return
	}
	log.Printf("[RECORDER][ROOM-%s] 🎬 Remote description set successfully", roomID)

	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		http.Error(w, "Failed to create answer", http.StatusInternalServerError)
		return
	}
	log.Printf("[RECORDER][ROOM-%s] 🎬 Answer created successfully", roomID)

	if err = peerConnection.SetLocalDescription(answer); err != nil {
		http.Error(w, "Failed to set local description", http.StatusInternalServerError)
		return
	}
	log.Printf("[RECORDER][ROOM-%s] 🎬 Local description set, waiting for ICE gathering...", roomID)

	<-webrtc.GatheringCompletePromise(peerConnection)
	log.Printf("[RECORDER][ROOM-%s] 🎬 ICE gathering complete", roomID)

	answerSDP := peerConnection.LocalDescription().SDP
	w.Header().Set("Content-Type", "application/sdp")
	_, _ = w.Write([]byte(answerSDP))
	log.Printf("[RECORDER][ROOM-%s] 🎬 Sending SDP answer (%d bytes)", roomID, len(answerSDP))
	log.Printf("[RECORDER][ROOM-%s] 🎬 Recorder connected with DEDICATED tracks (lossless quality!)", roomID)
}

// handleClusterRegister handles registration of peer SFU servers
func handleClusterRegister(w http.ResponseWriter, r *http.Request) {
	log.Printf("[CLUSTER] Register request from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	var requestBody struct {
		URL string `json:"url"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Deprecated endpoint - control plane handles SFU registration
	http.Error(w, "Deprecated - use control plane /control/register_sfu endpoint", http.StatusGone)
}

// handleClusterPeers returns the list of peer SFU servers
func handleClusterPeers(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, "GET, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	// Deprecated endpoint - control plane handles topology
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"server_url": sfuServer.serverURL,
		"message":    "Use control plane /control/topology endpoint for cluster information",
		"peers":      []string{},
		"peer_count": 0,
	})
}

// handleSyncCreateRoom handles the synchronized room creation from peer SFUs
func handleSyncCreateRoom(w http.ResponseWriter, r *http.Request) {
	log.Printf("[ROOM] Sync create room request from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	var requestBody struct {
		RoomID string `json:"room_id"`
		Key    string `json:"key"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if requestBody.RoomID == "" || requestBody.Key == "" {
		http.Error(w, "room_id and key are required in request body", http.StatusBadRequest)
		return
	}

	// Create the room with the provided key
	if err := sfuServer.CreateRoomWithKey(requestBody.RoomID, requestBody.Key); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "created",
		"room_id": requestBody.RoomID,
	})

	log.Printf("[ROOM] Room synchronized: %s", requestBody.RoomID)
}

// handleCascadeRequestSubscribe handles the request from origin to subscribe to a room
// This is called by the control plane to set up a relay cascade connection
func handleCascadeRequestSubscribe(w http.ResponseWriter, r *http.Request) {
	log.Printf("[CASCADE] Request subscribe from %s", r.RemoteAddr)

	setCORSHeaders(w, "POST, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	var requestBody struct {
		RoomID    string `json:"room_id"`
		OriginURL string `json:"origin_url"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if requestBody.RoomID == "" || requestBody.OriginURL == "" {
		http.Error(w, "room_id and origin_url are required", http.StatusBadRequest)
		return
	}

	log.Printf("[CASCADE] Processing subscription request: room=%s, origin=%s", requestBody.RoomID, requestBody.OriginURL)

	// Vérifier si la room existe déjà localement
	room, err := sfuServer.GetRoom(requestBody.RoomID)
	if err == nil {
		// Room existe déjà
		room.mu.Lock()
		if room.IsOrigin {
			// Ce serveur est déjà l'origin, on ignore
			room.mu.Unlock()
			log.Printf("[CASCADE] Already origin for room %s, ignoring subscription request", requestBody.RoomID)
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"status": "already_origin"})
			return
		}
		if room.OriginURL == requestBody.OriginURL && room.StreamActive {
			// Déjà connecté à cet origin et stream actif
			room.mu.Unlock()
			log.Printf("[CASCADE] Already subscribed to %s for room %s (stream active)", requestBody.OriginURL, requestBody.RoomID)
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"status": "already_subscribed"})
			return
		}
		room.mu.Unlock()
	}

	// Se connecter à l'origin en cascade - SYNCHRONOUSLY so CP knows if it worked
	log.Printf("[CASCADE] Connecting to origin %s for room %s...", requestBody.OriginURL, requestBody.RoomID)
	if err := sfuServer.ConnectToUpstreamForRoom(requestBody.RoomID, requestBody.OriginURL); err != nil {
		log.Printf("[CASCADE] Failed to connect to origin: %v", err)
		http.Error(w, fmt.Sprintf("Failed to connect to origin: %v", err), http.StatusBadGateway)
		return
	}

	log.Printf("[CASCADE] Successfully connected to origin %s for room %s", requestBody.OriginURL, requestBody.RoomID)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":     "connected",
		"room_id":    requestBody.RoomID,
		"origin_url": requestBody.OriginURL,
	})
}
