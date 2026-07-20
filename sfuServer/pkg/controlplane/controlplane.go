package controlplane

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"whip-server/internal/lifecycle"
	"whip-server/internal/models"
)

// Global HTTP client with connection pooling and keep-alive
var httpClient = &http.Client{
	Timeout: 5 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		MaxConnsPerHost:     10,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		DisableKeepAlives:     false,
		ResponseHeaderTimeout: 5 * time.Second,
	},
}

// Global HTTP client for longer operations (cascade setup)
var httpClientLong = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        50,
		MaxIdleConnsPerHost: 5,
		MaxConnsPerHost:     5,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		DisableKeepAlives:     false,
		ResponseHeaderTimeout: 30 * time.Second,
	},
}

// Goroutine semaphore for controlling concurrency
type semaphore struct {
	ch chan struct{}
}

func newSemaphore(max int) *semaphore {
	return &semaphore{ch: make(chan struct{}, max)}
}

func (s *semaphore) acquire() {
	s.ch <- struct{}{}
}

func (s *semaphore) release() {
	<-s.ch
}

// ControlPlane manages the global SFU topology and load balancing
type ControlPlane struct {
	sfus               map[string]*SFUInfo             // SFUID -> SFU information
	rooms              map[string]*models.RoomTopology // RoomID -> Room topology
	mu                 sync.RWMutex
	maxFanout          int             // Maximum children per SFU node
	rebalanceThreshold float64         // Load threshold to trigger rebalance
	relayCreating      map[string]bool // RoomID -> true if relay creation in progress
	relayMu            sync.Mutex      // Mutex for relay creation tracking

	// Grace period for host reconnection
	pendingCleanups map[string]*time.Timer // RoomID -> cleanup timer
	cleanupMu       sync.Mutex

	// Semaphore for limiting concurrent goroutines
	syncSemaphore *semaphore

	// Persistent room lifecycle state (provisioning/ready/failed/draining/terminated).
	// nil if the backing store could not be opened — room state then lives only in memory.
	roomState *lifecycle.Store

	// provisioner creates on-demand SFU capacity. nil when no autoscaler is
	// configured, in which case room creation hard-fails on "no active SFUs" as
	// before.
	provisioner capacityEnsurer

	// Externally reachable TLS endpoint used in streamer-facing WHIP URLs.
	// Empty falls back to the host and forwarding headers of the HTTP request.
	publicURL string
}

// capacityEnsurer provisions on-demand SFU capacity for a room. Implemented by
// autoscaler.Provisioner and stubbed in tests. Kept as an interface so the
// control-plane package does not import the autoscaler (and to make the
// cold-start path testable).
type capacityEnsurer interface {
	EnsureCapacity(ctx context.Context, roomID string) (models.WorkerRecord, error)
	ReleaseCapacity(ctx context.Context, roomID string) error
}

// SetProvisioner wires an autoscaler into the control-plane. With one set, a
// room created when no SFU is ready enters the provisioning path instead of
// failing.
func (cp *ControlPlane) SetProvisioner(p capacityEnsurer) {
	cp.mu.Lock()
	defer cp.mu.Unlock()
	cp.provisioner = p
}

// SetPublicURL configures the externally reachable control-plane base URL.
func (cp *ControlPlane) SetPublicURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return fmt.Errorf("invalid control-plane public URL %q", raw)
	}
	cp.mu.Lock()
	cp.publicURL = strings.TrimRight(raw, "/")
	cp.mu.Unlock()
	return nil
}

// LifecycleStore returns the control-plane's persistent lifecycle store so the
// autoscaler can share it. nil if the store could not be opened.
func (cp *ControlPlane) LifecycleStore() *lifecycle.Store { return cp.roomState }

// Grace period before cleaning up room topology when stream ends
// This allows the host to reconnect (e.g., OBS stop/start) without losing the room
const TopologyCleanupGracePeriod = 10 * time.Minute

// SFUInfo stores information about a registered SFU
type SFUInfo struct {
	ID            string
	URL           string
	Region        string
	Zone          string
	Metrics       *models.SFUMetrics
	LastHeartbeat time.Time
	Active        bool
}

type operatorSFUStatus struct {
	ID            string    `json:"id"`
	URL           string    `json:"url"`
	Region        string    `json:"region,omitempty"`
	Zone          string    `json:"zone,omitempty"`
	Active        bool      `json:"active"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
	CPU           float64   `json:"cpu,omitempty"`
	Memory        float64   `json:"memory,omitempty"`
	ActiveHosts   int       `json:"active_hosts,omitempty"`
	ActiveViewers int       `json:"active_viewers,omitempty"`
}

type operatorFailureStatus struct {
	Kind   string `json:"kind"`
	ID     string `json:"id"`
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"`
}

type operatorStatusCounts struct {
	RegisteredSFUs int                        `json:"registered_sfus"`
	ActiveSFUs     int                        `json:"active_sfus"`
	RoomsByState   map[models.RoomState]int   `json:"rooms_by_state"`
	WorkersByState map[models.WorkerState]int `json:"workers_by_state"`
}

type operatorStatusResponse struct {
	GeneratedAt             time.Time               `json:"generated_at"`
	LifecycleStoreAvailable bool                    `json:"lifecycle_store_available"`
	Counts                  operatorStatusCounts    `json:"counts"`
	RegisteredSFUs          []operatorSFUStatus     `json:"registered_sfus"`
	Rooms                   []models.RoomLifecycle  `json:"rooms"`
	Workers                 []models.WorkerRecord   `json:"workers"`
	ProvisioningFailures    []operatorFailureStatus `json:"provisioning_failures"`
	PendingCleanupRooms     []string                `json:"pending_cleanup_rooms"`
}

// NewControlPlane creates a new control plane instance
func NewControlPlane(maxFanout int, rebalanceThreshold float64) *ControlPlane {
	cp := &ControlPlane{
		sfus:               make(map[string]*SFUInfo),
		rooms:              make(map[string]*models.RoomTopology),
		maxFanout:          maxFanout,
		rebalanceThreshold: rebalanceThreshold,
		relayCreating:      make(map[string]bool),
		pendingCleanups:    make(map[string]*time.Timer),
		syncSemaphore:      newSemaphore(5), // Max 5 concurrent sync operations
	}

	// Open the persistent room lifecycle store. Failure is non-fatal: the
	// control-plane still serves traffic, just without restart-durable room state.
	statePath := os.Getenv("CONTROL_PLANE_STATE_FILE")
	if statePath == "" {
		statePath = "controlplane-state/rooms.json"
	}
	if store, err := lifecycle.New(statePath); err != nil {
		log.Printf("[CP] lifecycle store unavailable (%v); room state will not persist", err)
	} else {
		cp.roomState = store
		log.Printf("[CP] lifecycle store %s recovered %d room(s)", statePath, len(store.List()))
	}

	// Start background tasks
	go cp.healthCheckLoop()

	return cp
}

// healthCheckLoop periodically checks for inactive SFUs
func (cp *ControlPlane) healthCheckLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		cp.mu.Lock()
		now := time.Now()
		for sfuID, sfu := range cp.sfus {
			if now.Sub(sfu.LastHeartbeat) > 30*time.Second {
				log.Printf("[CP] SFU %s is inactive (last heartbeat: %v ago)",
					sfuID, now.Sub(sfu.LastHeartbeat))
				sfu.Active = false
				// TODO: Trigger rebalance for affected rooms
			}
		}
		cp.mu.Unlock()
	}
}

// RegisterSFU registers a new SFU with the control plane
func (cp *ControlPlane) RegisterSFU(reg *models.SFURegistration) error {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	if reg.SFUID == "" || reg.ServerURL == "" {
		return fmt.Errorf("sfu_id and server_url are required")
	}

	sfu := &SFUInfo{
		ID:            reg.SFUID,
		URL:           reg.ServerURL,
		Region:        reg.Region,
		Zone:          reg.Zone,
		LastHeartbeat: time.Now(),
		Active:        true,
	}

	cp.sfus[reg.SFUID] = sfu
	log.Printf("[CP] Registered SFU: %s (%s)", reg.SFUID, reg.ServerURL)

	// Advance a provisioned worker from `provisioning` to `registered`; a healthy
	// heartbeat then promotes it to `ready` (task 5.3).
	cp.promoteWorker(reg.SFUID, false)

	return nil
}

// UpdateMetrics updates metrics for a SFU (from heartbeat)
func (cp *ControlPlane) UpdateMetrics(metrics *models.SFUMetrics) error {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	sfu, exists := cp.sfus[metrics.SFUID]
	if !exists {
		// Auto-register if not registered
		sfu = &SFUInfo{
			ID:     metrics.SFUID,
			URL:    metrics.ServerURL,
			Active: true,
		}
		cp.sfus[metrics.SFUID] = sfu
		log.Printf("[CP] Auto-registered SFU from heartbeat: %s", metrics.SFUID)
	}

	sfu.Metrics = metrics
	sfu.LastHeartbeat = time.Now()
	sfu.Active = true

	// Check if any room needs rebalancing based on new metrics
	healthy := metrics.CPU <= cp.rebalanceThreshold && metrics.Memory <= cp.rebalanceThreshold
	if !healthy {
		log.Printf("[CP] SFU %s is overloaded (CPU: %.2f%%, Mem: %.2f%%), considering rebalance",
			metrics.SFUID, metrics.CPU*100, metrics.Memory*100)
	}

	// A healthy heartbeat promotes a registered worker to ready and binds it to
	// its room (task 5.3).
	cp.promoteWorker(metrics.SFUID, healthy)

	// Process per-room stats for relay cleanup
	if metrics.RoomStats != nil {
		cp.processRoomStatsForCleanup(metrics.SFUID, metrics.RoomStats)
	}

	return nil
}

