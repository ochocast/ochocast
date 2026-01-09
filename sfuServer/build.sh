#!/bin/bash

set -e

echo "Building SFU Server with Control Plane..."

# Build Control Plane
echo "Building Control Plane..."
go build -o bin/controlplane cmd/controlplane/main.go
echo "✓ Control Plane built -> bin/controlplane"

# Build SFU Server
echo "Building SFU Server..."
go build -o bin/whip-server main.go server.go handlers.go models.go room.go broadcaster.go utils.go
echo "✓ SFU Server built -> bin/whip-server"

echo ""
echo "Build complete! Binaries are in the bin/ directory"
echo ""
echo "To run:"
echo "  ./bin/controlplane              # Start control plane"
echo "  ./bin/whip-server               # Start SFU server"
echo ""
echo "See CONTROL_PLANE.md for detailed instructions"
