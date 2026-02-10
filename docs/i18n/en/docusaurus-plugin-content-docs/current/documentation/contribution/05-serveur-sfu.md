# SFU Server

The **SFU server** (Selective Forwarding Unit) is the component responsible for real-time video distribution in OchoCast. It receives the WebRTC stream from a broadcaster (OBS, browser…) and redistributes it to all connected viewers without transcoding. It is written in **Go** using the [Pion WebRTC](https://github.com/pion/webrtc) library.

## 1. Architecture Overview

```
                          ┌──────────────────┐
                          │   Control Plane  │
                          │  (orchestrator)  │
                          └────────┬─────────┘
                                   │ metrics / topology
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
              │  SFU (A)  │  │  SFU (B)  │  │  SFU (C)  │
              │  origin   │  │  relay    │  │  relay    │
              └──┬──┬──┬──┘  └──┬──┬──┬──┘  └──┬──┬──┬──┘
     Host ──────►│  │  │        │  │  │        │  │  │
                 ▼  ▼  ▼        ▼  ▼  ▼        ▼  ▼  ▼
                 Viewers        Viewers        Viewers
```

The SFU can operate in **standalone mode** (single server) or in **distributed mode** (cluster of SFUs coordinated by a **Control Plane**).

---

## 2. Code Structure

```
sfuServer/
├── main.go                 # Entry point, HTTP route registration
├── server.go               # SFUServer: room management, cascade, metrics
├── room.go                 # Room: room management (host, viewers, tracks)
├── broadcaster.go          # TrackBroadcaster: RTP reading and optimized writing
├── handlers.go             # HTTP handlers (WHIP, viewer, cascade, promote…)
├── models.go               # Data structures (Room, SFUServer, etc.)
├── utils.go                # Utilities (ID/key generation)
├── cmd/
│   └── controlplane/
│       └── main.go         # Control Plane entry point
├── pkg/
│   ├── controlplane/
│   │   └── controlplane.go # Control Plane logic (topology, load balancing)
│   └── metrics/
│       └── collector.go    # Metrics collector (CPU, memory, rooms)
└── internal/
    └── models/
        └── shared.go       # Models shared between SFU and Control Plane
```

---

## 3. Key Concepts

### 3.1. Room

A `Room` represents a streaming room. It contains:

| Field | Type | Description |
|---|---|---|
| `Host` | `*webrtc.PeerConnection` | Primary broadcaster connection |
| `Publishers` | `map[string]*webrtc.PeerConnection` | Additional speakers (promoted from viewers) |
| `Viewers` | `map[string]*webrtc.PeerConnection` | Connected viewers |
| `Broadcasters` | `map[string]*TrackBroadcaster` | One broadcaster per audio/video track |
| `SharedTracks` | `map[string]*TrackLocalStaticRTP` | Tracks shared among all viewers |
| `RecorderTracks` | `map[string]*TrackLocalStaticRTP` | Dedicated tracks for the recorder (lossless) |
| `IsOrigin` | `bool` | `true` if this SFU is the origin for this room |
| `OriginURL` | `string` | Origin SFU URL (if edge/relay) |

**Lifecycle:**

```
POST /room/create  →  Room created (key generated)
POST /whip         →  Host connected, tracks received, StreamActive = true
POST /viewer       →  Viewer added, receives SharedTracks
Host disconnects   →  Grace period (10 min) then deletion
DELETE /room/delete →  Immediate deletion
```

### 3.2. TrackBroadcaster

The `TrackBroadcaster` is the core of the media pipeline. For each audio or video track from the host, a broadcaster is created.

**Optimized pipeline:**

```
TrackRemote (host)
    │
    ▼
  readLoop()          ← reads RTP packets from host
    │
    ├──► writeQueueCh (20,000 packets)    ← async buffer for viewers
    │        │
    │        ▼
    │    asyncWriteLoop() × 4 goroutines  ← writes to SharedTrack
    │        │
    │        ▼
    │    SharedTrack ──► All viewers       ← 1 single shared track
    │
    └──► recorderCh (50,000 packets)      ← dedicated buffer for recorder
             │
             ▼
         recorderWriteLoop()              ← lossless writing
             │
             ▼
         RecorderTrack ──► Recorder
```

**Key optimizations:**

- **SharedTracks**: A single `TrackLocalStaticRTP` is shared by all viewers. No M×N allocation (M tracks × N viewers).
- **sync.Pool**: RTP packet buffers (1,500 bytes) are recycled via a global pool to reduce GC pressure.
- **Dedicated recorder**: The recorder has its own tracks and a 50,000-packet buffer (~16 seconds at 30 fps). It is not affected by drops caused by viewer congestion.
- **Multi-writer**: 4 parallel goroutines write to the `SharedTrack`, enabling linear scalability.

### 3.3. WebRTC Signaling (WHIP)

The SFU uses the **WHIP** (WebRTC HTTP Ingestion Protocol) protocol to receive the broadcaster's stream:

1. The client sends an **SDP Offer** via `POST /whip?room_id=...&key=...`
2. The SFU creates a `PeerConnection` and configures `OnTrack` handlers
3. The SFU generates an **SDP Answer** and returns it
4. ICE gathering completes, the WebRTC connection is established
5. Audio/video tracks arrive via `OnTrack` → `room.AddTrack()`

For **viewers**, the flow is reversed:
1. The viewer sends an SDP Offer via `POST /viewer?room_id=...`
2. The SFU adds the existing `SharedTracks` to the `PeerConnection`
3. The SFU returns the SDP Answer

---

## 4. Distributed Mode (Cascade)

### 4.1. Control Plane

The **Control Plane** is a separate service that orchestrates the SFU cluster. It is responsible for:

- **Registration**: each SFU registers at startup via `POST /control/register_sfu`
- **Metrics**: each SFU sends its metrics (CPU, memory, viewers) every 5 seconds
- **Topology**: it maintains a broadcast tree per room (ingestion → relay → viewer-pool)
- **Load balancing**: it directs viewers to the optimal SFU
- **Cascade**: it triggers cascade connections between SFUs when needed

**Node roles in the topology:**

| Role | Description |
|---|---|
| `ingestion` | SFU that receives the host's stream (origin) |
| `relay` | Intermediate SFU that redistributes the stream |
| `viewer-pool` | Terminal SFU that serves viewers |

### 4.2. Cascade Connection

When a viewer connects to an SFU that does not have the stream:

1. The Control Plane identifies the origin SFU (ingestion)
2. It instructs the edge SFU to subscribe via `POST /cascade/subscribe`
3. The edge SFU creates a `PeerConnection` to the origin SFU
4. Tracks are received as if they came from a local host
5. Local viewers receive the stream via the usual `SharedTracks`

```
SFU Origin                          SFU Edge
   │                                    │
   │◄── POST /cascade/subscribe ────────│  (SDP Offer)
   │                                    │
   │──── SDP Answer ───────────────────►│
   │                                    │
   │════ WebRTC media stream ══════════►│
   │                                    │
   │                              Local viewers
```

### 4.3. Grace Period

When the host disconnects (e.g., OBS restart), a **10-minute** grace period is triggered before the room is deleted. This allows the host to reconnect without losing the room key or the viewers.

---

## 5. HTTP API

### Room Management

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/room/create` | Create a room (returns `room_id` and `key`) |
| `GET` | `/room/get?room_id=` | Get room information |
| `GET` | `/room/exists?room_id=` | Check existence and get WHIP URL |
| `DELETE` | `/room/delete?room_id=` | Delete a room |
| `GET` | `/room/viewers?room_id=` | Number of viewers in a room |
| `GET` | `/stream-status?room_id=` | Check if the stream is active |

### Streaming

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/whip?room_id=&key=` | WHIP ingestion (OBS, FFmpeg…). Body: SDP Offer |
| `POST` | `/viewer?room_id=` | Viewer connection. Body: SDP Offer |
| `POST` | `/recorder?room_id=` | Recorder connection (dedicated tracks, lossless) |
| `POST` | `/promote?room_id=&key=&viewer_id=` | Promote a viewer to speaker |
| `POST` | `/demote?room_id=&key=&publisher_id=` | Demote a speaker to viewer |

### Cascade (multi-SFU)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/cascade/subscribe?room_id=` | Edge SFU subscribes to the origin's stream |
| `POST` | `/cascade/publish?room_id=` | Edge SFU receives the stream from origin |
| `POST` | `/cascade/disconnect?room_id=` | Disconnect cascade for a room |
| `POST` | `/cascade/remove-downstream?room_id=&child_sfu_id=` | Remove a downstream SFU |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check |

---

## 6. Configuration

Configuration is done via environment variables (`.env` file).

### Main Variables

| Variable | Default | Description |
|---|---|---|
| `SERVER_PORT` | `8090` | Server HTTP port |
| `SERVER_URL` | `http://localhost:8090` | SFU public URL |
| `ENABLE_HTTPS` | `false` | Enable HTTPS |
| `CERT_FILE` / `KEY_FILE` | `cert.pem` / `key.pem` | TLS certificates |
| `SFU_ID` | auto-generated | Unique SFU identifier |
| `CONTROL_PLANE_URL` | *(empty)* | Control Plane URL (cluster mode) |
| `SFU_REGION` / `SFU_ZONE` | *(empty)* | Region and zone for metrics |

### ICE / NAT Traversal

| Variable | Default | Description |
|---|---|---|
| `STUN_SERVERS` | Google STUN | STUN servers (comma-separated) |
| `TURN_SERVER` | *(empty)* | TURN server (required behind symmetric NAT) |
| `TURN_USERNAME` / `TURN_PASSWORD` | *(empty)* | TURN credentials |
| `PUBLIC_IP` | *(empty)* | Public IP for NAT1To1 (Docker / containers) |
| `ENABLE_ICE_TCP` | `false` | Enable ICE-TCP candidates |
| `ICE_RELAY_ONLY` | `false` | Force relay mode (everything through TURN) |

---

## 7. Multi-Publisher (Promote / Demote)

The SFU supports multiple publishers in a single room, enabling interactive scenarios (webinars, co-streaming, virtual classrooms).

**Flow:**

1. The host starts streaming via `/whip`
2. A viewer joins via `/viewer`
3. The host promotes a viewer to speaker via `POST /promote` (with the room `key`)
4. The speaker sends an SDP Offer and receives their own tracks
5. All viewers receive tracks from both the host **and** the speaker
6. The host can demote the speaker via `POST /demote`

Each publisher has its own independent `PeerConnection`. Tracks from all publishers are added to the room's `SharedTracks`.

---

## 8. Recorder (Lossless Recording)

The recorder connects via `POST /recorder?room_id=` and benefits from a dedicated path:

- Separate `RecorderTracks` from the viewers' `SharedTracks`
- A **50,000-packet** buffer (vs 20,000 for viewers)
- **No packet drops**: the recorder channel is blocking (no `default` case)
- A dedicated `recorderWriteLoop()`, independent from the viewer fan-out

This guarantees maximum recording quality, even under heavy viewer load.

---

## 9. Running the Server Locally

### Prerequisites

- **Go 1.21+** installed

### Quick Start

```bash
cd sfuServer
cp .env.example .env
# Edit .env as needed (defaults work for standalone mode)

go build -o server.exe
./server.exe
```

The server listens by default on `http://localhost:8090`.

### Testing with OBS

1. OBS ≥ 31.x → Settings → Stream → Service: **WHIP**
2. URL: `http://localhost:8090/whip?room_id=<ID>&key=<KEY>`
3. The ID and key are returned by `POST /room/create`

### Local Cluster (3 SFUs + Control Plane)

```bash
# Terminal 1: Control Plane
CONTROL_PLANE_PORT=8090 go run cmd/controlplane/main.go

# Terminal 2: SFU 1
SFU_ID=sfu-1 SERVER_PORT=8091 SERVER_URL=http://localhost:8091 \
  CONTROL_PLANE_URL=http://localhost:8090 go run .

# Terminal 3: SFU 2
SFU_ID=sfu-2 SERVER_PORT=8092 SERVER_URL=http://localhost:8092 \
  CONTROL_PLANE_URL=http://localhost:8090 go run .

# Terminal 4: SFU 3
SFU_ID=sfu-3 SERVER_PORT=8093 SERVER_URL=http://localhost:8093 \
  CONTROL_PLANE_URL=http://localhost:8090 go run .
```

---

## 10. Contributor Guide

### Adding a New Endpoint

1. Create the handler function in `handlers.go`:
   ```go
   func handleMyEndpoint(w http.ResponseWriter, r *http.Request) {
       setCORSHeaders(w, "POST, OPTIONS")
       // ...
   }
   ```
2. Register the route in `main.go`:
   ```go
   http.HandleFunc("/my-endpoint", handleMyEndpoint)
   ```

### Adding a Feature to a Room

1. Add the field to the `Room` struct (`models.go`)
2. Initialize the field in `NewRoom()` (`room.go`)
3. Implement the business logic in `room.go`
4. **Always** use `room.mu.Lock()` / `room.mu.RLock()` for concurrent access

### Modifying the Media Pipeline

The pipeline is in `broadcaster.go`. Key considerations:

- **readLoop()**: reads packets from the host. Never block here.
- **writeQueueCh**: if you change the buffer size, consider the memory impact (20,000 × 1,500 bytes = ~30 MB per track).
- **sync.Pool**: buffers must be returned to the pool after use to prevent memory leaks.
- **recorderCh**: never add a `default` case (no-drop policy).

### Adding a New Client Type

Follow the recorder pattern:

1. Create a `room.AddMyClient()` method in `room.go`
2. Create dedicated tracks if needed (like `RecorderTracks`)
3. Register a `SetMyClientTrack()` handler in the broadcaster if needed
4. Add disconnect handlers (`OnICEConnectionStateChange`, `OnConnectionStateChange`)
5. Create the HTTP handler in `handlers.go`

### Conventions

- **Logs**: use bracketed prefixes: `[WHIP]`, `[ROOM-%s]`, `[CASCADE]`, `[EDGE]`, etc.
- **Concurrency**: always protect access to `Room` and `SFUServer` with the appropriate mutexes (`mu.Lock()` for writes, `mu.RLock()` for reads).
- **Cleanup**: handle disconnection via `OnICEConnectionStateChange` and `OnConnectionStateChange` with a `removeOnce` pattern to avoid double-close.
- **Naming**: viewer/publisher IDs follow the pattern `viewer-<addr>-<ptr>` or `speaker-<viewerID>`.
