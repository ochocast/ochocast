# Start cluster with Control Plane and multiple SFU servers

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Start Control Plane in the background
Write-Host "Starting Control Plane..." -ForegroundColor Cyan
$env:CONTROL_PLANE_PORT = "8090"
$ControlPlaneProcess = Start-Process -FilePath ".\bin\controlplane.exe" -PassThru -WindowStyle Minimized
Write-Host "Control Plane started (PID: $($ControlPlaneProcess.Id))" -ForegroundColor Green

# Wait for control plane to be ready
Start-Sleep -Seconds 2

# Start SFU 1
Write-Host "Starting SFU 1..." -ForegroundColor Cyan
$env:SFU_ID = "sfu-1"
$env:SFU_MODE = "hybrid"
$env:SERVER_URL = "http://localhost:8091"
$env:SERVER_PORT = "8091"
$env:CONTROL_PLANE_URL = "http://localhost:8090"
$env:SFU_REGION = "us-east"
$env:SFU_ZONE = "zone-a"
$SFU1Process = Start-Process -FilePath ".\bin\whip-server.exe" -PassThru -WindowStyle Minimized
Write-Host "SFU 1 started (PID: $($SFU1Process.Id))" -ForegroundColor Green

# Start SFU 2
Write-Host "Starting SFU 2..." -ForegroundColor Cyan
$env:SFU_ID = "sfu-2"
$env:SFU_MODE = "hybrid"
$env:SERVER_URL = "http://localhost:8092"
$env:SERVER_PORT = "8092"
$env:CONTROL_PLANE_URL = "http://localhost:8090"
$env:SFU_REGION = "us-east"
$env:SFU_ZONE = "zone-b"
$SFU2Process = Start-Process -FilePath ".\bin\whip-server.exe" -PassThru -WindowStyle Minimized
Write-Host "SFU 2 started (PID: $($SFU2Process.Id))" -ForegroundColor Green

# Start SFU 3
Write-Host "Starting SFU 3..." -ForegroundColor Cyan
$env:SFU_ID = "sfu-3"
$env:SFU_MODE = "hybrid"
$env:SERVER_URL = "http://localhost:8093"
$env:SERVER_PORT = "8093"
$env:CONTROL_PLANE_URL = "http://localhost:8090"
$env:SFU_REGION = "us-west"
$env:SFU_ZONE = "zone-a"
$SFU3Process = Start-Process -FilePath ".\bin\whip-server.exe" -PassThru -WindowStyle Minimized
Write-Host "SFU 3 started (PID: $($SFU3Process.Id))" -ForegroundColor Green

Write-Host ""
Write-Host "All services started!" -ForegroundColor Green
Write-Host "Control Plane: http://localhost:8090 (PID: $($ControlPlaneProcess.Id))"
Write-Host "SFU 1: http://localhost:8091 (PID: $($SFU1Process.Id))"
Write-Host "SFU 2: http://localhost:8092 (PID: $($SFU2Process.Id))"
Write-Host "SFU 3: http://localhost:8093 (PID: $($SFU3Process.Id))"
Write-Host ""
Write-Host "Process IDs saved to .pids file" -ForegroundColor Yellow
Write-Host "To stop all services, run: .\stop-cluster.ps1" -ForegroundColor Yellow

# Save PIDs to file
@"
$($ControlPlaneProcess.Id)
$($SFU1Process.Id)
$($SFU2Process.Id)
$($SFU3Process.Id)
"@ | Out-File -FilePath ".pids" -Encoding ASCII
