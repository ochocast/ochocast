package main

import (
	"fmt"
	"log"
)

// NewSFUServer creates a new SFUServer instance
func NewSFUServer() *SFUServer {
	return &SFUServer{
		rooms: make(map[string]*Room),
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
