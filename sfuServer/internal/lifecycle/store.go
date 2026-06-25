// Package lifecycle holds the persistent room (and, later, worker) lifecycle
// state for the on-demand SFU control-plane.
package lifecycle

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"whip-server/internal/models"
)

// roomTransitions defines the allowed room state moves.
// ponytail: this map IS the state machine — edit it to retune, no code changes needed.
var roomTransitions = map[models.RoomState][]models.RoomState{
	models.RoomProvisioning: {models.RoomReady, models.RoomFailed, models.RoomTerminated},
	models.RoomReady:        {models.RoomDraining, models.RoomFailed},
	models.RoomFailed:       {models.RoomProvisioning, models.RoomTerminated},
	models.RoomDraining:     {models.RoomReady, models.RoomTerminated},
	models.RoomTerminated:   {}, // terminal
}

// CanTransition reports whether a room may move from -> to. Re-setting the same
// state is allowed (idempotent retries).
func CanTransition(from, to models.RoomState) bool {
	if from == to {
		return true
	}
	for _, s := range roomTransitions[from] {
		if s == to {
			return true
		}
	}
	return false
}

// Store is a file-backed persistent store of room lifecycle records. State is
// held in a single JSON file rewritten atomically on every mutation — adequate
// for the low-traffic cold-start control-plane. Swap for a DB-backed store if
// the "which database owns lifecycle state" open question is ever resolved.
type Store struct {
	path  string
	mu    sync.RWMutex
	rooms map[string]models.RoomLifecycle
}

// New opens (or creates) a Store backed by the JSON file at path, loading any
// previously persisted records so room state survives a control-plane restart.
func New(path string) (*Store, error) {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("lifecycle store dir: %w", err)
		}
	}
	s := &Store{path: path, rooms: make(map[string]models.RoomLifecycle)}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) load() error {
	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) || len(data) == 0 {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read lifecycle store: %w", err)
	}
	rooms := make(map[string]models.RoomLifecycle)
	if err := json.Unmarshal(data, &rooms); err != nil {
		return fmt.Errorf("decode lifecycle store: %w", err)
	}
	s.rooms = rooms
	return nil
}

// flush persists the current state atomically (temp file + rename). Holds s.mu.
func (s *Store) flush() error {
	data, err := json.MarshalIndent(s.rooms, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Get returns the lifecycle record for roomID.
func (s *Store) Get(roomID string) (models.RoomLifecycle, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rl, ok := s.rooms[roomID]
	return rl, ok
}

// List returns all persisted room lifecycle records.
func (s *Store) List() []models.RoomLifecycle {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.RoomLifecycle, 0, len(s.rooms))
	for _, rl := range s.rooms {
		out = append(out, rl)
	}
	return out
}

// Upsert creates a new room record in the given state, or transitions an
// existing one. A new room, or reuse of a terminated room's id, starts a fresh
// lifecycle; an existing room must follow a valid transition. The updated
// record is persisted before returning.
func (s *Store) Upsert(roomID string, state models.RoomState, reason string) (models.RoomLifecycle, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	prev, ok := s.rooms[roomID]
	var rl models.RoomLifecycle
	// A new room, or reuse of a terminated room's ID, starts a fresh lifecycle.
	if !ok || prev.State == models.RoomTerminated {
		rl = models.RoomLifecycle{RoomID: roomID, State: state, Reason: reason, CreatedAt: now, UpdatedAt: now}
	} else {
		if !CanTransition(prev.State, state) {
			return prev, fmt.Errorf("invalid room transition %s -> %s for room %s", prev.State, state, roomID)
		}
		rl = prev
		rl.State = state
		rl.Reason = reason
		rl.UpdatedAt = now
	}
	s.rooms[roomID] = rl
	if err := s.flush(); err != nil {
		// Persist failed: roll back so an error means nothing changed.
		if ok {
			s.rooms[roomID] = prev
		} else {
			delete(s.rooms, roomID)
		}
		return prev, fmt.Errorf("persist lifecycle: %w", err)
	}
	return rl, nil
}
