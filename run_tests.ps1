# Run tests for all microservices using uv + Python 3.12
# Usage: .\run_tests.ps1
#        .\run_tests.ps1 auth-service         (single service)

param([string]$Service = "")

$all_services = @(
    "auth-service",
    "resort-service",
    "activity-service",
    "equipment-service",
    "hotel-service",
    "lesson-service",
    "skipass-service",
    "stats-service",
    "user-profile-service",
    "weather-service",
    "api-gateway"
)

$services = if ($Service) { @($Service) } else { $all_services }

$passed = @()
$failed = @()

foreach ($svc in $services) {
    Write-Host "`n=== $svc ===" -ForegroundColor Cyan
    Push-Location $svc
    uv run --python 3.12 --with-requirements requirements.txt --with pytest --with pytest-asyncio --with httpx pytest -v
    if ($LASTEXITCODE -eq 0) {
        $passed += $svc
    } else {
        $failed += $svc
    }
    Pop-Location
}

Write-Host "`n=== RESULTS ===" -ForegroundColor Yellow
Write-Host "PASSED ($($passed.Count)): $($passed -join ', ')" -ForegroundColor Green
if ($failed.Count -gt 0) {
    Write-Host "FAILED ($($failed.Count)): $($failed -join ', ')" -ForegroundColor Red
    exit 1
}
