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

// roomTransitions / workerTransitions define the allowed lifecycle moves.
// ponytail: these maps ARE the state machines — edit them to retune, no code changes needed.
var roomTransitions = map[models.RoomState][]models.RoomState{
	models.RoomProvisioning: {models.RoomReady, models.RoomFailed, models.RoomTerminated},
	models.RoomReady:        {models.RoomDraining, models.RoomFailed},
	models.RoomFailed:       {models.RoomProvisioning, models.RoomTerminated},
	models.RoomDraining:     {models.RoomReady, models.RoomTerminated},
	models.RoomTerminated:   {}, // terminal
}

var workerTransitions = map[models.WorkerState][]models.WorkerState{
	models.WorkerProvisioning: {models.WorkerRegistered, models.WorkerFailed, models.WorkerTerminated},
	models.WorkerRegistered:   {models.WorkerReady, models.WorkerUnavailable, models.WorkerFailed, models.WorkerTerminated},
	models.WorkerReady:        {models.WorkerUnavailable, models.WorkerDraining, models.WorkerTerminated},
	models.WorkerUnavailable:  {models.WorkerReady, models.WorkerDraining, models.WorkerFailed, models.WorkerTerminated},
	models.WorkerDraining:     {models.WorkerReady, models.WorkerTerminated},
	models.WorkerFailed:       {models.WorkerProvisioning, models.WorkerTerminated},
	models.WorkerTerminated:   {}, // terminal
}

// allowed reports whether from -> to is in the transition table. Re-setting the
// same state is always allowed (idempotent retries).
func allowed[S comparable](table map[S][]S, from, to S) bool {
	if from == to {
		return true
	}
	for _, s := range table[from] {
		if s == to {
			return true
		}
	}
	return false
}

// CanTransition reports whether a room may move from -> to.
func CanTransition(from, to models.RoomState) bool { return allowed(roomTransitions, from, to) }

// CanWorkerTransition reports whether a worker may move from -> to.
func CanWorkerTransition(from, to models.WorkerState) bool {
	return allowed(workerTransitions, from, to)
}

// Store is a file-backed persistent store of room lifecycle records. State is
// held in a single JSON file rewritten atomically on every mutation — adequate
// for the low-traffic cold-start control-plane. Swap for a DB-backed store if
// the "which database owns lifecycle state" open question is ever resolved.
type Store struct {
	path    string
	mu      sync.RWMutex
	rooms   map[string]models.RoomLifecycle
	workers map[string]models.WorkerRecord
}

// persisted is the on-disk shape of the store.
type persisted struct {
	Rooms   map[string]models.RoomLifecycle `json:"rooms"`
	Workers map[string]models.WorkerRecord  `json:"workers"`
}

// New opens (or creates) a Store backed by the JSON file at path, loading any
// previously persisted records so state survives a control-plane restart.
func New(path string) (*Store, error) {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("lifecycle store dir: %w", err)
		}
	}
	s := &Store{
		path:    path,
		rooms:   make(map[string]models.RoomLifecycle),
		workers: make(map[string]models.WorkerRecord),
	}
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
	var p persisted
	if err := json.Unmarshal(data, &p); err != nil {
		return fmt.Errorf("decode lifecycle store: %w", err)
	}
	if p.Rooms != nil {
		s.rooms = p.Rooms
	}
	if p.Workers != nil {
		s.workers = p.Workers
	}
	return nil
}

// flush persists the current state atomically (temp file + rename). Holds s.mu.
func (s *Store) flush() error {
	data, err := json.MarshalIndent(persisted{Rooms: s.rooms, Workers: s.workers}, "", "  ")
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

// EnsureRoomProvisioning idempotently returns the room's lifecycle record,
// creating it in `provisioning` only if no active record exists. created=false
// means a retried request found an in-flight or ready room, so the caller MUST
// NOT start a second provisioning cycle (and thus avoids a duplicate Instance).
func (s *Store) EnsureRoomProvisioning(roomID string) (rec models.RoomLifecycle, created bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	prev, had := s.rooms[roomID]
	if had && prev.State != models.RoomTerminated && prev.State != models.RoomFailed {
		return prev, false, nil
	}

	now := time.Now().UTC()
	rl := models.RoomLifecycle{RoomID: roomID, State: models.RoomProvisioning, CreatedAt: now, UpdatedAt: now}
	s.rooms[roomID] = rl
	if err := s.flush(); err != nil {
		if had {
			s.rooms[roomID] = prev
		} else {
			delete(s.rooms, roomID)
		}
		return models.RoomLifecycle{}, false, fmt.Errorf("persist lifecycle: %w", err)
	}
	return rl, true, nil
}

// WorkerForRoom returns an existing reusable worker assigned to roomID, if any.
// "Reusable" means not failed and not terminated — i.e. it is being provisioned
// or is serving the room — so the autoscaler reuses it instead of creating a
// duplicate Scaleway Instance for a retried room creation.
func (s *Store) WorkerForRoom(roomID string) (models.WorkerRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, w := range s.workers {
		if w.RoomID == roomID && w.State != models.WorkerTerminated && w.State != models.WorkerFailed {
			return w, true
		}
	}
	return models.WorkerRecord{}, false
}

// GetWorker returns the worker record for sfuID.
func (s *Store) GetWorker(sfuID string) (models.WorkerRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	w, ok := s.workers[sfuID]
	return w, ok
}

// ListWorkers returns all persisted worker records.
func (s *Store) ListWorkers() []models.WorkerRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.WorkerRecord, 0, len(s.workers))
	for _, w := range s.workers {
		out = append(out, w)
	}
	return out
}

// UpsertWorker inserts a new worker record (keyed by SFUID) or transitions an
// existing one. A new worker, or reuse of a terminated worker's id, starts a
// fresh record; an existing worker must follow a valid state transition.
// CreatedAt is preserved across updates; UpdatedAt and TerminatedAt are managed.
func (s *Store) UpsertWorker(w models.WorkerRecord) (models.WorkerRecord, error) {
	if w.SFUID == "" {
		return models.WorkerRecord{}, fmt.Errorf("worker record requires sfu_id")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	prev, ok := s.workers[w.SFUID]
	if ok && prev.State != models.WorkerTerminated {
		if !CanWorkerTransition(prev.State, w.State) {
			return prev, fmt.Errorf("invalid worker transition %s -> %s for sfu %s", prev.State, w.State, w.SFUID)
		}
		w.CreatedAt = prev.CreatedAt
		if w.ReadyAt == nil {
			w.ReadyAt = prev.ReadyAt
		}
	} else {
		w.CreatedAt = now
	}
	w.UpdatedAt = now
	if w.State == models.WorkerTerminated && w.TerminatedAt == nil {
		t := now
		w.TerminatedAt = &t
	}
	s.workers[w.SFUID] = w
	if err := s.flush(); err != nil {
		if ok {
			s.workers[w.SFUID] = prev
		} else {
			delete(s.workers, w.SFUID)
		}
		return prev, fmt.Errorf("persist worker: %w", err)
	}
	return w, nil
}