// processRoomStatsForCleanup checks if relays should be removed
// Called with lock already held
func (cp *ControlPlane) processRoomStatsForCleanup(sfuID string, roomStats map[string]models.RoomStats) {
	for roomID, stats := range roomStats {
		topology, exists := cp.rooms[roomID]
		if !exists {
			continue
		}

		node, nodeExists := topology.Nodes[sfuID]
		if !nodeExists {
			continue
		}

		// Check if this is a relay node
		if node.Role == "relay" {
			// If relay has no viewers, schedule it for removal
			if stats.ViewerCount == 0 {
				log.Printf("[CP-CLEANUP] Relay %s for room %s has 0 viewers, removing from topology", sfuID, roomID)
				cp.scheduleRelayRemoval(roomID, sfuID)
			}
		}

		// Check if ingestion SFU's stream ended
		if node.Role == "ingestion" && !stats.IsActive {
			// Schedule cleanup with grace period instead of immediate deletion
			cp.scheduleTopologyCleanupWithGracePeriod(roomID, sfuID)
		} else if node.Role == "ingestion" && stats.IsActive {
			// Stream became active again, cancel any pending cleanup
			cp.cancelPendingCleanup(roomID)
		}
	}
}

// scheduleTopologyCleanupWithGracePeriod schedules cleanup with a grace period
// to allow the host to reconnect (e.g., OBS stop/start)
func (cp *ControlPlane) scheduleTopologyCleanupWithGracePeriod(roomID, sfuID string) {
	cp.cleanupMu.Lock()
	defer cp.cleanupMu.Unlock()

	// If cleanup is already scheduled, do nothing
	if _, exists := cp.pendingCleanups[roomID]; exists {
		log.Printf("[CP-CLEANUP] Cleanup already scheduled for room %s, ignoring", roomID)
		return
	}

	log.Printf("[CP-CLEANUP] Stream ended on ingestion SFU %s for room %s, scheduling cleanup in %v", sfuID, roomID, TopologyCleanupGracePeriod)

	timer := time.AfterFunc(TopologyCleanupGracePeriod, func() {
		cp.cleanupMu.Lock()
		delete(cp.pendingCleanups, roomID)
		cp.cleanupMu.Unlock()

		log.Printf("[CP-CLEANUP] Grace period expired for room %s, executing cleanup", roomID)
		cp.mu.Lock()
		cp.scheduleTopologyCleanup(roomID)
		cp.mu.Unlock()
	})

	cp.pendingCleanups[roomID] = timer
}

// cancelPendingCleanup cancels a scheduled cleanup (called when stream becomes active again)
func (cp *ControlPlane) cancelPendingCleanup(roomID string) {
	cp.cleanupMu.Lock()
	defer cp.cleanupMu.Unlock()

	if timer, exists := cp.pendingCleanups[roomID]; exists {
		timer.Stop()
		delete(cp.pendingCleanups, roomID)
		log.Printf("[CP-CLEANUP] Cancelled pending cleanup for room %s (stream became active)", roomID)
	}
}

// scheduleRelayRemoval removes a relay from topology (called with lock held)
func (cp *ControlPlane) scheduleRelayRemoval(roomID, sfuID string) {
	topology, exists := cp.rooms[roomID]
	if !exists {
		return
	}

	node, nodeExists := topology.Nodes[sfuID]
	if !nodeExists {
		return
	}

	// Get parent SFU ID before removing the node
	parentSFUID := node.ParentID
	if parentSFUID == "" {
		parentSFUID = topology.IngestionSFUID
	}

	// Remove from parent's children list
	if node.ParentID != "" {
		if parent, parentExists := topology.Nodes[node.ParentID]; parentExists {
			newChildren := make([]string, 0, len(parent.Children))
			for _, childID := range parent.Children {
				if childID != sfuID {
					newChildren = append(newChildren, childID)
				}
			}
			parent.Children = newChildren
		}
	}

	// Delete the node from topology
	delete(topology.Nodes, sfuID)

	// Notify the relay SFU to disconnect from upstream
	go cp.notifyRelayDisconnect(sfuID, roomID)

	// Notify the parent (ingestion) SFU to remove the downstream connection
	if parentSFUID != "" {
		go cp.notifyRemoveDownstream(parentSFUID, roomID, sfuID)
	}
}

// scheduleTopologyCleanup cleans up entire room topology when stream ends
func (cp *ControlPlane) scheduleTopologyCleanup(roomID string) {
	topology, exists := cp.rooms[roomID]
	if !exists {
		return
	}

	// Collect relay SFUs to notify
	relaysToNotify := make([]string, 0)
	for sfuID, node := range topology.Nodes {
		if node.Role == "relay" {
			relaysToNotify = append(relaysToNotify, sfuID)
		}
	}

	// Remove the entire topology
	delete(cp.rooms, roomID)
	log.Printf("[CP-CLEANUP] Removed topology for room %s", roomID)

	// Notify all relay SFUs to disconnect (outside lock)
	for _, sfuID := range relaysToNotify {
		go cp.notifyRelayDisconnect(sfuID, roomID)
	}

	// Notify ALL SFUs to delete the room so it can be re-created with a new key later
	go cp.syncRoomDeletionToAllSFUs(roomID)

	// The topology grace period doubles as the first-stage idle timeout. Once it
	// expires, release only capacity tracked by the on-demand provisioner; rooms
	// hosted on static SFUs are a no-op.
	if cp.provisioner != nil {
		go func() {
			if err := cp.provisioner.ReleaseCapacity(context.Background(), roomID); err != nil {
				log.Printf("[CP-CLEANUP] release capacity for room %s: %v", roomID, err)
			}
		}()
	}
}

