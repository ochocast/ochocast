# Stop all cluster services

if (Test-Path ".pids") {
    Write-Host "Stopping all services..." -ForegroundColor Cyan
    
    $pids = Get-Content ".pids"
    foreach ($processId in $pids) {
        if ($processId -match '^\d+$') {
            $pidNum = [int]$processId
            try {
                $process = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Host "Stopping process $pidNum..." -ForegroundColor Yellow
                    Stop-Process -Id $pidNum -Force
                    Write-Host "Process $pidNum stopped" -ForegroundColor Green
                } else {
                    Write-Host "Process $pidNum not found (may have already stopped)" -ForegroundColor Gray
                }
            } catch {
                Write-Host "Could not stop process $pidNum - $_" -ForegroundColor Red
            }
        }
    }
    
    Remove-Item ".pids"
    Write-Host "All services stopped." -ForegroundColor Green
} else {
    Write-Host "No .pids file found. Manually stop processes:" -ForegroundColor Yellow
    Write-Host "  Get-Process | Where-Object {`$_.ProcessName -match '(controlplane|whip-server)'}" -ForegroundColor Gray
    Write-Host ""
    
    # Try to find and stop the processes anyway
    $processes = Get-Process | Where-Object {$_.ProcessName -match '(controlplane|whip-server)'}
    if ($processes) {
        Write-Host "Found running processes:" -ForegroundColor Cyan
        $processes | Format-Table Id, ProcessName, StartTime -AutoSize
        
        $response = Read-Host "Stop these processes? (y/n)"
        if ($response -eq 'y' -or $response -eq 'Y') {
            $processes | Stop-Process -Force
            Write-Host "Processes stopped." -ForegroundColor Green
        }
    } else {
        Write-Host "No controlplane or whip-server processes found running." -ForegroundColor Green
    }
}
