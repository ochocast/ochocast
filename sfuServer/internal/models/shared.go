package models

import "time"

// TopologyNode represents a SFU node in the dynamic tree
type TopologyNode struct {
	SFUID      string        `json:"sfu_id"`
	RoomID     string        `json:"room_id"`
	Role       string        `json:"role"` // "ingestion", "relay", "viewer-pool"
	ParentID   string        `json:"parent_id"`
	Children   []string      `json:"children"`
	Load       float64       `json:"load"`
	MaxLoad    float64       `json:"max_load"`
	Health     HealthMetrics `json:"health"`
	LastUpdate time.Time     `json:"last_update"`
}

// HealthMetrics contains health information for a SFU
type HealthMetrics struct {
	CPU           float64        `json:"cpu"`    // 0.0 to 1.0
	Memory        float64        `json:"memory"` // 0.0 to 1.0
	ActiveHosts   int            `json:"active_hosts"`
	ActiveViewers int            `json:"active_viewers"`
	Bandwidth     float64        `json:"bandwidth"`  // Mbps
	RTTMatrix     map[string]int `json:"rtt_matrix"` // SFU_ID -> RTT in ms
	LastHeartbeat time.Time      `json:"last_heartbeat"`
}

// SFUMetrics is sent by each SFU to the control plane
type SFUMetrics struct {
	SFUID         string               `json:"sfu_id"`
	ServerURL     string               `json:"server_url"`
	CPU           float64              `json:"cpu"`
	Memory        float64              `json:"memory"`
	ActiveHosts   int                  `json:"active_hosts"`
	ActiveViewers int                  `json:"active_viewers"`
	Bandwidth     float64              `json:"bandwidth"`
	RTTMatrix     map[string]int       `json:"rtt_matrix"`
	Timestamp     time.Time            `json:"timestamp"`
	RoomStats     map[string]RoomStats `json:"room_stats,omitempty"` // RoomID -> stats
	GCCount       int                  `json:"gc_count,omitempty"`   // Number of garbage collections for debugging
}

// RoomStats contains per-room statistics
type RoomStats struct {
	ViewerCount int  `json:"viewer_count"`
	IsActive    bool `json:"is_active"` // Has active broadcaster
}

// RoomTopology represents the complete topology tree for a room
type RoomTopology struct {
	RoomID         string                   `json:"room_id"`
	Key            string                   `json:"key"` // Room authentication key
	IngestionSFUID string                   `json:"ingestion_sfu_id"`
	Nodes          map[string]*TopologyNode `json:"nodes"` // SFUID -> TopologyNode
	LastRebalance  time.Time                `json:"last_rebalance"`
	CreatedAt      time.Time                `json:"created_at"`
}

// SFURegistration is sent when a SFU registers with the control plane
type SFURegistration struct {
	SFUID     string `json:"sfu_id"`
	ServerURL string `json:"server_url"`
	Region    string `json:"region,omitempty"`
	Zone      string `json:"zone,omitempty"`
}

// JoinHostRequest is sent when a host wants to start streaming
type JoinHostRequest struct {
	RoomID string `json:"room_id"`
	HostID string `json:"host_id"`
}

// JoinHostResponse returns the ingestion SFU for the host
type JoinHostResponse struct {
	IngestionSFUID string `json:"ingestion_sfu_id"`
	IngestionURL   string `json:"ingestion_url"`
	ShouldAccept   bool   `json:"should_accept"` // True if this SFU should accept
}

// JoinViewerRequest is sent when a viewer wants to watch
type JoinViewerRequest struct {
	RoomID         string `json:"room_id"`
	ViewerID       string `json:"viewer_id"`
	ViewerLocation string `json:"viewer_location,omitempty"` // Optional: geo hint
	CurrentSFUID   string `json:"current_sfu_id"`            // SFU receiving the request
}

// JoinViewerResponse returns the optimal SFU for the viewer
type JoinViewerResponse struct {
	OptimalSFUID string `json:"optimal_sfu_id"`
	OptimalURL   string `json:"optimal_url"`
	ShouldAccept bool   `json:"should_accept"`           // True if current SFU should accept
	ParentSFUID  string `json:"parent_sfu_id,omitempty"` // If this SFU needs to pull from parent
	ParentURL    string `json:"parent_url,omitempty"`
}

// SetParentRequest instructs a SFU to pull from a parent
type SetParentRequest struct {
	RoomID    string `json:"room_id"`
	ParentID  string `json:"parent_id"`
	ParentURL string `json:"parent_url"`
}

// AddChildRequest instructs a SFU to accept a child connection
type AddChildRequest struct {
	RoomID   string `json:"room_id"`
	ChildID  string `json:"child_id"`
	ChildURL string `json:"child_url"`
}

// RebalanceRequest triggers a topology rebalance
type RebalanceRequest struct {
	RoomID string `json:"room_id"`
	Reason string `json:"reason,omitempty"`
}

// TopologyResponse returns the current topology for a room
type TopologyResponse struct {
	Topology *RoomTopology `json:"topology"`
}

// CreateRoomRequest is sent to create a new room
type CreateRoomRequest struct {
	RoomID string `json:"room_id"`
}

// CreateRoomResponse returns the room creation result
type CreateRoomResponse struct {
	RoomID  string `json:"room_id"`
	Key     string `json:"key"`
	Created bool   `json:"created"` // True if newly created, false if already exists
}

// SyncRoomRequest is sent by control plane to sync room creation across SFUs
type SyncRoomRequest struct {
	RoomID string `json:"room_id"`
	Key    string `json:"key"`
}