// syncRoomDeletionToAllSFUs sends room deletion to all registered SFUs
func (cp *ControlPlane) syncRoomDeletionToAllSFUs(roomID string) {
	cp.mu.RLock()
	sfus := make([]*SFUInfo, 0, len(cp.sfus))
	for _, sfu := range cp.sfus {
		if sfu.Active && sfu.URL != "" {
			sfus = append(sfus, sfu)
		}
	}
	cp.mu.RUnlock()

	if len(sfus) == 0 {
		log.Printf("[CP-CLEANUP] No active SFUs to sync room deletion for %s", roomID)
		return
	}

	log.Printf("[CP-CLEANUP] Syncing room deletion %s to %d SFU(s)", roomID, len(sfus))

	// Send to all SFUs in parallel with semaphore limiting
	for _, sfu := range sfus {
		go func(sfuInfo *SFUInfo) {
			cp.syncSemaphore.acquire()
			defer cp.syncSemaphore.release()

			url := fmt.Sprintf("%s/room/delete?room_id=%s", sfuInfo.URL, roomID)

			req, err := http.NewRequest("DELETE", url, nil)
			if err != nil {
				log.Printf("[CP-CLEANUP] Failed to create delete request for SFU %s: %v", sfuInfo.ID, err)
				return
			}

			resp, err := httpClient.Do(req)
			if err != nil {
				log.Printf("[CP-CLEANUP] Failed to sync room deletion to SFU %s: %v", sfuInfo.ID, err)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNotFound {
				log.Printf("[CP-CLEANUP] Successfully synced room deletion %s to SFU %s", roomID, sfuInfo.ID)
			} else {
				log.Printf("[CP-CLEANUP] SFU %s returned status %d for room deletion sync", sfuInfo.ID, resp.StatusCode)
			}
		}(sfu)
	}
}

// notifyRelayDisconnect tells a SFU to disconnect its upstream connection for a room
func (cp *ControlPlane) notifyRelayDisconnect(sfuID, roomID string) {
	cp.mu.RLock()
	sfu, exists := cp.sfus[sfuID]
	cp.mu.RUnlock()

	if !exists || sfu.URL == "" {
		return
	}

	disconnectURL := fmt.Sprintf("%s/cascade/disconnect?room_id=%s", sfu.URL, roomID)

	req, err := http.NewRequest("POST", disconnectURL, nil)
	if err != nil {
		log.Printf("[CP-CLEANUP] Failed to create disconnect request: %v", err)
		return
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("[CP-CLEANUP] Failed to notify SFU %s to disconnect from room %s: %v", sfuID, roomID, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		log.Printf("[CP-CLEANUP] SFU %s disconnected from room %s", sfuID, roomID)
	} else {
		log.Printf("[CP-CLEANUP] SFU %s disconnect returned status %d", sfuID, resp.StatusCode)
	}
}

// notifyRemoveDownstream tells the parent SFU to remove a downstream connection
func (cp *ControlPlane) notifyRemoveDownstream(parentSFUID, roomID, childSFUID string) {
	cp.mu.RLock()
	sfu, exists := cp.sfus[parentSFUID]
	cp.mu.RUnlock()

	if !exists || sfu.URL == "" {
		return
	}

	removeURL := fmt.Sprintf("%s/cascade/remove-downstream?room_id=%s&child_sfu_id=%s", sfu.URL, roomID, childSFUID)

	req, err := http.NewRequest("POST", removeURL, nil)
	if err != nil {
		log.Printf("[CP-CLEANUP] Failed to create remove-downstream request: %v", err)
		return
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("[CP-CLEANUP] Failed to notify parent SFU %s to remove downstream %s: %v", parentSFUID, childSFUID, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		log.Printf("[CP-CLEANUP] Parent SFU %s removed downstream %s for room %s", parentSFUID, childSFUID, roomID)
	} else {
		log.Printf("[CP-CLEANUP] Parent SFU %s remove-downstream returned status %d", parentSFUID, resp.StatusCode)
	}
}

// JoinHost handles a host joining request and selects the ingestion SFU
func (cp *ControlPlane) JoinHost(req *models.JoinHostRequest, currentSFUID string) (*models.JoinHostResponse, error) {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	// Check if room already has an ingestion SFU
	if topology, exists := cp.rooms[req.RoomID]; exists {
		// Room already exists, return existing ingestion SFU
		ingestionSFU, ok := cp.sfus[topology.IngestionSFUID]
		if !ok || !ingestionSFU.Active {
			return nil, fmt.Errorf("ingestion SFU is not available")
		}

		return &models.JoinHostResponse{
			IngestionSFUID: topology.IngestionSFUID,
			IngestionURL:   ingestionSFU.URL,
			ShouldAccept:   topology.IngestionSFUID == currentSFUID,
		}, nil
	}

	// New room - select the best SFU for ingestion
	ingestionSFUID := cp.selectIngestionSFU()
	if ingestionSFUID == "" {
		return nil, fmt.Errorf("no available SFU for ingestion")
	}

	// Create new topology for this room
	topology := &models.RoomTopology{
		RoomID:         req.RoomID,
		IngestionSFUID: ingestionSFUID,
		Nodes:          make(map[string]*models.TopologyNode),
		CreatedAt:      time.Now(),
		LastRebalance:  time.Now(),
	}

	// Create the ingestion node
	ingestionNode := &models.TopologyNode{
		SFUID:      ingestionSFUID,
		RoomID:     req.RoomID,
		Role:       "ingestion",
		ParentID:   "",
		Children:   make([]string, 0),
		MaxLoad:    1.0,
		LastUpdate: time.Now(),
	}

	topology.Nodes[ingestionSFUID] = ingestionNode
	cp.rooms[req.RoomID] = topology

	ingestionSFU := cp.sfus[ingestionSFUID]

	log.Printf("[CP] Assigned ingestion SFU %s for room %s", ingestionSFUID, req.RoomID)

	return &models.JoinHostResponse{
		IngestionSFUID: ingestionSFUID,
		IngestionURL:   ingestionSFU.URL,
		ShouldAccept:   ingestionSFUID == currentSFUID,
	}, nil
}

// acceptsNewRooms reports whether an SFU may receive a new room assignment. A
// worker that is draining (or otherwise not ready) is excluded so scale-down
// candidates stop taking new rooms while still serving their current one
// (task 5.5). SFUs with no worker record (statically-run SFUs) always accept.
func (cp *ControlPlane) acceptsNewRooms(sfuID string) bool {
	if cp.roomState == nil {
		return true
	}
	rec, ok := cp.roomState.GetWorker(sfuID)
	if !ok {
		return true
	}
	return rec.State == models.WorkerReady
}

// selectIngestionSFU selects the best SFU to be the ingestion node
func (cp *ControlPlane) selectIngestionSFU() string {
	var bestSFUID string
	bestScore := -1.0

	for sfuID, sfu := range cp.sfus {
		if !sfu.Active {
			continue
		}
		if !cp.acceptsNewRooms(sfuID) {
			continue // draining/not-ready worker: no new room assignments (task 5.5)
		}

		// Score based on current load (lower is better)
		score := 1.0
		if sfu.Metrics != nil {
			// Lower CPU and memory = higher score
			score = (1.0 - sfu.Metrics.CPU) * (1.0 - sfu.Metrics.Memory)
		}

		if score > bestScore {
			bestScore = score
			bestSFUID = sfuID
		}
	}

	return bestSFUID
}

// JoinViewer handles a viewer joining request and selects the optimal SFU
func (cp *ControlPlane) JoinViewer(req *models.JoinViewerRequest) (*models.JoinViewerResponse, error) {
	cp.mu.RLock()
	defer cp.mu.RUnlock()

	topology, exists := cp.rooms[req.RoomID]
	if !exists {
		return nil, fmt.Errorf("room not found")
	}

	// Select the optimal SFU for this viewer
	optimalSFUID := cp.selectOptimalViewerSFU(req.RoomID, req.CurrentSFUID)
	if optimalSFUID == "" {
		return nil, fmt.Errorf("no available SFU for viewer")
	}

	optimalSFU, ok := cp.sfus[optimalSFUID]
	if !ok {
		return nil, fmt.Errorf("optimal SFU not found")
	}

	response := &models.JoinViewerResponse{
		OptimalSFUID: optimalSFUID,
		OptimalURL:   optimalSFU.URL,
		ShouldAccept: optimalSFUID == req.CurrentSFUID,
	}

	// If the optimal SFU is not in the topology yet, determine its parent
	if _, exists := topology.Nodes[optimalSFUID]; !exists {
		parentID := cp.selectParentForNode(topology, optimalSFUID)
		if parentID != "" {
			parentSFU, ok := cp.sfus[parentID]
			if ok {
				response.ParentSFUID = parentID
				response.ParentURL = parentSFU.URL
			}
		}
	}

	return response, nil
}

// selectOptimalViewerSFU selects the best SFU to serve a viewer
func (cp *ControlPlane) selectOptimalViewerSFU(roomID, currentSFUID string) string {
	topology := cp.rooms[roomID]

	// First, check if current SFU can handle it
	if currentSFU, ok := cp.sfus[currentSFUID]; ok && currentSFU.Active {
		if currentSFU.Metrics != nil {
			load := (currentSFU.Metrics.CPU + currentSFU.Metrics.Memory) / 2.0
			if load < 0.8 { // If current SFU has capacity
				return currentSFUID
			}
		}
	}

	// Otherwise, find the SFU with lowest load in the topology or available pool
	var bestSFUID string
	bestScore := -1.0

	// First, check SFUs already in the topology
	for sfuID := range topology.Nodes {
		sfu, ok := cp.sfus[sfuID]
		if !ok || !sfu.Active {
			continue
		}

		score := 1.0
		if sfu.Metrics != nil {
			score = 1.0 - ((sfu.Metrics.CPU + sfu.Metrics.Memory) / 2.0)
			// Prefer nodes with fewer viewers
			score -= float64(sfu.Metrics.ActiveViewers) / 1000.0
		}

		if score > bestScore {
			bestScore = score
			bestSFUID = sfuID
		}
	}

	// If no good SFU in topology, consider adding a new one
	if bestScore < 0.5 {
		for sfuID, sfu := range cp.sfus {
			if !sfu.Active {
				continue
			}
			if _, inTopology := topology.Nodes[sfuID]; inTopology {
				continue
			}

			score := 1.0
			if sfu.Metrics != nil {
				score = 1.0 - ((sfu.Metrics.CPU + sfu.Metrics.Memory) / 2.0)
			}

			if score > bestScore {
				bestScore = score
				bestSFUID = sfuID
			}
		}
	}

	return bestSFUID
}

// selectParentForNode selects a parent SFU for a new node joining the topology
func (cp *ControlPlane) selectParentForNode(topology *models.RoomTopology, newSFUID string) string {
	// Find the node with fewest children that's not at max capacity
	var bestParentID string
	minChildren := cp.maxFanout + 1

	for sfuID, node := range topology.Nodes {
		if len(node.Children) < minChildren && len(node.Children) < cp.maxFanout {
			sfu, ok := cp.sfus[sfuID]
			if !ok || !sfu.Active {
				continue
			}

			// Check load
			if sfu.Metrics != nil {
				load := (sfu.Metrics.CPU + sfu.Metrics.Memory) / 2.0
				if load > 0.9 {
					continue
				}
			}

			minChildren = len(node.Children)
			bestParentID = sfuID
		}
	}

	return bestParentID
}

// createRelayNode creates a new relay SFU node for a room by connecting it to the origin.
// This is called when the ingestion SFU is overloaded and we need to add a relay
// that viewers can connect to instead of overloading the ingestion SFU further.
// Takes its own locks - must NOT be called while holding cp.mu lock.
func (cp *ControlPlane) createRelayNode(roomID string, topology *models.RoomTopology) (string, string, error) {
	// Find the least loaded SFU that's not already in the topology
	var bestSFUID string
	var bestURL string
	var bestLoad float64 = 2.0
	var originURL string

	// Take read lock to find best SFU and get origin info
	cp.mu.RLock()
	for sfuID, sfu := range cp.sfus {
		if !sfu.Active {
			continue
		}
		// Skip SFUs already in topology (including ingestion)
		if _, exists := topology.Nodes[sfuID]; exists {
			continue
		}

		// Use MAX of CPU and Memory as load indicator
		load := 1.0
		if sfu.Metrics != nil {
			load = sfu.Metrics.CPU
			if sfu.Metrics.Memory > load {
				load = sfu.Metrics.Memory
			}
		}

		if load < bestLoad {
			bestLoad = load
			bestSFUID = sfuID
			bestURL = sfu.URL
		}
	}

	// Get origin SFU URL while we have the lock
	if originSFU, ok := cp.sfus[topology.IngestionSFUID]; ok && originSFU.Active {
		originURL = originSFU.URL
	}
	cp.mu.RUnlock()

	if bestSFUID == "" {
		return "", "", fmt.Errorf("no available SFU for relay")
	}

	if originURL == "" {
		return "", "", fmt.Errorf("origin SFU not available")
	}

	log.Printf("[CP-RELAY] Creating relay node %s for room %s (origin: %s)",
		bestSFUID, roomID, topology.IngestionSFUID)

	// First, ensure the room exists on the relay SFU
	syncReq := models.SyncRoomRequest{
		RoomID: roomID,
		Key:    topology.Key,
	}
	jsonData, _ := json.Marshal(syncReq)

	syncURL := fmt.Sprintf("%s/room/sync-create", bestURL)
	syncResp, err := httpClientLong.Post(syncURL, "application/json", bytes.NewReader(jsonData))
	if err != nil {
		log.Printf("[CP-RELAY] Failed to sync room to relay SFU %s: %v", bestSFUID, err)
		return "", "", err
	}
	syncResp.Body.Close()

	// Tell the relay SFU to subscribe to the origin SFU via /cascade/request-subscribe
	// This endpoint is now SYNCHRONOUS - it waits for the cascade to be established
	cascadeReqURL := fmt.Sprintf("%s/cascade/request-subscribe", bestURL)

	cascadePayload := map[string]string{
		"room_id":    roomID,
		"origin_url": originURL,
	}
	cascadeJSON, _ := json.Marshal(cascadePayload)

	// Use longer timeout since cascade connection can take time (WebRTC setup + retries)
	cascadeResp, err := httpClientLong.Post(cascadeReqURL, "application/json", bytes.NewReader(cascadeJSON))
	if err != nil {
		log.Printf("[CP-RELAY] Failed to initiate cascade from relay %s to origin %s: %v",
			bestSFUID, topology.IngestionSFUID, err)
		return "", "", err
	}
	defer cascadeResp.Body.Close()

	// 200 OK means cascade is established, 502 means it failed
	if cascadeResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(cascadeResp.Body)
		log.Printf("[CP-RELAY] Cascade subscription failed: status %d, body: %s", cascadeResp.StatusCode, string(body))
		return "", "", fmt.Errorf("cascade subscription failed: %d - %s", cascadeResp.StatusCode, string(body))
	}

	log.Printf("[CP-RELAY] Cascade connection established for relay %s", bestSFUID)

	// Wait for the cascade connection to be established (stream to be active on relay)
	// Poll stream-status endpoint - this is critical, don't use relay without active stream
	maxWait := 5 * time.Second
	pollInterval := 300 * time.Millisecond
	startWait := time.Now()
	streamReady := false

	for time.Since(startWait) < maxWait {
		statusURL := fmt.Sprintf("%s/stream-status?room_id=%s", bestURL, roomID)
		resp, err := httpClient.Get(statusURL)
		if err == nil {
			var status map[string]interface{}
			if json.NewDecoder(resp.Body).Decode(&status) == nil {
				if active, ok := status["active"].(bool); ok && active {
					streamReady = true
					resp.Body.Close()
					log.Printf("[CP-RELAY] Relay %s stream is active after %v", bestSFUID, time.Since(startWait))
					break
				}
			}
			resp.Body.Close()
		}
		time.Sleep(pollInterval)
	}

	if !streamReady {
		log.Printf("[CP-RELAY] ERROR: relay %s stream NOT active after %v, cascade failed", bestSFUID, maxWait)
		// Don't return this relay - viewers would get black screen
		return "", "", fmt.Errorf("relay cascade not established after %v", maxWait)
	}

	// Add relay node to topology - take write lock for modification
	cp.mu.Lock()

	// Get the current topology from rooms (it may have been updated)
	currentTopology, exists := cp.rooms[roomID]
	if !exists {
		cp.mu.Unlock()
		return "", "", fmt.Errorf("room topology disappeared during relay creation")
	}

	// Add relay node to topology
	relayNode := &models.TopologyNode{
		SFUID:      bestSFUID,
		RoomID:     roomID,
		Role:       "relay",
		ParentID:   currentTopology.IngestionSFUID,
		Children:   make([]string, 0),
		MaxLoad:    1.0,
		LastUpdate: time.Now(),
	}
	currentTopology.Nodes[bestSFUID] = relayNode

	// Add as child of ingestion node
	if ingestionNode, ok := currentTopology.Nodes[currentTopology.IngestionSFUID]; ok {
		ingestionNode.Children = append(ingestionNode.Children, bestSFUID)
	}
	cp.mu.Unlock()

	log.Printf("[CP-RELAY] Successfully created relay node %s for room %s", bestSFUID, roomID)

	return bestSFUID, bestURL, nil
}

// GetTopology returns the topology for a room
func (cp *ControlPlane) GetTopology(roomID string) (*models.RoomTopology, error) {
	cp.mu.RLock()
	defer cp.mu.RUnlock()

	topology, exists := cp.rooms[roomID]
	if !exists {
		return nil, fmt.Errorf("room not found")
	}

	return topology, nil
}

// CreateRoom creates a new room and synchronizes it across all SFUs
func (cp *ControlPlane) CreateRoom(roomID string) (string, bool, error) {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	// Check if room already exists
	if existingTopology, exists := cp.rooms[roomID]; exists {
		log.Printf("[CP] Room %s already exists", roomID)
		// Return the existing key
		return existingTopology.Key, true, nil
	}

	// Generate a new key for the room
	key := generateRoomKey()

	// Select an ingestion SFU for this room
	ingestionSFUID := cp.selectIngestionSFU()
	if ingestionSFUID == "" {
		// No ready SFU. Without an autoscaler this is still a hard failure.
		if cp.provisioner == nil {
			return "", false, fmt.Errorf("no active SFUs available")
		}
		// Cold start: create the room in `provisioning` with no ingestion SFU
		// yet, trigger capacity creation, and let the streamer poll until it is
		// ready (task 5.2). A worker fills IngestionSFUID once it registers.
		key := generateRoomKey()
		cp.rooms[roomID] = &models.RoomTopology{
			RoomID:        roomID,
			Key:           key,
			Nodes:         make(map[string]*models.TopologyNode),
			CreatedAt:     time.Now(),
			LastRebalance: time.Now(),
		}
		if cp.roomState != nil {
			if _, err := cp.roomState.Upsert(roomID, models.RoomProvisioning, ""); err != nil {
				log.Printf("[CP] failed to persist provisioning room %s: %v", roomID, err)
			}
		}
		cp.triggerProvisioning(roomID)
		log.Printf("[CP] Room %s has no ready SFU; provisioning on demand (key %s)", roomID, key)
		return key, false, nil
	}

	log.Printf("[CP] Creating new room %s with key %s on ingestion SFU %s", roomID, key, ingestionSFUID)

	// Create topology for this room with ingestion SFU assigned
	topology := &models.RoomTopology{
		RoomID:         roomID,
		Key:            key,
		IngestionSFUID: ingestionSFUID,
		Nodes:          make(map[string]*models.TopologyNode),
		CreatedAt:      time.Now(),
		LastRebalance:  time.Now(),
	}

	// Add ingestion SFU as a node in the topology
	topology.Nodes[ingestionSFUID] = &models.TopologyNode{
		SFUID:      ingestionSFUID,
		RoomID:     roomID,
		Role:       "ingestion",
		ParentID:   "",
		Children:   []string{},
		Load:       0,
		MaxLoad:    100,
		LastUpdate: time.Now(),
	}

	cp.rooms[roomID] = topology

	// Persist room lifecycle. Today a room only succeeds here with an ingestion
	// SFU already assigned, so it is effectively ready; the provisioning/failed
	// path is wired in by the cold-start room-creation work (task 5.1).
	// ponytail: file write under cp.mu — fine at cold-start traffic; move off the
	// lock if room-create throughput ever matters.
	if cp.roomState != nil {
		if _, err := cp.roomState.Upsert(roomID, models.RoomReady, ""); err != nil {
			log.Printf("[CP] failed to persist room %s lifecycle: %v", roomID, err)
		}
	}

	// Synchronize room creation to all active SFUs
	go cp.syncRoomToAllSFUs(roomID, key)

	return key, false, nil
}

// triggerProvisioning asks the autoscaler for capacity in the background so the
// room-create HTTP call returns immediately. On failure (including budget cap)
// the room is marked failed for the streamer to observe.
func (cp *ControlPlane) triggerProvisioning(roomID string) {
	p := cp.provisioner
	go func() {
		if _, err := p.EnsureCapacity(context.Background(), roomID); err != nil {
			log.Printf("[CP] provisioning room %s failed: %v", roomID, err)
			if cp.roomState != nil {
				if _, uerr := cp.roomState.Upsert(roomID, models.RoomFailed, err.Error()); uerr != nil {
					log.Printf("[CP] failed to mark room %s failed: %v", roomID, uerr)
				}
			}
		}
	}()
}

// promoteWorker advances an on-demand worker's lifecycle as it registers and
// reports health, binding it to its room once ready. The readiness policy
// (task 5.3): a worker becomes `ready` only after it has registered AND
// delivered a healthy heartbeat. No-op for SFUs with no worker record (e.g.
// statically-run SFUs) or workers already past `registered`. Caller holds cp.mu.
func (cp *ControlPlane) promoteWorker(sfuID string, healthy bool) {
	if cp.roomState == nil {
		return
	}
	rec, ok := cp.roomState.GetWorker(sfuID)
	if !ok {
		return
	}
	switch rec.State {
	case models.WorkerProvisioning:
		rec.State = models.WorkerRegistered
	case models.WorkerRegistered:
		if !healthy {
			return
		}
		rec.State = models.WorkerReady
		if rec.ReadyAt == nil {
			now := time.Now().UTC()
			rec.ReadyAt = &now
		}
	default:
		return // ready/draining/failed/terminated: nothing to advance
	}
	if sfu, ok := cp.sfus[sfuID]; ok && sfu.URL != "" {
		rec.PublicEndpoint = sfu.URL
	}
	rec.LastHeartbeat = time.Now().UTC()
	saved, err := cp.roomState.UpsertWorker(rec)
	if err != nil {
		log.Printf("[CP] promote worker %s: %v", sfuID, err)
		return
	}
	if saved.State == models.WorkerReady && saved.RoomID != "" {
		cp.bindWorkerToRoom(saved.RoomID, sfuID)
	}
}

// bindWorkerToRoom makes a ready worker the room's ingestion SFU and marks the
// room ready so its WHIP/viewer flows unblock. Idempotent: an already-bound room
// keeps its ingestion SFU. Caller holds cp.mu.
func (cp *ControlPlane) bindWorkerToRoom(roomID, sfuID string) {
	topology, ok := cp.rooms[roomID]
	if !ok {
		return
	}
	if topology.IngestionSFUID == "" {
		topology.IngestionSFUID = sfuID
		topology.Nodes[sfuID] = &models.TopologyNode{
			SFUID:      sfuID,
			RoomID:     roomID,
			Role:       "ingestion",
			MaxLoad:    100,
			LastUpdate: time.Now(),
		}
	}
	if cp.roomState != nil {
		if _, err := cp.roomState.Upsert(roomID, models.RoomReady, ""); err != nil {
			log.Printf("[CP] mark room %s ready: %v", roomID, err)
			return
		}
	}
	go cp.syncRoomToAllSFUs(roomID, topology.Key)
	log.Printf("[CP] room %s ready on ingestion SFU %s", roomID, sfuID)
}

// syncRoomToAllSFUs sends room creation to all registered SFUs
func (cp *ControlPlane) syncRoomToAllSFUs(roomID, key string) {
	cp.mu.RLock()
	sfus := make([]*SFUInfo, 0, len(cp.sfus))
	for _, sfu := range cp.sfus {
		if sfu.Active {
			sfus = append(sfus, sfu)
		}
	}
	cp.mu.RUnlock()

	if len(sfus) == 0 {
		log.Printf("[CP] No active SFUs to sync room %s", roomID)
		return
	}

	log.Printf("[CP] Syncing room %s to %d SFU(s)", roomID, len(sfus))

	syncReq := models.SyncRoomRequest{
		RoomID: roomID,
		Key:    key,
	}

	jsonData, err := json.Marshal(syncReq)
	if err != nil {
		log.Printf("[CP] Failed to marshal sync request: %v", err)
		return
	}

	// Send to all SFUs in parallel with semaphore limiting
	for _, sfu := range sfus {
		go func(sfuInfo *SFUInfo) {
			cp.syncSemaphore.acquire()
			defer cp.syncSemaphore.release()

			url := fmt.Sprintf("%s/room/sync-create", sfuInfo.URL)

			resp, err := httpClient.Post(url, "application/json", bytes.NewReader(jsonData))
			if err != nil {
				log.Printf("[CP] Failed to sync room to SFU %s: %v", sfuInfo.ID, err)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
				log.Printf("[CP] Successfully synced room %s to SFU %s", roomID, sfuInfo.ID)
			} else {
				log.Printf("[CP] SFU %s returned status %d for room sync", sfuInfo.ID, resp.StatusCode)
			}
		}(sfu)
	}
}

// generateRoomKey generates a random key for room authentication
func generateRoomKey() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// HandleRegisterSFU HTTP handler
func (cp *ControlPlane) HandleRegisterSFU(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	var reg models.SFURegistration
	if err := json.NewDecoder(r.Body).Decode(&reg); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := cp.RegisterSFU(&reg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "registered",
		"sfu_id": reg.SFUID,
	})
}

// HandleHeartbeat HTTP handler
func (cp *ControlPlane) HandleHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	var metrics models.SFUMetrics
	if err := json.NewDecoder(r.Body).Decode(&metrics); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := cp.UpdateMetrics(&metrics); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleJoinHost HTTP handler
func (cp *ControlPlane) HandleJoinHost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	currentSFUID := r.URL.Query().Get("sfu_id")
	if currentSFUID == "" {
		http.Error(w, "sfu_id query parameter is required", http.StatusBadRequest)
		return
	}

	var req models.JoinHostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	response, err := cp.JoinHost(&req, currentSFUID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleJoinViewer HTTP handler
func (cp *ControlPlane) HandleJoinViewer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	var req models.JoinViewerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	response, err := cp.JoinViewer(&req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleGetTopology HTTP handler
func (cp *ControlPlane) HandleGetTopology(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id query parameter is required", http.StatusBadRequest)
		return
	}

	topology, err := cp.GetTopology(roomID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.TopologyResponse{Topology: topology})
}

// HandleCreateRoom HTTP handler
func (cp *ControlPlane) HandleCreateRoom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	var req models.CreateRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if req.RoomID == "" {
		http.Error(w, "room_id is required", http.StatusBadRequest)
		return
	}

	key, alreadyExists, err := cp.CreateRoom(req.RoomID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Reflect the room's lifecycle state so a cold-start streamer knows to wait.
	state := models.RoomReady
	if cp.roomState != nil {
		if rl, ok := cp.roomState.Get(req.RoomID); ok {
			state = rl.State
		}
	}

	response := models.CreateRoomResponse{
		RoomID:  req.RoomID,
		Key:     key,
		Created: !alreadyExists,
		State:   string(state),
	}

	w.Header().Set("Content-Type", "application/json")
	switch {
	case state == models.RoomProvisioning:
		w.WriteHeader(http.StatusAccepted) // 202: capacity is being provisioned
	case alreadyExists:
		w.WriteHeader(http.StatusOK)
	default:
		w.WriteHeader(http.StatusCreated)
	}
	json.NewEncoder(w).Encode(response)

	log.Printf("[CP] Room %s %s (key: %s, state: %s)", req.RoomID,
		map[bool]string{true: "already exists", false: "created"}[alreadyExists], key, state)
}

// HandleWHIP proxies WHIP requests to the appropriate ingestion SFU
// roomReadyForMedia reports whether roomID may serve media (WHIP/viewer/
// recorder). When the room is not ready it writes a JSON error and returns
// false, so those flows hand out usable endpoints only after the room is ready
// (task 5.4). Rooms with no lifecycle record (legacy / pre-autoscaler) pass
// through so existing behaviour is preserved.
func (cp *ControlPlane) roomReadyForMedia(w http.ResponseWriter, roomID string) bool {
	if cp.roomState == nil {
		return true
	}
	rl, ok := cp.roomState.Get(roomID)
	if !ok {
		return true
	}
	switch rl.State {
	case models.RoomReady:
		return true
	case models.RoomProvisioning, models.RoomDraining:
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "5")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"room_id": roomID, "state": string(rl.State),
			"error": "room is not ready yet; retry once it is ready",
		})
		return false
	default: // failed / terminated
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"room_id": roomID, "state": string(rl.State),
			"error": "room is not available", "reason": rl.Reason,
		})
		return false
	}
}

