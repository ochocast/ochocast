# Simple SFU Server with WHIP Support

This project implements a simple Selective Forwarding Unit (SFU) WebRTC server using Pion WebRTC in Go.

## Features

- **WHIP Protocol Support**: Receive WebRTC streams from broadcasters (OBS, FFmpeg, etc.)
- **Multi-viewer Broadcasting**: Efficiently distribute streams to multiple viewers
- **Cascade Architecture**: Scale horizontally with Origin and Edge SFU servers
- **Room Management**: Create, manage, and delete streaming rooms
- **Health Monitoring**: Check stream status and server health

## Run

Lauch the Scaleway instance and connect via SSH.

Build the server:
```bash
go build -o server.exe
```

Run the server:
```bash
./server.exe
```

## Architecture Modes

### Standalone Mode

Single SFU server handling both broadcaster and viewers.

```
Broadcaster → SFU Server → Viewers
```

**Configuration:**
```bash
SFU_MODE=standalone
SERVER_PORT=8090
```

### Hybrid Mode (Recommended) 🌟

**Each server can be both Origin and Edge** depending on the room. The origin is determined automatically using consistent hashing.

```
┌────────────────────────────────────┐
│  SFU A (192.168.1.10)             │
│  ├─ Origin: room1, room4, room7   │
│  └─ Edge: room2, room3, room5     │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│  SFU B (192.168.1.11)             │
│  ├─ Origin: room2, room5, room8   │
│  └─ Edge: room1, room3, room4     │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│  SFU C (192.168.1.12)             │
│  ├─ Origin: room3, room6, room9   │
│  └─ Edge: room1, room2, room4     │
└────────────────────────────────────┘
```

**Server A Configuration:**
```bash
SFU_MODE=hybrid
SERVER_PORT=8090
SERVER_URL=http://192.168.1.10:8090
PEER_SFU_URLS=http://192.168.1.11:8091,http://192.168.1.12:8092
CASCADE_AUTH_KEY=your-secure-key
```

**Server B Configuration:**
```bash
SFU_MODE=hybrid
SERVER_PORT=8091
SERVER_URL=http://192.168.1.11:8091
PEER_SFU_URLS=http://192.168.1.10:8090,http://192.168.1.12:8092
CASCADE_AUTH_KEY=your-secure-key
```

**Benefits:**
- ✅ No Single Point of Failure
- ✅ Automatic load distribution
- ✅ Simple horizontal scaling
- ✅ Geographic redundancy

**See:** [HYBRID_CLUSTER_ARCHITECTURE.md](./HYBRID_CLUSTER_ARCHITECTURE.md) for detailed documentation.

### Benefits of Cascade Architecture

- **Scalability**: Distribute viewers across multiple servers
- **Geo-distribution**: Place Edge SFUs close to viewers to reduce latency
- **Bandwidth Optimization**: Origin SFU sends only one stream per Edge SFU
- **Resilience**: Multiple Edge SFUs provide redundancy

## API Endpoints

### Room Management

- `POST /room/create` - Create a new streaming room
- `GET /room/get?room_id=<id>` - Get room information
- `DELETE /room/delete?room_id=<id>&key=<key>` - Delete a room
- `GET /stream-status?room_id=<id>` - Check if stream is active

### Streaming

- `POST /whip?room_id=<id>&key=<key>` - WHIP endpoint for broadcasters
- `POST /viewer?room_id=<id>` - Connect as a viewer
- `POST /promote?room_id=<id>&key=<key>&viewer_id=<id>` - Promote viewer to speaker (multi-publisher)
- `POST /demote?room_id=<id>&key=<key>&publisher_id=<id>` - Demote speaker back to viewer

### Cluster Management (Hybrid Mode)

- `POST /cluster/register` - Register a peer SFU in the cluster
- `GET /cluster/peers` - Get list of peer SFUs and cluster status

### Cascade (Multi-SFU)

- `POST /cascade/subscribe?room_id=<id>&cascade_key=<key>` - Edge SFU subscribes to Origin
- `POST /cascade/publish?room_id=<id>` - Edge SFU receives stream from Origin

