package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/pion/webrtc/v3"
)

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

	response := map[string]string{
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

	offerSDP, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[WHIP] Failed to read request body: %v", err)
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	log.Printf("[WHIP][ROOM-%s] Received SDP offer (%d bytes)", roomID, len(offerSDP))

	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{})
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
	})

	peerConnection.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		log.Printf("[WHIP][ROOM-%s] Connection state changed: %s", roomID, s.String())
	})

	peerConnection.OnICEConnectionStateChange(func(s webrtc.ICEConnectionState) {
		log.Printf("[WHIP][ROOM-%s] ICE connection state changed: %s", roomID, s.String())
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
		log.Printf("[VIEWER] Room not found: %s", roomID)
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	offerSDP, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	log.Printf("[VIEWER][ROOM-%s] Received SDP offer (%d bytes)", roomID, len(offerSDP))

	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{})
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