func (cp *ControlPlane) HandleWHIP(w http.ResponseWriter, r *http.Request) {
	// Extract room_id from query parameters
	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	log.Printf("[CP-WHIP] Received WHIP request for room %s", roomID)

	// Get the key from query parameters
	key := r.URL.Query().Get("key")
	if key == "" {
		http.Error(w, "key parameter is required", http.StatusBadRequest)
		return
	}

	// Check if room exists and verify the key
	cp.mu.RLock()
	topology, exists := cp.rooms[roomID]
	cp.mu.RUnlock()

	if !exists {
		log.Printf("[CP-WHIP] Room %s not found - must be created via /room/create first", roomID)
		http.Error(w, "Room not found. Create it first via /room/create", http.StatusNotFound)
		return
	}

	// Gate: only proxy WHIP once the room is ready (task 5.4).
	if !cp.roomReadyForMedia(w, roomID) {
		return
	}

	// Verify the key matches
	if topology.Key != key {
		log.Printf("[CP-WHIP] Invalid key for room %s", roomID)
		http.Error(w, "Invalid key", http.StatusUnauthorized)
		return
	}

	var ingestionSFUID string
	var ingestionURL string

	if topology.IngestionSFUID != "" {
		// Room already has an ingestion SFU
		ingestionSFUID = topology.IngestionSFUID
		cp.mu.RLock()
		sfu, ok := cp.sfus[ingestionSFUID]
		cp.mu.RUnlock()
		if !ok || !sfu.Active {
			http.Error(w, "Ingestion SFU is not available", http.StatusServiceUnavailable)
			return
		}
		ingestionURL = sfu.URL
		log.Printf("[CP-WHIP] Room %s already has ingestion SFU: %s", roomID, ingestionSFUID)
	} else {
		// Select best SFU for ingestion and update topology
		cp.mu.Lock()
		ingestionSFUID = cp.selectIngestionSFU()
		if ingestionSFUID == "" {
			cp.mu.Unlock()
			http.Error(w, "No available SFU for ingestion", http.StatusServiceUnavailable)
			return
		}

		sfu := cp.sfus[ingestionSFUID]
		ingestionURL = sfu.URL

		// Update topology with ingestion SFU
		topology.IngestionSFUID = ingestionSFUID

		ingestionNode := &models.TopologyNode{
			SFUID:      ingestionSFUID,
			RoomID:     roomID,
			Role:       "ingestion",
			ParentID:   "",
			Children:   make([]string, 0),
			MaxLoad:    1.0,
			LastUpdate: time.Now(),
		}
		topology.Nodes[ingestionSFUID] = ingestionNode
		cp.mu.Unlock()

		log.Printf("[CP-WHIP] Selected ingestion SFU %s for room %s", ingestionSFUID, roomID)
	}

	// Ensure the room exists on the ingestion SFU with the correct key
	syncReq := models.SyncRoomRequest{
		RoomID: roomID,
		Key:    topology.Key, // Use the key from topology, not from client
	}
	jsonData, err := json.Marshal(syncReq)
	if err != nil {
		log.Printf("[CP-WHIP] Failed to marshal sync request: %v", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	syncURL := fmt.Sprintf("%s/room/sync-create", ingestionURL)
	syncResp, err := httpClient.Post(syncURL, "application/json", bytes.NewReader(jsonData))
	if err != nil {
		log.Printf("[CP-WHIP] Failed to sync room to SFU %s: %v", ingestionSFUID, err)
		// Continue anyway, the room might already exist
	} else {
		syncResp.Body.Close()
		log.Printf("[CP-WHIP] Room %s synced to SFU %s", roomID, ingestionSFUID)
	}

	// Build target URL
	targetURL, err := url.Parse(ingestionURL)
	if err != nil {
		log.Printf("[CP-WHIP] Failed to parse target URL %s: %v", ingestionURL, err)
		http.Error(w, "Invalid SFU URL", http.StatusInternalServerError)
		return
	}

	// Preserve the original query parameters
	targetURL.Path = "/whip"
	targetURL.RawQuery = r.URL.RawQuery

	log.Printf("[CP-WHIP] Proxying WHIP request to %s", targetURL.String())

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Custom director to preserve original request details
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = targetURL.Host
		req.URL.Path = "/whip"
		req.URL.RawQuery = r.URL.RawQuery
	}

	// Remove CORS headers from SFU response to avoid duplicates
	// The control plane's corsMiddleware will add them
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		return nil
	}

	// Error handler
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("[CP-WHIP] Proxy error to SFU %s: %v", ingestionSFUID, err)
		http.Error(w, fmt.Sprintf("Failed to proxy to SFU: %v", err), http.StatusBadGateway)
	}

	// Proxy the request
	proxy.ServeHTTP(w, r)

	log.Printf("[CP-WHIP] WHIP request for room %s successfully proxied to SFU %s", roomID, ingestionSFUID)
}

