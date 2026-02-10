# Build script for SFU Server with Control Plane

$ErrorActionPreference = "Stop"

Write-Host "Building SFU Server with Control Plane..." -ForegroundColor Cyan

# Create bin directory if it doesn't exist
if (-not (Test-Path "bin")) {
    New-Item -ItemType Directory -Path "bin" | Out-Null
}

# Build Control Plane
Write-Host "Building Control Plane..." -ForegroundColor Yellow
go build -o bin/controlplane.exe cmd/controlplane/main.go
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Control Plane built -> bin/controlplane.exe" -ForegroundColor Green
} else {
    Write-Host "✗ Control Plane build failed" -ForegroundColor Red
    exit 1
}

# Build SFU Server
Write-Host "Building SFU Server..." -ForegroundColor Yellow
go build -o bin/whip-server.exe main.go server.go handlers.go models.go room.go broadcaster.go utils.go
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ SFU Server built -> bin/whip-server.exe" -ForegroundColor Green
} else {
    Write-Host "✗ SFU Server build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Build complete! Binaries are in the bin/ directory" -ForegroundColor Green
Write-Host ""
Write-Host "To run:"
Write-Host "  .\bin\controlplane.exe              # Start control plane"
Write-Host "  .\bin\whip-server.exe               # Start SFU server"
Write-Host ""
Write-Host "See CONTROL_PLANE.md for detailed instructions"