### Health

- `GET /health` - Server health check

## Host

Open OBS, the minimum version is 31.X.XX

Go to Settings -> Stream, select "WHIP" as the service, and enter the server URL:

```
http://<scaleway-server-ip>:8090/whip?room_id=<your-room-id>&key=<your-room-key>
```

## Example: Multi-Region Setup

### 1. Start Origin SFU (Main Server)

```bash
# .env
SFU_MODE=origin
SERVER_PORT=8090
CASCADE_AUTH_KEY=my-cascade-secret

# Run
./server.exe
```

### 2. Start Edge SFU in Europe

```bash
# .env
SFU_MODE=edge
SERVER_PORT=8091
UPSTREAM_SFU_URL=http://origin-sfu.example.com:8090
CASCADE_AUTH_KEY=my-cascade-secret

# Run
./server.exe
```

### 3. Start Edge SFU in Asia

```bash
# .env
SFU_MODE=edge
SERVER_PORT=8092
UPSTREAM_SFU_URL=http://origin-sfu.example.com:8090
CASCADE_AUTH_KEY=my-cascade-secret

# Run
./server.exe
```

### 4. Broadcaster connects to Origin

```
OBS → http://origin-sfu.example.com:8090/whip?room_id=stream123&key=xyz
```

### 5. Viewers connect to nearest Edge

```
European Viewers → http://europe-edge.example.com:8091/viewer?room_id=stream123
Asian Viewers    → http://asia-edge.example.com:8092/viewer?room_id=stream123
```

## Multi-Publisher Support

The SFU supports multiple publishers (speakers) in a single room, enabling interactive scenarios like webinars, panel discussions, or co-streaming.

### Architecture

```
Room "stream123"
├─ Host (Publisher 1)     → Video + Audio
├─ Speaker 1 (Publisher 2) → Audio only
├─ Speaker 2 (Publisher 3) → Video + Audio
└─ Viewers → Receive all tracks from all publishers
```

### How it Works

1. **Host starts streaming** via WHIP endpoint
2. **Viewer joins** and watches the stream
3. **Host promotes viewer** to speaker using `/promote` endpoint
4. **Viewer publishes** their own audio/video tracks
5. **All viewers** receive tracks from both host and speakers
6. **Host can demote** speaker back to viewer using `/demote` endpoint

### Example Flow

```bash
# 1. Create room
curl -X POST http://localhost:8090/room/create
# Response: {"room_id": "abc123", "key": "xyz789"}

# 2. Host connects (OBS)
# WHIP URL: http://localhost:8090/whip?room_id=abc123&key=xyz789

# 3. Viewer connects
curl -X POST http://localhost:8090/viewer?room_id=abc123 \
  -H "Content-Type: application/sdp" \
  --data-binary @viewer-offer.sdp

# 4. Promote viewer to speaker (from host/frontend)
curl -X POST "http://localhost:8090/promote?room_id=abc123&key=xyz789&viewer_id=viewer1" \
  -H "Content-Type: application/sdp" \
  --data-binary @speaker-offer.sdp
# Response: SDP answer for the promoted speaker

# 5. Demote speaker (when finished speaking)
curl -X POST "http://localhost:8090/demote?room_id=abc123&key=xyz789&publisher_id=speaker-viewer1"
# Response: {"status": "demoted", "publisher_id": "speaker-viewer1"}
```

### Use Cases

- **🎤 Webinars**: Host + 2-3 guest speakers + audience
- **🎮 Co-streaming**: Main streamer + guest co-streamer
- **🎓 Virtual Classroom**: Teacher + students who raise hand to speak
- **🎙️ Podcast**: Multiple hosts discussing together
- **💼 Panel Discussions**: Moderator + multiple panelists

### Benefits

- ✅ **Scalable**: Each publisher has independent peer connection
- ✅ **Flexible**: Mix of video+audio or audio-only publishers
- ✅ **Compatible with Cascade**: All tracks forwarded through Edge SFUs
- ✅ **Dynamic**: Promote/demote speakers in real-time without restarting stream