func parseWHIPResourcePath(requestPath string) (roomID, key string, ok bool) {
	const prefix = "/whip/resource/"
	if !strings.HasPrefix(requestPath, prefix) {
		return "", "", false
	}
	parts := strings.SplitN(strings.TrimPrefix(requestPath, prefix), "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	roomID, err := url.PathUnescape(parts[0])
	if err != nil {
		return "", "", false
	}
	key, err = url.PathUnescape(parts[1])
	if err != nil {
		return "", "", false
	}
	return roomID, key, true
}

// HandleWHIPResource proxies termination of the resource returned in the
// WHIP Location header to the worker that owns the room.
func (cp *ControlPlane) HandleWHIPResource(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Only DELETE is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID, key, ok := parseWHIPResourcePath(r.URL.Path)
	if !ok {
		http.Error(w, "Invalid WHIP resource", http.StatusBadRequest)
		return
	}

	cp.mu.RLock()
	topology, exists := cp.rooms[roomID]
	invalidKey := exists && topology.Key != key
	if !exists || invalidKey || topology.IngestionSFUID == "" {
		cp.mu.RUnlock()
		if invalidKey {
			http.Error(w, "Invalid key", http.StatusUnauthorized)
			return
		}
		http.Error(w, "WHIP resource not found", http.StatusNotFound)
		return
	}
	ingestionSFUID := topology.IngestionSFUID
	sfu, exists := cp.sfus[ingestionSFUID]
	if !exists || !sfu.Active {
		cp.mu.RUnlock()
		http.Error(w, "Ingestion SFU is not available", http.StatusServiceUnavailable)
		return
	}
	ingestionURL := sfu.URL
	cp.mu.RUnlock()

	targetURL, err := url.Parse(ingestionURL)
	if err != nil {
		log.Printf("[CP-WHIP] Failed to parse resource target URL for room %s: %v", roomID, err)
		http.Error(w, "Invalid SFU URL", http.StatusInternalServerError)
		return
	}
	targetURL.Path = r.URL.Path
	targetURL.RawQuery = ""

	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = targetURL.Host
		req.URL.Path = targetURL.Path
		req.URL.RawQuery = ""
	}
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		resp.Header.Del("Access-Control-Expose-Headers")
		return nil
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		log.Printf("[CP-WHIP] Resource delete proxy error to SFU %s: %v", ingestionSFUID, err)
		http.Error(w, "Failed to delete WHIP resource", http.StatusBadGateway)
	}

	proxy.ServeHTTP(w, r)
	log.Printf("[CP-WHIP] Resource for room %s deleted on SFU %s", roomID, ingestionSFUID)
}

