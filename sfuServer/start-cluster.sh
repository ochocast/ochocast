#!/bin/bash

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Start Control Plane in the background
echo "Starting Control Plane..."
export CONTROL_PLANE_PORT=8090
./bin/controlplane &
CP_PID=$!
echo "Control Plane started (PID: $CP_PID)"

# Wait for control plane to be ready
sleep 2

# Start SFU 1
echo "Starting SFU 1..."
export SFU_ID="sfu-1"
export SERVER_URL="http://localhost:8091"
export SERVER_PORT="8091"
export CONTROL_PLANE_URL="http://localhost:8090"
export SFU_REGION="us-east"
export SFU_ZONE="zone-a"
./bin/whip-server &
SFU1_PID=$!
echo "SFU 1 started (PID: $SFU1_PID)"

# Start SFU 2
echo "Starting SFU 2..."
export SFU_ID="sfu-2"
export SERVER_URL="http://localhost:8092"
export SERVER_PORT="8092"
export CONTROL_PLANE_URL="http://localhost:8090"
export SFU_REGION="us-east"
export SFU_ZONE="zone-b"
./bin/whip-server &
SFU2_PID=$!
echo "SFU 2 started (PID: $SFU2_PID)"

# Start SFU 3
echo "Starting SFU 3..."
export SFU_ID="sfu-3"
export SERVER_URL="http://localhost:8093"
export SERVER_PORT="8093"
export CONTROL_PLANE_URL="http://localhost:8090"
export SFU_REGION="us-west"
export SFU_ZONE="zone-a"
./bin/whip-server &
SFU3_PID=$!
echo "SFU 3 started (PID: $SFU3_PID)"

echo ""
echo "All services started!"
echo "Control Plane: http://localhost:8090 (PID: $CP_PID)"
echo "SFU 1: http://localhost:8091 (PID: $SFU1_PID)"
echo "SFU 2: http://localhost:8092 (PID: $SFU2_PID)"
echo "SFU 3: http://localhost:8093 (PID: $SFU3_PID)"
echo ""
echo "To stop all services:"
echo "  kill $CP_PID $SFU1_PID $SFU2_PID $SFU3_PID"
echo ""
echo "Or save PIDs to a file:"
cat > .pids << EOF
$CP_PID
$SFU1_PID
$SFU2_PID
$SFU3_PID
EOF
echo "  kill \$(cat .pids)"