// HandleViewer proxies viewer requests to the optimal SFU
func (cp *ControlPlane) HandleViewer(w http.ResponseWriter, r *http.Request) {
	// Extract room_id from query parameters
	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	log.Printf("[CP-VIEWER] Received viewer request for room %s", roomID)

	// Gate: only route viewers once the room is ready (task 5.4). Unknown rooms
	// pass through to the legacy SFU-scan fallback below.
	if !cp.roomReadyForMedia(w, roomID) {
		return
	}

	// Check if room exists in topology
	cp.mu.RLock()
	topology, exists := cp.rooms[roomID]
	cp.mu.RUnlock()

	var targetSFUID string
	var targetURL string

	if !exists {
		// Room not in topology yet, but might exist on a SFU
		// This can happen if the room was created directly on a SFU (legacy mode)
		// or if the control plane was restarted
		log.Printf("[CP-VIEWER] Room %s not in topology, checking all SFUs", roomID)

		var foundSFUID string

		cp.mu.RLock()
		for sfuID, sfu := range cp.sfus {
			if sfu.Active {
				// Check if this SFU has the room by querying stream-status
				statusURL := fmt.Sprintf("%s/stream-status?room_id=%s", sfu.URL, roomID)

				resp, err := httpClient.Get(statusURL)
				if err == nil && resp.StatusCode == http.StatusOK {
					var status map[string]interface{}
					if json.NewDecoder(resp.Body).Decode(&status) == nil {
						if active, ok := status["active"].(bool); ok && active {
							foundSFUID = sfuID
							log.Printf("[CP-VIEWER] Found active room on SFU %s", sfuID)
							resp.Body.Close()
							break
						}
					}
					resp.Body.Close()
				}
			}
		}
		cp.mu.RUnlock()

		if foundSFUID == "" {
			log.Printf("[CP-VIEWER] Room %s not found on any SFU", roomID)
			http.Error(w, "Room not found or stream not active", http.StatusNotFound)
			return
		}

		// Create topology for this discovered room so future requests can use load balancing
		cp.mu.Lock()
		// Double-check it wasn't created by another request
		if _, stillNotExists := cp.rooms[roomID]; !stillNotExists {
			log.Printf("[CP-VIEWER] Creating topology for discovered room %s with ingestion SFU %s", roomID, foundSFUID)
			topology = &models.RoomTopology{
				RoomID:         roomID,
				Key:            "", // Unknown key for discovered rooms
				IngestionSFUID: foundSFUID,
				Nodes:          make(map[string]*models.TopologyNode),
				CreatedAt:      time.Now(),
				LastRebalance:  time.Now(),
			}
			// Add ingestion node
			topology.Nodes[foundSFUID] = &models.TopologyNode{
				SFUID:      foundSFUID,
				RoomID:     roomID,
				Role:       "ingestion",
				ParentID:   "",
				Children:   make([]string, 0),
				MaxLoad:    1.0,
				LastUpdate: time.Now(),
			}
			cp.rooms[roomID] = topology
			exists = true // Now it exists, so the load balancing logic can run
		} else {
			topology = cp.rooms[roomID]
			exists = true
		}
		cp.mu.Unlock()

		// If we just created the topology, fall through to the load-based selection
		// instead of using foundSFUID directly (which might be overloaded)
	}

	if exists {
		// Room exists in topology - use load-based selection
		cp.mu.RLock()

		log.Printf("[CP-VIEWER-DEBUG] Evaluating load for room %s, ingestion SFU: %s", roomID, topology.IngestionSFUID)

		// First, try to find the least loaded SFU that has the stream
		var bestSFUID string
		var bestURL string
		var bestLoad float64 = 2.0 // Start with impossible high load

		// Check ingestion SFU first
		if topology.IngestionSFUID != "" {
			sfu, ok := cp.sfus[topology.IngestionSFUID]
			if !ok {
				log.Printf("[CP-VIEWER-DEBUG] Ingestion SFU %s not found in sfus map", topology.IngestionSFUID)
			} else if !sfu.Active {
				log.Printf("[CP-VIEWER-DEBUG] Ingestion SFU %s is not active", topology.IngestionSFUID)
			} else if sfu.Metrics == nil {
				log.Printf("[CP-VIEWER-DEBUG] Ingestion SFU %s has no metrics yet", topology.IngestionSFUID)
			} else {
				// Use MAX of CPU and Memory as load indicator
				// This ensures we react when either resource is stressed
				load := sfu.Metrics.CPU
				if sfu.Metrics.Memory > load {
					load = sfu.Metrics.Memory
				}
				log.Printf("[CP-VIEWER-DEBUG] Ingestion SFU %s load: %.2f%% (CPU: %.2f%%, Mem: %.2f%%)",
					topology.IngestionSFUID, load*100, sfu.Metrics.CPU*100, sfu.Metrics.Memory*100)
				if load < bestLoad {
					bestLoad = load
					bestSFUID = topology.IngestionSFUID
					bestURL = sfu.URL
				}
			}
		}

		// Check other nodes in topology that might have the stream relayed
		for sfuID, node := range topology.Nodes {
			if sfuID == topology.IngestionSFUID {
				continue // Already checked
			}
			sfu, ok := cp.sfus[sfuID]
			if ok && sfu.Active && sfu.Metrics != nil {
				// Use MAX of CPU and Memory as load indicator
				load := sfu.Metrics.CPU
				if sfu.Metrics.Memory > load {
					load = sfu.Metrics.Memory
				}
				if load < bestLoad {
					bestLoad = load
					bestSFUID = sfuID
					bestURL = sfu.URL
					log.Printf("[CP-VIEWER] Found less loaded node %s (role: %s, load: %.2f%%)",
						sfuID, node.Role, load*100)
				}
			}
		}

		// Store if we need to create a relay (must be done after releasing lock)
		needsRelay := bestSFUID == topology.IngestionSFUID && bestLoad > 0.8

		log.Printf("[CP-VIEWER-DEBUG] bestSFUID=%s, bestLoad=%.2f%%, needsRelay=%v", bestSFUID, bestLoad*100, needsRelay)

		if bestSFUID != "" && !needsRelay {
			targetSFUID = bestSFUID
			targetURL = bestURL
			log.Printf("[CP-VIEWER] Selected SFU %s (load: %.2f%%) for viewer", targetSFUID, bestLoad*100)
		}
		cp.mu.RUnlock()

		// If ingestion SFU is overloaded (>80%), try to create a relay node
		// This is done AFTER releasing the read lock to avoid deadlock
		if needsRelay {
			log.Printf("[CP-VIEWER] Ingestion SFU %s is overloaded (%.2f%%), attempting to create relay node",
				bestSFUID, bestLoad*100)

			// Check if relay creation is already in progress for this room
			// This prevents multiple concurrent relay creations when many viewers arrive at once
			cp.relayMu.Lock()
			if cp.relayCreating[roomID] {
				cp.relayMu.Unlock()
				log.Printf("[CP-VIEWER] Relay creation already in progress for room %s, using ingestion SFU", roomID)
				targetSFUID = bestSFUID
				targetURL = bestURL
			} else {
				cp.relayCreating[roomID] = true
				cp.relayMu.Unlock()

				// Try to create a relay node (this function takes its own locks)
				relaySFUID, relayURL, err := cp.createRelayNode(roomID, topology)

				// Clear the relay creation flag
				cp.relayMu.Lock()
				delete(cp.relayCreating, roomID)
				cp.relayMu.Unlock()

				if err != nil {
					log.Printf("[CP-VIEWER] Failed to create relay node: %v. Using overloaded ingestion SFU.", err)
					// Fall back to overloaded ingestion SFU
					targetSFUID = bestSFUID
					targetURL = bestURL
				} else {
					// Use the new relay node instead
					targetSFUID = relaySFUID
					targetURL = relayURL
					log.Printf("[CP-VIEWER] Created relay node %s, redirecting viewer there", relaySFUID)
				}
			}
		}
	}

	if targetSFUID == "" {
		log.Printf("[CP-VIEWER] No available SFU for viewer in room %s", roomID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "No available SFU for viewer",
		})
		return
	}

	// Return the SFU info to the viewer (NO PROXYING - direct connection)
	log.Printf("[CP-VIEWER] Returning SFU %s for direct viewer connection in room %s", targetSFUID, roomID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"sfu_id":     targetSFUID,
		"sfu_url":    targetURL,
		"room_id":    roomID,
		"viewer_url": fmt.Sprintf("%s/viewer?room_id=%s", targetURL, roomID),
	})
}

// HandleRecorder returns the ingestion SFU URL for recorder connection
// Unlike viewers, recorders must connect to the ingestion SFU (where the host stream is)
func (cp *ControlPlane) HandleRecorder(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	log.Printf("[CP-RECORDER] Received recorder request for room %s", roomID)

	// Check if room exists in topology
	cp.mu.RLock()
	topology, exists := cp.rooms[roomID]
	cp.mu.RUnlock()

	if !exists {
		log.Printf("[CP-RECORDER] Room %s not found in topology", roomID)
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	// Gate: only hand the recorder an SFU once the room is ready (task 5.4).
	if !cp.roomReadyForMedia(w, roomID) {
		return
	}

	// Get the ingestion SFU (recorder must be on the same SFU as the host)
	ingestionSFUID := topology.IngestionSFUID
	if ingestionSFUID == "" {
		log.Printf("[CP-RECORDER] No ingestion SFU for room %s", roomID)
		http.Error(w, "No ingestion SFU found for room", http.StatusNotFound)
		return
	}

	cp.mu.RLock()
	sfu, sfuExists := cp.sfus[ingestionSFUID]
	cp.mu.RUnlock()

	if !sfuExists || !sfu.Active {
		log.Printf("[CP-RECORDER] Ingestion SFU %s not available for room %s", ingestionSFUID, roomID)
		http.Error(w, "Ingestion SFU not available", http.StatusServiceUnavailable)
		return
	}

	log.Printf("[CP-RECORDER] Returning ingestion SFU %s for recorder in room %s", ingestionSFUID, roomID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"sfu_id":       ingestionSFUID,
		"sfu_url":      sfu.URL,
		"room_id":      roomID,
		"room_key":     topology.Key,
		"recorder_url": fmt.Sprintf("%s/recorder?room_id=%s&key=%s", sfu.URL, roomID, topology.Key),
	})
}

// HandleStreamStatus checks if a stream is active for a room
func (cp *ControlPlane) HandleStreamStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	log.Printf("[CP-STATUS] Checking stream status for room %s", roomID)

	// Check if room exists in topology
	cp.mu.RLock()
	topology, exists := cp.rooms[roomID]
	cp.mu.RUnlock()

	if !exists {
		// Room not found, stream is not active
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"active":  false,
			"room_id": roomID,
			"message": "Room not found",
		})
		return
	}

	// Check if ingestion SFU exists and is active
	cp.mu.RLock()
	ingestionSFUID := topology.IngestionSFUID
	var ingestionURL string
	if ingestionSFUID != "" {
		if sfu, ok := cp.sfus[ingestionSFUID]; ok && sfu.Active {
			ingestionURL = sfu.URL
		}
	}
	cp.mu.RUnlock()

	if ingestionURL == "" {
		// No active ingestion SFU, stream is not active
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"active":  false,
			"room_id": roomID,
			"message": "No active ingestion SFU",
		})
		return
	}

	// Query the ingestion SFU for actual stream status
	statusURL := fmt.Sprintf("%s/stream-status?room_id=%s", ingestionURL, roomID)
	client := &http.Client{Timeout: 3 * time.Second}

	resp, err := client.Get(statusURL)
	if err != nil {
		log.Printf("[CP-STATUS] Failed to query SFU %s: %v", ingestionSFUID, err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"active":  false,
			"room_id": roomID,
			"message": "Failed to query SFU",
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"active":  false,
			"room_id": roomID,
			"message": "SFU returned error",
		})
		return
	}

	// Parse SFU response
	var sfuStatus map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&sfuStatus); err != nil {
		log.Printf("[CP-STATUS] Failed to decode SFU response: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"active":  false,
			"room_id": roomID,
			"message": "Failed to parse SFU response",
		})
		return
	}

	// Return the status
	active, _ := sfuStatus["active"].(bool)

	log.Printf("[CP-STATUS] Room %s stream status: active=%v (from SFU %s)",
		roomID, active, ingestionSFUID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"active":  active,
		"room_id": roomID,
		"sfu_id":  ingestionSFUID,
	})
}

// HandleRoomViewerCount returns the total viewer count for a specific room across all SFUs
func (cp *ControlPlane) HandleRoomViewerCount(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	log.Printf("[CP-VIEWERS] Getting viewer count for room %s", roomID)

	// Check if room exists in topology
	cp.mu.RLock()
	topology, exists := cp.rooms[roomID]
	if !exists {
		cp.mu.RUnlock()
		// Room not found
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"room_id":      roomID,
			"viewer_count": 0,
			"message":      "Room not found",
		})
		return
	}

	// Get all SFU nodes in the topology
	sfuNodes := make(map[string]string) // SFUID -> URL
	for sfuID := range topology.Nodes {
		if sfu, ok := cp.sfus[sfuID]; ok && sfu.Active {
			sfuNodes[sfuID] = sfu.URL
		}
	}
	cp.mu.RUnlock()

	if len(sfuNodes) == 0 {
		// No active SFUs in topology
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"room_id":      roomID,
			"viewer_count": 0,
			"message":      "No active SFUs",
		})
		return
	}

	// Query all SFUs in parallel and sum viewer counts
	type sfuResult struct {
		sfuID       string
		viewerCount int
		err         error
	}

	resultChan := make(chan sfuResult, len(sfuNodes))

	for sfuID, sfuURL := range sfuNodes {
		go func(id, url string) {
			result := sfuResult{sfuID: id}

			viewersURL := fmt.Sprintf("%s/room/viewers?room_id=%s", url, roomID)
			client := &http.Client{Timeout: 3 * time.Second}

			resp, err := client.Get(viewersURL)
			if err != nil {
				log.Printf("[CP-VIEWERS] Failed to query SFU %s: %v", id, err)
				result.err = err
				resultChan <- result
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				log.Printf("[CP-VIEWERS] SFU %s returned status %d", id, resp.StatusCode)
				result.err = fmt.Errorf("status %d", resp.StatusCode)
				resultChan <- result
				return
			}

			// Parse SFU response
			var sfuResponse map[string]interface{}
			if err := json.NewDecoder(resp.Body).Decode(&sfuResponse); err != nil {
				log.Printf("[CP-VIEWERS] Failed to decode response from SFU %s: %v", id, err)
				result.err = err
				resultChan <- result
				return
			}

			// Extract viewer count
			if count, ok := sfuResponse["viewer_count"].(float64); ok {
				result.viewerCount = int(count)
			}

			resultChan <- result
		}(sfuID, sfuURL)
	}

	// Collect results
	totalViewers := 0
	sfuCounts := make(map[string]int)
	successCount := 0

	for i := 0; i < len(sfuNodes); i++ {
		result := <-resultChan
		if result.err == nil {
			totalViewers += result.viewerCount
			sfuCounts[result.sfuID] = result.viewerCount
			successCount++
			log.Printf("[CP-VIEWERS] SFU %s has %d viewer(s)", result.sfuID, result.viewerCount)
		}
	}

	log.Printf("[CP-VIEWERS] Room %s total: %d viewer(s) across %d SFU(s) (queried %d/%d)",
		roomID, totalViewers, successCount, successCount, len(sfuNodes))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"room_id":      roomID,
		"viewer_count": totalViewers,
		"sfu_count":    successCount,
		"sfu_details":  sfuCounts,
	})
}

// HandleRoomExists checks if a room exists in the topology (local check only, no SFU queries)
func (cp *ControlPlane) HandleRoomExists(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	log.Printf("[CP-EXISTS] Checking if room %s exists", roomID)

	// Check if room exists in topology (local check only)
	cp.mu.RLock()
	topology, exists := cp.rooms[roomID]
	if !exists {
		cp.mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"exists": false,
		})
		log.Printf("[CP-EXISTS] Room %s does not exist", roomID)
		return
	}

	// Room exists - get info from topology
	roomKey := topology.Key
	cp.mu.RUnlock()

	state := models.RoomReady // legacy rooms without lifecycle records
	if cp.roomState != nil {
		if room, ok := cp.roomState.Get(roomID); ok {
			state = room.State
		}
	}
	ready := state == models.RoomReady
	response := map[string]interface{}{
		"exists":  true,
		"room_id": roomID,
		"state":   string(state),
		"ready":   ready,
	}
	if ready {
		response["whip_url"] = cp.publicWHIPURL(r, roomID, roomKey)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
	log.Printf("[CP-EXISTS] Room %s exists", roomID)
}

func (cp *ControlPlane) operatorStatus() operatorStatusResponse {
	now := time.Now().UTC()

	cp.mu.RLock()
	registeredSFUs := make([]operatorSFUStatus, 0, len(cp.sfus))
	activeSFUs := 0
	for _, sfu := range cp.sfus {
		status := operatorSFUStatus{
			ID:            sfu.ID,
			URL:           sfu.URL,
			Region:        sfu.Region,
			Zone:          sfu.Zone,
			Active:        sfu.Active,
			LastHeartbeat: sfu.LastHeartbeat,
		}
		if sfu.Active {
			activeSFUs++
		}
		if sfu.Metrics != nil {
			status.CPU = sfu.Metrics.CPU
			status.Memory = sfu.Metrics.Memory
			status.ActiveHosts = sfu.Metrics.ActiveHosts
			status.ActiveViewers = sfu.Metrics.ActiveViewers
		}
		registeredSFUs = append(registeredSFUs, status)
	}
	cp.mu.RUnlock()

	sort.Slice(registeredSFUs, func(i, j int) bool {
		return registeredSFUs[i].ID < registeredSFUs[j].ID
	})

	cp.cleanupMu.Lock()
	pendingCleanupRooms := make([]string, 0, len(cp.pendingCleanups))
	for roomID := range cp.pendingCleanups {
		pendingCleanupRooms = append(pendingCleanupRooms, roomID)
	}
	cp.cleanupMu.Unlock()
	sort.Strings(pendingCleanupRooms)

	var rooms []models.RoomLifecycle
	var workers []models.WorkerRecord
	lifecycleStoreAvailable := cp.roomState != nil
	if cp.roomState != nil {
		rooms = cp.roomState.List()
		workers = cp.roomState.ListWorkers()
	}

	sort.Slice(rooms, func(i, j int) bool {
		return rooms[i].RoomID < rooms[j].RoomID
	})
	sort.Slice(workers, func(i, j int) bool {
		return workers[i].SFUID < workers[j].SFUID
	})

	roomsByState := make(map[models.RoomState]int)
	workersByState := make(map[models.WorkerState]int)
	failures := make([]operatorFailureStatus, 0)

	for _, room := range rooms {
		roomsByState[room.State]++
		if room.State == models.RoomFailed {
			failures = append(failures, operatorFailureStatus{
				Kind:   "room",
				ID:     room.RoomID,
				State:  string(room.State),
				Reason: room.Reason,
			})
		}
	}
	for _, worker := range workers {
		workersByState[worker.State]++
		if worker.State == models.WorkerFailed {
			failures = append(failures, operatorFailureStatus{
				Kind:   "worker",
				ID:     worker.SFUID,
				State:  string(worker.State),
				Reason: worker.Reason,
			})
		}
	}

	sort.Slice(failures, func(i, j int) bool {
		if failures[i].Kind == failures[j].Kind {
			return failures[i].ID < failures[j].ID
		}
		return failures[i].Kind < failures[j].Kind
	})

	return operatorStatusResponse{
		GeneratedAt:             now,
		LifecycleStoreAvailable: lifecycleStoreAvailable,
		Counts: operatorStatusCounts{
			RegisteredSFUs: len(registeredSFUs),
			ActiveSFUs:     activeSFUs,
			RoomsByState:   roomsByState,
			WorkersByState: workersByState,
		},
		RegisteredSFUs:       registeredSFUs,
		Rooms:                rooms,
		Workers:              workers,
		ProvisioningFailures: failures,
		PendingCleanupRooms:  pendingCleanupRooms,
	}
}

// HandleOperatorStatus exposes a compact operational snapshot for active SFUs,
// worker lifecycle, provisioning failures, and scheduled cleanup actions.
func (cp *ControlPlane) HandleOperatorStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cp.operatorStatus())
}

// HandleRoomStatus reports a room's lifecycle state so a streamer can poll a
// cold-start room from `provisioning` to `ready` or `failed` (task 5.2). The
// WHIP URL is returned only once the room is ready, so the frontend cannot show
// publish instructions early (tasks 5.4/6.2).
func (cp *ControlPlane) HandleRoomStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		http.Error(w, "room_id parameter is required", http.StatusBadRequest)
		return
	}

	cp.mu.RLock()
	topology, exists := cp.rooms[roomID]
	key := ""
	if exists {
		key = topology.Key
	}
	cp.mu.RUnlock()

	// Prefer the persisted lifecycle state; fall back to topology presence for
	// rooms created before lifecycle tracking (treated as ready).
	var state models.RoomState
	reason := ""
	if cp.roomState != nil {
		if rl, ok := cp.roomState.Get(roomID); ok {
			state, reason = rl.State, rl.Reason
		}
	}
	if state == "" && exists {
		state = models.RoomReady
	}

	w.Header().Set("Content-Type", "application/json")
	if state == "" {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{"room_id": roomID, "exists": false})
		return
	}

	ready := state == models.RoomReady
	resp := map[string]interface{}{
		"room_id": roomID,
		"state":   string(state),
		"ready":   ready,
	}
	if reason != "" {
		resp["reason"] = reason
	}
	if ready && key != "" {
		resp["whip_url"] = cp.publicWHIPURL(r, roomID, key)
	}
	json.NewEncoder(w).Encode(resp)
}

func (cp *ControlPlane) publicWHIPURL(r *http.Request, roomID, key string) string {
	cp.mu.RLock()
	base := cp.publicURL
	cp.mu.RUnlock()
	if base == "" {
		scheme := firstForwardedValue(r.Header.Get("X-Forwarded-Proto"))
		if scheme == "" {
			if r.TLS != nil {
				scheme = "https"
			} else {
				scheme = "http"
			}
		}
		host := firstForwardedValue(r.Header.Get("X-Forwarded-Host"))
		if host == "" {
			host = r.Host
		}
		base = scheme + "://" + host
	}
	query := url.Values{"room_id": {roomID}, "key": {key}}
	return strings.TrimRight(base, "/") + "/whip?" + query.Encode()
}

func firstForwardedValue(value string) string {
	if first, _, ok := strings.Cut(value, ","); ok {
		return strings.TrimSpace(first)
	}
	return strings.TrimSpace(value)
}
